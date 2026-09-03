import type { D1Database } from "@cloudflare/workers-types";
import { DeliveryService } from "./delivery-service";
import { ChannelRepository } from "./channel-repository";
import { parseKeyRing, decryptChannelConfig } from "./crypto";
import { PushDeerProvider } from "./providers/pushdeer";
import type { NotificationPayload } from "./providers/types";

interface OutboxMessage {
  body: { outboxId: string };
  ack: () => void;
  retry: () => void;
}

interface OutboxRow {
  id: string;
  user_id: string;
  channel_id: string;
  status: string;
  payload_json: string;
  match_fingerprints_json: string;
}

const pushDeer = new PushDeerProvider();

export async function handleQueueBatch(
  batch: { messages: readonly OutboxMessage[] },
  env: Env,
): Promise<void> {
  const db = env.APP_DB as D1Database;
  const service = new DeliveryService(db);
  const channels = new ChannelRepository(db);

  for (const message of batch.messages) {
    const now = new Date().toISOString();
    try {
      const claimed = await service.claimOutbox(message.body.outboxId, now);
      if (!claimed) {
        // Already sent (or stale) — nothing to do.
        message.ack();
        continue;
      }

      try {
        await deliver(claimed, db, channels, env);
        const fingerprints = JSON.parse(claimed.match_fingerprints_json) as string[];
        await service.markSent(claimed.id, fingerprints, now);
        await channels.clearDeliveryFailure(claimed.channel_id);
        message.ack();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`outbox ${claimed.id} delivery failed:`, reason);
        await service.markFailed(claimed.id, reason);
        // Surface provider/decrypt failures on the channel itself (last_error
        // + recent failure count) so the settings UI can warn the user.
        // Precondition failures (user disabled, channel deleted/disabled) are
        // not the channel's fault and must not pollute its last_error.
        if (!(err instanceof PreconditionError)) {
          try {
            const tracked = await channels.markDeliveryFailure(
              claimed.channel_id,
              reason,
              now,
            );
            if (tracked.recentFailures >= RECENT_FAILURE_WARN) {
              console.error(
                `channel ${claimed.channel_id} failed ${tracked.recentFailures} deliveries in the last 24h: ${tracked.lastError}`,
              );
            }
          } catch (trackErr) {
            console.error("channel failure tracking failed:", trackErr);
          }
        }
        // Terminal: the orchestrator only re-enqueues 'pending' rows.
        message.ack();
      }
    } catch (err) {
      console.error(`queue handler error for ${message.body.outboxId}:`, err);
      message.retry();
    }
  }
}

/** Failure before/at the provider boundary caused by state, not the channel. */
class PreconditionError extends Error {}

const RECENT_FAILURE_WARN = 10;

async function deliver(
  claimed: OutboxRow,
  db: D1Database,
  channels: ChannelRepository,
  env: Env,
): Promise<void> {
  // Re-validate user access — a disabled user must not receive pushes.
  const access = await db
    .prepare("SELECT status FROM user_access WHERE user_id = ?")
    .bind(claimed.user_id)
    .first<{ status: string }>();
  if (!access || access.status !== "active") {
    throw new PreconditionError("user access not active");
  }

  const channel = await channels.getById(claimed.channel_id);
  if (!channel) throw new PreconditionError("channel not found");
  if (!channel.enabled) throw new PreconditionError("channel disabled");
  if (!channel.verified_at) throw new PreconditionError("channel not verified");

  const keyRing = parseKeyRing(env.CHANNEL_ENCRYPTION_KEYS);
  const config = await decryptChannelConfig(keyRing, channel.encrypted_config);
  if (!config.pushKey) throw new PreconditionError("channel missing pushKey");

  const payload = JSON.parse(claimed.payload_json) as NotificationPayload;
  if (!payload.matches?.length) throw new PreconditionError("empty payload");

  await pushDeer.send(config, payload);
}
