import type { D1Database } from "@cloudflare/workers-types";
import type { SourceSyncStatus } from "./types";

export class SourceHealthRepository {
  constructor(private db: D1Database) {}

  async recordRun(
    id: string, source: string, status: SourceSyncStatus,
    slotCount: number, warnings: string[], durationMs: number,
    startedAt: string, finishedAt: string,
  ): Promise<void> {
    const summary = warnings.slice(0, 5).join("; ").slice(0, 500);
    await this.db.prepare(`
      INSERT INTO source_sync_run (id, source, status, slot_count, warning_summary, duration_ms, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, source, status, slotCount, summary, durationMs, startedAt, finishedAt).run();
  }

  async updateHealth(source: string, status: SourceSyncStatus, now: string, failureSummary?: string): Promise<{
    consecutiveFailures: number;
    shouldAlert: boolean;
  }> {
    const current = await this.db.prepare("SELECT * FROM source_health WHERE source = ?").bind(source).first<{
      consecutive_failures: number; failure_alerted_at: string | null;
    }>();

    let consecutive = current?.consecutive_failures ?? 0;
    let shouldAlert = false;

    if (status === "success") {
      consecutive = 0;
      shouldAlert = !!(current?.failure_alerted_at); // recovery alert
    } else if (status === "failed") {
      consecutive += 1;
      shouldAlert = consecutive === 3 && !current?.failure_alerted_at;
    }
    // "closed" doesn't change failure count

    await this.db.prepare(`
      INSERT INTO source_health (source, consecutive_failures, last_success_at, last_failure_at, failure_alerted_at, last_failure_summary, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        consecutive_failures = excluded.consecutive_failures,
        last_success_at = CASE WHEN excluded.last_success_at IS NOT NULL THEN excluded.last_success_at ELSE source_health.last_success_at END,
        last_failure_at = CASE WHEN excluded.last_failure_at IS NOT NULL THEN excluded.last_failure_at ELSE source_health.last_failure_at END,
        failure_alerted_at = CASE WHEN ? THEN ? ELSE source_health.failure_alerted_at END,
        last_failure_summary = excluded.last_failure_summary,
        updated_at = excluded.updated_at
    `).bind(
      source, consecutive,
      status === "success" ? now : null,
      status === "failed" ? now : null,
      shouldAlert ? now : null,
      failureSummary?.slice(0, 500) ?? null,
      now,
      shouldAlert ? 1 : 0,
      shouldAlert ? now : null,
    ).run();

    return { consecutiveFailures: consecutive, shouldAlert };
  }
}
