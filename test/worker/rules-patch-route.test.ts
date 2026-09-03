import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../ts/http/app";
import type { UserAccess } from "../../ts/app-db/types";

const SESSION_USER = {
  user: { id: "user-1", email: "test@example.com", name: "Test User", image: null },
  session: { id: "session-1", token: "token-1" },
};

function createAuthedApp() {
  return createApp({
    getSession: async () => SESSION_USER,
    ensureForLogin: async () =>
      ({
        userId: SESSION_USER.user.id,
        role: "user",
        status: "active",
        ruleLimit: 5,
        firstLoginAt: "2026-01-01T00:00:00.000Z",
        lastLoginAt: "2026-06-09T00:00:00.000Z",
        statusChangedAt: "2026-01-01T00:00:00.000Z",
        statusChangedBy: undefined,
      }) satisfies UserAccess,
  });
}

const JSON_POST = { "Content-Type": "application/json", Origin: "http://localhost" };

async function seedRule() {
  await env.APP_DB.prepare(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES ('user-1', 'T', 'test@example.com', 1, datetime('now'), datetime('now'))`
  ).run();
  await env.APP_DB.prepare(
    `INSERT OR REPLACE INTO user_access (user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at)
     VALUES ('user-1', 'user', 'active', 5, datetime('now'), datetime('now'), datetime('now'))`
  ).run();
  await env.APP_DB.prepare(
    `INSERT OR REPLACE INTO notification_rule (
       id, user_id, name, source, weekday_mask, timeslot_mask, facility_ids_json,
       min_consecutive, push_limit, enabled, created_at, updated_at
     ) VALUES ('rule-1', 'user-1', '老名字', 'usthing', 4, 8, '["2","3"]', 1, 3, 1, datetime('now'), datetime('now'))`
  ).run();
}

beforeEach(async () => {
  await env.APP_DB.prepare("DELETE FROM notification_rule").run();
  await env.APP_DB.prepare("DELETE FROM notification_channel").run();
  await env.APP_DB.prepare("DELETE FROM user_access").run();
  await env.APP_DB.prepare("DELETE FROM session").run();
  await env.APP_DB.prepare("DELETE FROM account").run();
  await env.APP_DB.prepare("DELETE FROM user").run();
});

describe("PATCH /api/rules/:id (zod v4 partial regression)", () => {
  it("renames a rule without crashing or clearing masks", async () => {
    await seedRule();
    const app = createAuthedApp();

    const res = await app.request(
      "/api/rules/rule-1",
      { method: "PATCH", headers: JSON_POST, body: JSON.stringify({ name: "新名字" }) },
      env,
    );
    expect(res.status).toBe(200);

    const row = await env.APP_DB
      .prepare("SELECT name, weekday_mask, timeslot_mask FROM notification_rule WHERE id = 'rule-1'")
      .first<{ name: string; weekday_mask: number; timeslot_mask: number }>();
    expect(row!.name).toBe("新名字");
    // Masks untouched by a name-only PATCH (the old .partial() would crash,
    // and a naive default-injecting partial would reset masks to 0).
    expect(row!.weekday_mask).toBe(4);
    expect(row!.timeslot_mask).toBe(8);
  });

  it("patches facilityIds within the same source", async () => {
    await seedRule();
    const app = createAuthedApp();

    const res = await app.request(
      "/api/rules/rule-1",
      { method: "PATCH", headers: JSON_POST, body: JSON.stringify({ facilityIds: ["4", "5"] }) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { facilityIds: string[] };
    expect(body.facilityIds).toEqual(["4", "5"]);
  });

  it("rejects facilities from a different source", async () => {
    await seedRule();
    const app = createAuthedApp();

    // rule-1 is usthing; 151 is a jiushi ground id.
    const res = await app.request(
      "/api/rules/rule-1",
      { method: "PATCH", headers: JSON_POST, body: JSON.stringify({ facilityIds: ["151"] }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 for an invalid partial field", async () => {
    await seedRule();
    const app = createAuthedApp();

    const res = await app.request(
      "/api/rules/rule-1",
      { method: "PATCH", headers: JSON_POST, body: JSON.stringify({ minConsecutive: 99 }) },
      env,
    );
    expect(res.status).toBe(400);
  });
});
