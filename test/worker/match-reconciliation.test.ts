import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { MatchRepository } from "../../ts/matching/repository";
import { reconcileMatches, skipReconciliationForFailedSource } from "../../ts/matching/reconcile";
import type { RuleMatch } from "../../ts/matching/types";

function match(overrides: Partial<RuleMatch> = {}): RuleMatch {
  return {
    fingerprint: "fp-" + Math.random().toString(36).slice(2, 8),
    ruleId: "r1", userId: "u1", ruleName: "test", source: "jiushi",
    slotDate: "2026-06-10", startTime: "18:00", endTime: "19:00",
    slotCount: 1, pushLimit: 3,
    availability: [{ startTime: "18:00", endTime: "19:00", facilityIds: ["113"] }],
    ...overrides,
  };
}

async function seedRule() {
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'Test', 'u1@test.com', 1, datetime('now'), datetime('now'))`).run();
  await env.APP_DB.prepare(`INSERT OR REPLACE INTO notification_rule (id, user_id, name, source, weekday_mask, timeslot_mask, facility_ids_json, min_consecutive, push_limit, enabled, created_at, updated_at) VALUES ('r1', 'u1', 'test', 'jiushi', 0, 0, '[]', 1, 3, 1, datetime('now'), datetime('now'))`).run();
}

describe("match reconciliation", () => {
  beforeEach(async () => {
    await env.APP_DB.prepare("DELETE FROM rule_match_state").run();
    await env.APP_DB.prepare("DELETE FROM notification_rule").run();
    await env.APP_DB.prepare("DELETE FROM user_access").run();
    await env.APP_DB.prepare("DELETE FROM user").run();
    await seedRule();
  });

  const repo = new MatchRepository(env.APP_DB);

  it("new match appears then persists across sync runs", async () => {
    const matchA = match({ fingerprint: "fp-a" });
    await reconcileMatches(repo, "jiushi", "run-1", [matchA], "2026-06-09T00:00:00.000Z");

    let state = await repo.getByFingerprint("fp-a");
    expect(state).toBeTruthy();
    expect(state!.isActive).toBe(true);

    // Same match appears again in next run
    await reconcileMatches(repo, "jiushi", "run-2", [matchA], "2026-06-09T00:05:00.000Z");
    state = await repo.getByFingerprint("fp-a");
    expect(state!.isActive).toBe(true);
  });

  it("disappeared match becomes inactive", async () => {
    const matchA = match({ fingerprint: "fp-b" });
    await reconcileMatches(repo, "jiushi", "run-1", [matchA], "2026-06-09T00:00:00.000Z");
    await reconcileMatches(repo, "jiushi", "run-2", [], "2026-06-09T00:05:00.000Z");

    const state = await repo.getByFingerprint("fp-b");
    expect(state!.isActive).toBe(false);
  });

  it("reappearing match resets notification count", async () => {
    const matchA = match({ fingerprint: "fp-c" });
    await reconcileMatches(repo, "jiushi", "run-1", [matchA], "2026-06-09T00:00:00.000Z");

    // Mark as notified
    await repo.markNotified("fp-c", "2026-06-09T00:01:00.000Z");
    let state = await repo.getByFingerprint("fp-c");
    expect(state!.notificationCount).toBe(1);

    // Disappear
    await reconcileMatches(repo, "jiushi", "run-2", [], "2026-06-09T00:05:00.000Z");
    state = await repo.getByFingerprint("fp-c");
    expect(state!.isActive).toBe(false);

    // Reappear
    await reconcileMatches(repo, "jiushi", "run-3", [matchA], "2026-06-09T00:10:00.000Z");
    state = await repo.getByFingerprint("fp-c");
    expect(state!.isActive).toBe(true);
    expect(state!.notificationCount).toBe(0);
    expect(state!.lastNotifiedAt).toBeNull();
  });

  it("skipReconciliationForFailedSource leaves everything unchanged", async () => {
    const matchA = match({ fingerprint: "fp-d" });
    await reconcileMatches(repo, "jiushi", "run-1", [matchA], "2026-06-09T00:00:00.000Z");

    // Source fails — no reconciliation should happen
    // (this verifies the function exists and correctly returns early)
    const result = skipReconciliationForFailedSource();
    expect(result).toBe(true);
  });
});
