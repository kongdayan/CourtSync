import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { isMatchEligible } from "../../ts/notifications/eligibility";

async function seedData() {
  // Create user and access
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Test', 'u1@test.com', 1, datetime('now'), datetime('now'))`).run();
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO user_access (user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at) VALUES ('u1', 'user', 'active', 5, datetime('now'), datetime('now'), datetime('now'))`).run();
  // Create rule
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO notification_rule (id, user_id, name, source, weekday_mask, timeslot_mask, facility_ids_json, min_consecutive, push_limit, enabled, created_at, updated_at) VALUES ('r1', 'u1', 'Rule 1', 'usthing', 0, 0, '[]', 1, 3, 1, datetime('now'), datetime('now'))`).run();
}

describe("isMatchEligible", () => {
  beforeEach(async () => {
    await env.APP_DB.prepare("DELETE FROM notification_outbox").run();
    await env.APP_DB.prepare("DELETE FROM rule_match_state").run();
    await env.APP_DB.prepare("DELETE FROM notification_channel").run();
    await env.APP_DB.prepare("DELETE FROM notification_rule").run();
    await env.APP_DB.prepare("DELETE FROM user_access").run();
    await env.APP_DB.prepare("DELETE FROM user").run();
    await seedData();
  });

  it("eligible active unreached match returns true", () => {
    const result = isMatchEligible(
      { isActive: true, notificationCount: 0, lastNotifiedAt: undefined },
      { pushLimit: 3, enabled: true },
      new Date("2026-06-09T00:00:00.000Z")
    );
    expect(result).toBe(true);
  });

  it("cooldown blocks recent delivery", () => {
    const result = isMatchEligible(
      { isActive: true, notificationCount: 1, lastNotifiedAt: "2026-06-09T00:15:00.000Z" },
      { pushLimit: 3, enabled: true },
      new Date("2026-06-09T00:30:00.000Z") // only 15 min ago
    );
    expect(result).toBe(false);
  });

  it("cooldown elapsed allows next delivery", () => {
    const result = isMatchEligible(
      { isActive: true, notificationCount: 1, lastNotifiedAt: "2026-06-09T00:00:00.000Z" },
      { pushLimit: 3, enabled: true },
      new Date("2026-06-09T00:35:00.000Z") // 35 min ago
    );
    expect(result).toBe(true);
  });

  it("inactive match is not eligible", () => {
    const result = isMatchEligible(
      { isActive: false, notificationCount: 0, lastNotifiedAt: undefined },
      { pushLimit: 3, enabled: true },
      new Date()
    );
    expect(result).toBe(false);
  });

  it("finite limit reached blocks delivery", () => {
    const result = isMatchEligible(
      { isActive: true, notificationCount: 3, lastNotifiedAt: undefined },
      { pushLimit: 3, enabled: true },
      new Date()
    );
    expect(result).toBe(false);
  });

  it("push limit -1 is unlimited", () => {
    const result = isMatchEligible(
      { isActive: true, notificationCount: 50, lastNotifiedAt: undefined },
      { pushLimit: -1, enabled: true },
      new Date()
    );
    expect(result).toBe(true);
  });

  it("disabled rule is not eligible", () => {
    const result = isMatchEligible(
      { isActive: true, notificationCount: 0, lastNotifiedAt: undefined },
      { pushLimit: 3, enabled: false },
      new Date()
    );
    expect(result).toBe(false);
  });
});
