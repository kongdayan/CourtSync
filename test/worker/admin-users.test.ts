import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminRepository } from "../../ts/app-db/admin-repository";

async function seedUser(id: string, email: string, status = "active", role = "user", ruleLimit = 2) {
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`).bind(id, `User ${id}`, email).run();
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO user_access (user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`).bind(id, role, status, ruleLimit).run();
}

describe("AdminRepository", () => {
  const repo = new AdminRepository(env.APP_DB);

  beforeEach(async () => {
    await env.APP_DB.prepare("DELETE FROM admin_audit_log").run();
    await env.APP_DB.prepare("DELETE FROM notification_rule").run();
    await env.APP_DB.prepare("DELETE FROM notification_channel").run();
    await env.APP_DB.prepare("DELETE FROM user_access").run();
    await env.APP_DB.prepare("DELETE FROM session").run();
    await env.APP_DB.prepare("DELETE FROM account").run();
    await env.APP_DB.prepare("DELETE FROM user").run();
  });

  it("approves a pending user and creates an audit row", async () => {
    await seedUser("target-1", "target@test.com", "pending", "user");
    await seedUser("admin-1", "admin@test.com", "active", "admin");

    const result = await repo.updateAccess("admin-1", "target-1", {
      status: "active",
      requestId: "req-1",
      now: "2026-06-09T00:00:00.000Z",
    });

    expect(result.status).toBe("active");
    expect(result.statusChangedBy).toBe("admin-1");

    const logs = await repo.getAuditLogs("target-1");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "approve_user", actorUserId: "admin-1" });
  });

  it("disables a user and deletes their sessions", async () => {
    await seedUser("target-2", "target2@test.com", "active", "user");
    await seedUser("admin-1", "admin@test.com", "active", "admin");
    // Create sessions for target
    await env.APP_DB.prepare(`INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('s1', datetime('now', '+1 day'), 'tok1', datetime('now'), datetime('now'), 'target-2')`).run();
    await env.APP_DB.prepare(`INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('s2', datetime('now', '+1 day'), 'tok2', datetime('now'), datetime('now'), 'target-2')`).run();

    await repo.updateAccess("admin-1", "target-2", {
      status: "disabled",
      requestId: "req-2",
      now: "2026-06-09T00:00:00.000Z",
    });

    const sessions = await env.APP_DB.prepare("SELECT COUNT(*) as c FROM session WHERE userId = 'target-2'").first<{ c: number }>();
    expect(sessions?.c).toBe(0);
  });

  it("lists users with rule counts", async () => {
    await seedUser("user-a", "a@test.com", "active", "user", 5);
    await env.APP_DB.prepare(`INSERT INTO notification_rule (id, user_id, name, source, weekday_mask, timeslot_mask, facility_ids_json, min_consecutive, push_limit, enabled, created_at, updated_at) VALUES ('r1', 'user-a', 'Rule 1', 'usthing', 0, 0, '[]', 1, 3, 1, datetime('now'), datetime('now'))`).run();
    await env.APP_DB.prepare(`INSERT INTO notification_rule (id, user_id, name, source, weekday_mask, timeslot_mask, facility_ids_json, min_consecutive, push_limit, enabled, created_at, updated_at) VALUES ('r2', 'user-a', 'Rule 2', 'jiushi', 0, 0, '[]', 1, 1, 1, datetime('now'), datetime('now'))`).run();

    const users = await repo.listUsers({});
    const userA = users.find(u => u.id === "user-a");
    expect(userA).toBeDefined();
    expect(userA!.ruleCount).toBe(2);
    expect(userA!.ruleLimit).toBe(5);
  });
});
