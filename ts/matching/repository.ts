import type { D1Database } from "@cloudflare/workers-types";
import type { RuleMatch } from "./types";

interface MatchStateRow {
  fingerprint: string; rule_id: string; user_id: string; source: string;
  slot_date: string; start_time: string; end_time: string; availability_json: string;
  is_active: number; notification_count: number; last_notified_at: string | null;
  first_seen_at: string; last_seen_at: string; last_sync_run_id: string;
}

export class MatchRepository {
  constructor(private db: D1Database) {}

  async getByFingerprint(fp: string) {
    const row = await this.db.prepare("SELECT * FROM rule_match_state WHERE fingerprint = ?").bind(fp).first<MatchStateRow>();
    if (!row) return null;
    return {
      fingerprint: row.fingerprint, ruleId: row.rule_id, userId: row.user_id,
      source: row.source, slotDate: row.slot_date, startTime: row.start_time,
      endTime: row.end_time, availabilityJson: row.availability_json,
      isActive: row.is_active === 1, notificationCount: row.notification_count,
      lastNotifiedAt: row.last_notified_at, firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at, lastSyncRunId: row.last_sync_run_id,
    };
  }

  async upsertMatch(match: RuleMatch, syncRunId: string, now: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO rule_match_state (
        fingerprint, rule_id, user_id, source, slot_date, start_time, end_time,
        availability_json, is_active, notification_count, first_seen_at,
        last_seen_at, last_sync_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        notification_count = CASE WHEN rule_match_state.is_active = 0 THEN 0 ELSE rule_match_state.notification_count END,
        last_notified_at = CASE WHEN rule_match_state.is_active = 0 THEN NULL ELSE rule_match_state.last_notified_at END,
        first_seen_at = CASE WHEN rule_match_state.is_active = 0 THEN excluded.first_seen_at ELSE rule_match_state.first_seen_at END,
        is_active = 1,
        last_seen_at = excluded.last_seen_at,
        last_sync_run_id = excluded.last_sync_run_id
    `).bind(
      match.fingerprint, match.ruleId, match.userId, match.source,
      match.slotDate, match.startTime, match.endTime,
      JSON.stringify(match.availability), now, now, syncRunId
    ).run();
  }

  async deactivateUnseen(source: string, ruleIds: string[], currentRunId: string): Promise<void> {
    if (ruleIds.length === 0) {
      // No rules had matches — deactivate all matches for this source
      // that were not seen in the current sync run
      await this.db.prepare(`
        UPDATE rule_match_state SET is_active = 0
        WHERE source = ? AND last_sync_run_id != ?
      `).bind(source, currentRunId).run();
      return;
    }
    const placeholders = ruleIds.map(() => "?").join(",");
    await this.db.prepare(`
      UPDATE rule_match_state SET is_active = 0
      WHERE source = ? AND rule_id IN (${placeholders})
        AND last_sync_run_id != ?
    `).bind(source, ...ruleIds, currentRunId).run();
  }

  async markNotified(fingerprint: string, now: string): Promise<void> {
    await this.db.prepare(`
      UPDATE rule_match_state SET notification_count = notification_count + 1, last_notified_at = ?
      WHERE fingerprint = ?
    `).bind(now, fingerprint).run();
  }
}
