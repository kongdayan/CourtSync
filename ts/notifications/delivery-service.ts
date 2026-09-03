import type { D1Database } from "@cloudflare/workers-types";

interface OutboxRow {
  id: string; user_id: string; channel_id: string; status: string;
  sync_run_id: string; payload_json: string; match_fingerprints_json: string;
}

export class DeliveryService {
  constructor(private db: D1Database) {}

  async claimOutbox(id: string, now: string): Promise<OutboxRow | null> {
    const staleCutoff = new Date(new Date(now).getTime() - 10 * 60 * 1000).toISOString();
    return this.db.prepare(`
      UPDATE notification_outbox
      SET status = 'sending', sending_started_at = ?, attempt_count = attempt_count + 1
      WHERE id = ? AND status != 'sent'
        AND (status IN ('pending', 'failed') OR (status = 'sending' AND sending_started_at < ?))
      RETURNING *
    `).bind(now, id, staleCutoff).first<OutboxRow>() ?? null;
  }

  async markSent(outboxId: string, fingerprints: string[], now: string): Promise<void> {
    const batch: any[] = [
      this.db.prepare(`UPDATE notification_outbox SET status = 'sent', sent_at = ? WHERE id = ?`).bind(now, outboxId),
    ];
    for (const fp of fingerprints) {
      batch.push(this.db.prepare(
        `UPDATE rule_match_state SET notification_count = notification_count + 1, last_notified_at = ? WHERE fingerprint = ?`
      ).bind(now, fp));
    }
    await this.db.batch(batch);
  }

  async markFailed(outboxId: string, error: string): Promise<void> {
    await this.db.prepare(
      `UPDATE notification_outbox SET status = 'failed', last_error = ? WHERE id = ?`
    ).bind(error, outboxId).run();
  }
}
