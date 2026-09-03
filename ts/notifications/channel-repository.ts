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

  async delete(userId: string, provider: string): Promise<boolean> {
    const result = await this.db.prepare(
      "DELETE FROM notification_channel WHERE user_id = ? AND provider = ?"
    ).bind(userId, provider).run();
    return result.meta.changes > 0;
  }
}
