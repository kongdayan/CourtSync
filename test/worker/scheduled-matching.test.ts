import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runScheduledSync } from "../../ts/sync/orchestrator";
import type { UnifiedTimeSlot } from "../../ts/types";
import type { TimeslotSyncResult } from "../../ts/sync/run";

function makeSlot(
  facilityId: string,
  date: string,
  start: string,
  end: string,
): UnifiedTimeSlot {
  return {
    FacilityID: facilityId,
    Date: date,
    StartTime: start,
    EndTime: end,
    Status: "available",
    ActivityName: "Badminton",
  };
}

const MOCK_NOW = "2026-06-09T12:00:00.000Z";

const usthingSlots: UnifiedTimeSlot[] = [
  makeSlot("2", "2026-06-10", "10:00", "11:00"),
  makeSlot("2", "2026-06-10", "11:00", "12:00"),
];

const commonSyncFields = {
  warnings: [] as string[],
  startDate: "2026-06-09",
  endDate: "2026-06-23",
  generatedAt: new Date("2026-06-09T12:00:00.000Z"),
};

function makeMockSyncFn(): (source: string, env: any) => Promise<TimeslotSyncResult> {
  return vi.fn(async (source: string) => {
    if (source === "usthing") {
      return {
        source: "usthing" as const,
        status: "success" as const,
        slots: usthingSlots,
        ...commonSyncFields,
      };
    }
    return {
      source: "jiushi" as const,
      status: "success" as const,
      slots: [],
      ...commonSyncFields,
    };
  });
}

async function seedData() {
  await env.APP_DB.prepare(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Test', 'u1@test.com', 1, '${MOCK_NOW}', '${MOCK_NOW}')`,
  ).run();
  await env.APP_DB.prepare(
    `INSERT OR REPLACE INTO user_access (user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at) VALUES ('u1', 'user', 'active', 5, '${MOCK_NOW}', '${MOCK_NOW}', '${MOCK_NOW}')`,
  ).run();
  await env.APP_DB.prepare(
    `INSERT OR REPLACE INTO notification_rule (id, user_id, name, source, weekday_mask, timeslot_mask, facility_ids_json, min_consecutive, push_limit, enabled, created_at, updated_at) VALUES ('r1', 'u1', 'Rule 1', 'usthing', 0, 0, '[]', 1, -1, 1, '${MOCK_NOW}', '${MOCK_NOW}')`,
  ).run();
  await env.APP_DB.prepare(
    `INSERT OR REPLACE INTO notification_channel (id, user_id, provider, encrypted_config, destination_mask, config_fingerprint, verified_at, enabled, created_at, updated_at) VALUES ('ch1', 'u1', 'pushdeer', 'v1.v1.aaaa.bbbb', 'PDU1****cret', 'fp1', '${MOCK_NOW}', 1, '${MOCK_NOW}', '${MOCK_NOW}')`,
  ).run();
}

describe("scheduled orchestrator", () => {
  let mockSyncFn: ReturnType<typeof makeMockSyncFn>;

  beforeEach(async () => {
    await env.APP_DB.prepare("DELETE FROM notification_outbox").run();
    await env.APP_DB.prepare("DELETE FROM rule_match_state").run();
    await env.APP_DB.prepare("DELETE FROM source_sync_run").run();
    await env.APP_DB.prepare("DELETE FROM source_health").run();
    await env.APP_DB.prepare("DELETE FROM notification_channel").run();
    await env.APP_DB.prepare("DELETE FROM notification_rule").run();
    await env.APP_DB.prepare("DELETE FROM user_access").run();
    await env.APP_DB.prepare("DELETE FROM user").run();
    await seedData();
    mockSyncFn = makeMockSyncFn();
  });

  it("completes a full scheduled sync without crashing", async () => {
    await expect(
      runScheduledSync(env as any, new Date(MOCK_NOW), mockSyncFn),
    ).resolves.toBeUndefined();
  });

  it("records source health after sync", async () => {
    await runScheduledSync(env as any, new Date(MOCK_NOW), mockSyncFn);
    const health = await env.APP_DB.prepare("SELECT * FROM source_health").all();
    expect(health.results.length).toBeGreaterThan(0);
  });

  it("creates outbox entries for matched rules", async () => {
    await runScheduledSync(env as any, new Date(MOCK_NOW), mockSyncFn);
    const outboxEntries = await env.APP_DB.prepare(
      "SELECT * FROM notification_outbox",
    ).all();
    expect(outboxEntries.results.length).toBe(1);

    const outbox = outboxEntries.results[0] as any;
    expect(outbox.user_id).toBe("u1");
    expect(outbox.channel_id).toBe("ch1");
    expect(outbox.status).toBe("pending");
  });

  it("creates rule_match_state entries for matched slots", async () => {
    await runScheduledSync(env as any, new Date(MOCK_NOW), mockSyncFn);
    const matchStates = await env.APP_DB.prepare(
      "SELECT * FROM rule_match_state",
    ).all();
    expect(matchStates.results.length).toBeGreaterThan(0);
  });
});
