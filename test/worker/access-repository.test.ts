import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { AccessRepository } from "../../ts/app-db/access-repository";

describe("AccessRepository", () => {
  beforeEach(async () => {
    await env.APP_DB.prepare("DELETE FROM user_access").run();
    await env.APP_DB.prepare("DELETE FROM session").run();
    await env.APP_DB.prepare("DELETE FROM account").run();
    await env.APP_DB.prepare("DELETE FROM user").run();
  });

  it("creates normal users as pending with the default rule limit", async () => {
    // Arrange: seed a user in the user table (Better Auth creates this at login)
    await env.APP_DB.prepare(
      "INSERT INTO user (id, name, email) VALUES (?, ?, ?)"
    ).bind("user-1", "Friend User", "friend@example.com").run();

    const repo = new AccessRepository(env.APP_DB);
    const access = await repo.ensureForLogin({
      userId: "user-1",
      email: "friend@example.com",
      adminEmails: new Set(["admin@example.com"]),
      defaultRuleLimit: 2,
      adminRuleLimit: 20,
      now: "2026-06-09T00:00:00.000Z",
    });

    expect(access).toMatchObject({ role: "user", status: "pending", ruleLimit: 2 });
  });

  it("promotes secret-listed emails to active administrators", async () => {
    // Arrange: seed a user in the user table (Better Auth creates this at login)
    await env.APP_DB.prepare(
      "INSERT INTO user (id, name, email) VALUES (?, ?, ?)"
    ).bind("admin-1", "Admin User", "admin@example.com").run();

    const repo = new AccessRepository(env.APP_DB);
    const access = await repo.ensureForLogin({
      userId: "admin-1",
      email: "ADMIN@example.com",
      adminEmails: new Set(["admin@example.com"]),
      defaultRuleLimit: 2,
      adminRuleLimit: 20,
      now: "2026-06-09T00:00:00.000Z",
    });

    expect(access).toMatchObject({ role: "admin", status: "active", ruleLimit: 20 });
  });
});
