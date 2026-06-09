import type { D1Database } from "@cloudflare/workers-types";

export class OutboxRepository {
  constructor(private db: D1Database) {}

  async insertOutbox(
    userId: string,
    channelId: string,
    syncRunId: string,
    payloadJson: string,
    matchFingerprintsJson: string,
    now: string,
  ): Promise<string | null> {
    const id = crypto.randomUUID();
    const result = await this.db.prepare(`
      INSERT OR IGNORE INTO notification_outbox (id, user_id, channel_id, sync_run_id, payload_json, match_fingerprints_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      RETURNING id
    `).bind(id, userId, channelId, syncRunId, payloadJson, matchFingerprintsJson, now).first<{ id: string }>();
    return result?.id ?? null;
  }

  async getPendingOlderThan(now: string, limit = 100): Promise<{ id: string }[]> {
    const result = await this.db.prepare(
      "SELECT id FROM notification_outbox WHERE status = 'pending' AND created_at < ? ORDER BY created_at LIMIT ?"
    ).bind(now, limit).all<{ id: string }>();
    return result.results;
  }
}
