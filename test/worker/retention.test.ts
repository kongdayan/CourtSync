import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { runRetentionCleanup } from "../../ts/sync/retention";

const NOW = new Date("2026-09-03T03:00:00Z");
const OLD = "2026-07-01T00:00:00.000Z"; // 64 days old
const FRESH = "2026-08-20T00:00:00.000Z"; // 14 days old

beforeEach(async () => {
  await env.APP_DB.prepare("DELETE FROM kv_meta").run();
  await env.APP_DB.prepare("DELETE FROM source_sync_run").run();
  await env.APP_DB.prepare("DELETE FROM notification_outbox").run();
  await env.APP_DB.prepare("DELETE FROM rule_match_state").run();
  await env.APP_DB.prepare("DELETE FROM notification_channel").run();
  await env.APP_DB.prepare("DELETE FROM notification_rule").run();
  await env.APP_DB.prepare("DELETE FROM user").run();
});

async function seed() {
  // Parent rows first (FKs)
  await env.APP_DB.prepare(
    "INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'T', 'u1@test.com', 1, datetime('now'), datetime('now'))"
  ).run();
  await env.APP_DB.prepare(
    "INSERT OR REPLACE INTO notification_rule (id, user_id, name, source, weekday_mask, timeslot_mask, facility_ids_json, min_consecutive, push_limit, enabled, created_at, updated_at) VALUES ('r1', 'u1', 'Rule 1', 'usthing', 0, 0, '[]', 1, 3, 1, datetime('now'), datetime('now'))"
  ).run();
  await env.APP_DB.prepare(
    "INSERT OR REPLACE INTO notification_channel (id, user_id, provider, encrypted_config, destination_mask, config_fingerprint, verified_at, enabled, created_at, updated_at) VALUES ('ch1', 'u1', 'pushdeer', 'v1.v1.a.b', 'mask', 'fp', datetime('now'), 1, datetime('now'), datetime('now'))"
  ).run();

  // source_sync_run: one old, one fresh
  await env.APP_DB.prepare(
    "INSERT INTO source_sync_run (id, source, status, slot_count, warning_summary, duration_ms, started_at, finished_at) VALUES ('old', 'usthing', 'failed', 0, '', 10, ?, ?)"
  ).bind(OLD, OLD).run();
  await env.APP_DB.prepare(
    "INSERT INTO source_sync_run (id, source, status, slot_count, warning_summary, duration_ms, started_at, finished_at) VALUES ('fresh', 'usthing', 'success', 100, '', 10, ?, ?)"
  ).bind(FRESH, FRESH).run();

  // rule_match_state: old inactive (delete), fresh inactive (keep), old ACTIVE (keep)
  await env.APP_DB.prepare(
    "INSERT INTO rule_match_state (fingerprint, rule_id, user_id, source, slot_date, start_time, end_time, availability_json, is_active, notification_count, first_seen_at, last_seen_at, last_sync_run_id) VALUES ('old-inactive', 'r1', 'u1', 'usthing', '2026-07-01', '18:00', '19:00', '[]', 0, 0, ?, ?, 's1')"
  ).bind(OLD, OLD).run();
  await env.APP_DB.prepare(
    "INSERT INTO rule_match_state (fingerprint, rule_id, user_id, source, slot_date, start_time, end_time, availability_json, is_active, notification_count, first_seen_at, last_seen_at, last_sync_run_id) VALUES ('fresh-inactive', 'r1', 'u1', 'usthing', '2026-08-20', '18:00', '19:00', '[]', 0, 0, ?, ?, 's1')"
  ).bind(FRESH, FRESH).run();
  await env.APP_DB.prepare(
    "INSERT INTO rule_match_state (fingerprint, rule_id, user_id, source, slot_date, start_time, end_time, availability_json, is_active, notification_count, first_seen_at, last_seen_at, last_sync_run_id) VALUES ('old-active', 'r1', 'u1', 'usthing', '2026-07-01', '18:00', '19:00', '[]', 1, 0, ?, ?, 's1')"
  ).bind(OLD, OLD).run();

  // outbox
  await env.APP_DB.prepare(
    "INSERT INTO notification_outbox (id, user_id, channel_id, sync_run_id, payload_json, match_fingerprints_json, status, created_at) VALUES ('ob-old', 'u1', 'ch1', 's1', '{}', '[]', 'sent', ?)"
  ).bind(OLD).run();
  await env.APP_DB.prepare(
    "INSERT INTO notification_outbox (id, user_id, channel_id, sync_run_id, payload_json, match_fingerprints_json, status, created_at) VALUES ('ob-fresh', 'u1', 'ch1', 's2', '{}', '[]', 'pending', ?)"
  ).bind(FRESH).run();
}

async function count(table: string): Promise<number> {
  const row = await env.APP_DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row!.n;
}

describe("runRetentionCleanup", () => {
  it("deletes rows older than 30 days, keeps fresh and active rows", async () => {
    await seed();
    const result = await runRetentionCleanup(env.APP_DB, NOW);

    expect(result.ran).toBe(true);
    expect(result.deleted).toEqual({
      source_sync_run: 1,
      notification_outbox: 1,
      rule_match_state: 1,
    });
    expect(await count("source_sync_run")).toBe(1);
    expect(await count("notification_outbox")).toBe(1);
    expect(await count("rule_match_state")).toBe(2);

    const remaining = await env.APP_DB
      .prepare("SELECT fingerprint FROM rule_match_state ORDER BY fingerprint")
      .all<{ fingerprint: string }>();
    expect(remaining.results.map((r) => r.fingerprint)).toEqual(["fresh-inactive", "old-active"]);
  });

  it("skips when last cleanup was less than 24h ago", async () => {
    await seed();
    await runRetentionCleanup(env.APP_DB, NOW);

    const again = await runRetentionCleanup(env.APP_DB, new Date(NOW.getTime() + 3600_000));
    expect(again.ran).toBe(false);
    expect(again.deleted).toEqual({});
    // Nothing further deleted on the throttled pass
    expect(await count("source_sync_run")).toBe(1);
  });

  it("runs again after 24h", async () => {
    await seed();
    await runRetentionCleanup(env.APP_DB, NOW);

    const later = new Date(NOW.getTime() + 25 * 3600_000);
    const again = await runRetentionCleanup(env.APP_DB, later);
    expect(again.ran).toBe(true);
    expect(again.deleted).toEqual({ source_sync_run: 0, notification_outbox: 0, rule_match_state: 0 });
  });
});
