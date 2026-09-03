import type { D1Database } from "@cloudflare/workers-types";

export interface ChannelRow {
  id: string;
  user_id: string;
  provider: string;
  encrypted_config: string;
  destination_mask: string;
  config_fingerprint: string;
  verified_at: string;
  enabled: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class ChannelRepository {
  constructor(private db: D1Database) {}

  async getById(id: string): Promise<ChannelRow | null> {
    return this.db
      .prepare("SELECT * FROM notification_channel WHERE id = ?")
      .bind(id)
      .first<ChannelRow>() ?? null;
  }

  async getByUserAndProvider(userId: string, provider: string): Promise<ChannelRow | null> {
    return this.db.prepare(
      "SELECT * FROM notification_channel WHERE user_id = ? AND provider = ?"
    ).bind(userId, provider).first<ChannelRow>() ?? null;
  }

  async listByUser(userId: string): Promise<ChannelRow[]> {
    const result = await this.db.prepare(
      "SELECT * FROM notification_channel WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(userId).all<ChannelRow>();
    return result.results;
  }

  async upsert(
    userId: string,
    provider: string,
    encryptedConfig: string,
    destinationMask: string,
    configFingerprint: string,
    enabled: boolean,
    now: string
  ): Promise<ChannelRow> {
    const id = crypto.randomUUID();
    await this.db.prepare(`
      INSERT INTO notification_channel (
        id, user_id, provider, encrypted_config, destination_mask,
        config_fingerprint, verified_at, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET
        encrypted_config = excluded.encrypted_config,
        destination_mask = excluded.destination_mask,
        config_fingerprint = excluded.config_fingerprint,
        verified_at = excluded.verified_at,
        enabled = excluded.enabled,
        last_error = NULL,
        updated_at = excluded.updated_at
    `).bind(id, userId, provider, encryptedConfig, destinationMask, configFingerprint, now, enabled ? 1 : 0, now, now).run();

    // Return the inserted or updated row
    return (await this.db.prepare(
      "SELECT * FROM notification_channel WHERE user_id = ? AND provider = ?"
    ).bind(userId, provider).first<ChannelRow>())!;
  }

  /** Clears a previously recorded delivery failure after a successful send. */
  async clearDeliveryFailure(channelId: string): Promise<void> {
    await this.db
      .prepare("UPDATE notification_channel SET last_error = NULL WHERE id = ? AND last_error IS NOT NULL")
      .bind(channelId)
      .run();
  }

  /**
   * Records a delivery failure on a channel so the UI can surface it.
   * Never disables the channel automatically — auto-disabling on transient
   * provider errors would silently kill the user's notifications.
   * Returns recent failure count (best-effort consecutive proxy) within the
   * lookback window so callers/tests can alert on repeated failures.
   */
  async markDeliveryFailure(
    channelId: string,
    error: string,
    now: string,
    recentWindowMs = 24 * 3600_000,
  ): Promise<{ lastError: string; recentFailures: number }> {
    const lastError = error.slice(0, 200);
    const since = new Date(new Date(now).getTime() - recentWindowMs).toISOString();
    await this.db.prepare(
      "UPDATE notification_channel SET last_error = ?, updated_at = ? WHERE id = ?"
    ).bind(lastError, now, channelId).run();
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM notification_outbox WHERE channel_id = ? AND status = 'failed' AND created_at >= ?"
      )
      .bind(channelId, since)
      .first<{ n: number }>();
    return { lastError, recentFailures: row?.n ?? 0 };
  }

  async delete(userId: string, provider: string): Promise<boolean> {
    const result = await this.db.prepare(
      "DELETE FROM notification_channel WHERE user_id = ? AND provider = ?"
    ).bind(userId, provider).run();
    return result.meta.changes > 0;
  }
}
