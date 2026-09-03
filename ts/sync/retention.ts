import type { D1Database } from "@cloudflare/workers-types";

/**
 * 30-day retention cleanup for operational tables (design doc:
 * "Operational and inactive match/outbox records are retained for 30 days,
 * then removed by scheduled cleanup").
 *
 * Runs at most once per 24h (throttle stored in kv_meta) and uses bounded
 * chunked deletes so a single cron cycle never issues one huge DELETE.
 */

const RETENTION_DAYS = 30;
const MIN_AGE_HOURS = 24;
const CHUNK_SIZE = 500;
const MAX_CHUNKS_PER_TABLE = 20; // cap: 10k rows deleted per table per run
const LAST_CLEANUP_KEY = "retention:last_cleanup";

interface RetentionTarget {
  table: string;
  column: string;
  extra?: string;
}

const TARGETS: RetentionTarget[] = [
  { table: "source_sync_run", column: "started_at" },
  { table: "notification_outbox", column: "created_at" },
  // Inactive match states only — active ones are refreshed on every sync.
  { table: "rule_match_state", column: "last_seen_at", extra: "AND is_active = 0" },
];

export interface RetentionResult {
  ran: boolean;
  deleted: Record<string, number>;
}

export async function runRetentionCleanup(
  db: D1Database,
  now: Date,
): Promise<RetentionResult> {
  const deleted: Record<string, number> = {};

  // Daily throttle.
  const last = await db
    .prepare("SELECT value FROM kv_meta WHERE key = ?")
    .bind(LAST_CLEANUP_KEY)
    .first<{ value: string }>();

  if (last) {
    const lastTime = new Date(last.value).getTime();
    if (!Number.isNaN(lastTime) && now.getTime() - lastTime < MIN_AGE_HOURS * 3600_000) {
      return { ran: false, deleted };
    }
  }

  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 3600_000).toISOString();

  for (const target of TARGETS) {
    const sql = `
      DELETE FROM ${target.table}
      WHERE ${target.column} < ? ${target.extra ?? ""}
      LIMIT ?
    `;
    let total = 0;
    for (let i = 0; i < MAX_CHUNKS_PER_TABLE; i++) {
      const result = await db.prepare(sql).bind(cutoff, CHUNK_SIZE).run();
      const changes = result.meta.changes;
      total += changes;
      if (changes < CHUNK_SIZE) break;
    }
    deleted[target.table] = total;
  }

  await db.prepare(
    "INSERT INTO kv_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(LAST_CLEANUP_KEY, now.toISOString(), now.toISOString()).run();

  return { ran: true, deleted };
}
