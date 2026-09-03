import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { RuleRepository } from "../../ts/rules/repository";
import { RuleService } from "../../ts/rules/service";
import type { CompiledRule } from "../../ts/rules/schema";

function validRule(name: string, overrides?: Partial<CompiledRule>): CompiledRule {
  return {
    name,
    source: "usthing",
    weekdayMask: 0,
    timeslotMask: 0,
    facilityIds: [],
    minConsecutive: 1,
    pushLimit: 3,
    enabled: true,
    ...overrides,
  };
}

async function seedUser(userId: string, status = "active", ruleLimit = 2) {
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`).bind(userId, `Test ${userId}`, `${userId}@test.com`).run();
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO user_access (user_id, role, status, rule_limit, first_login_at, last_login_at, status_changed_at) VALUES (?, 'user', ?, ?, datetime('now'), datetime('now'), datetime('now'))`).bind(userId, status, ruleLimit).run();
}

describe("RuleService", () => {
  const repo = new RuleRepository(env.APP_DB);
  const service = new RuleService(repo, env.APP_DB);

  beforeEach(async () => {
    await env.APP_DB.prepare("DELETE FROM notification_rule").run();
    await env.APP_DB.prepare("DELETE FROM user_access").run();
    await env.APP_DB.prepare("DELETE FROM session").run();
    await env.APP_DB.prepare("DELETE FROM account").run();
    await env.APP_DB.prepare("DELETE FROM user").run();
  });

  it("enforces quota and disabled rules still count", async () => {
    await seedUser("user-1", "active", 2);
    const first = await service.create("user-1", validRule("one"));
    const second = await service.create("user-1", validRule("two"));
    await expect(service.create("user-1", validRule("three"))).rejects.toMatchObject({ code: "rule_limit_reached" });

    await service.update("user-1", first.id, { enabled: false });
    await expect(service.create("user-1", validRule("still blocked"))).rejects.toMatchObject({ code: "rule_limit_reached" });
  });

  it("prevents cross-user access", async () => {
    await seedUser("user-1", "active", 3);
    await seedUser("user-2", "active", 3);
    const rule = await service.create("user-1", validRule("my rule"));
    await expect(service.update("user-2", rule.id, { name: "stolen" })).rejects.toMatchObject({ code: "rule_not_found" });
  });
});
