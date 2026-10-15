import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { createJiushiSyncTriggerRoutes } from "../../ts/http/routes/jiushi-sync-trigger";
import { publishSlotsSnapshot } from "../../ts/cache/slots-snapshot";
import type { TimeslotSyncResult } from "../../ts/sync/run";

const secret = "source-specific-machine-token";
const result: TimeslotSyncResult = {
  source: "jiushi", status: "success", warnings: [],
  startDate: "2026-10-18", endDate: "2026-10-18", generatedAt: new Date(),
  slots: [{ FacilityID: "test", Date: "2026-10-18", StartTime: "18:00", EndTime: "19:00", Status: "Available", ActivityName: "court" }],
};

describe("Jiushi machine sync trigger", () => {
  it("rejects missing or incorrect credentials without starting a sync", async () => {
    const sync = vi.fn().mockResolvedValue(result);
    const app = createJiushiSyncTriggerRoutes(sync);
    for (const token of ["", "Bearer bad", `Bearer ${"x".repeat(secret.length)}`]) {
      const res = await app.fetch(new Request("https://example.test/internal/sync/jiushi", {
        method: "POST", headers: { Authorization: token },
      }), { ...env, JIUSHI_SYNC_TRIGGER_SECRET: secret });
      expect(res.status).toBe(401);
    }
    expect(sync).not.toHaveBeenCalled();
  });

  it("fails closed when the trigger is not configured", async () => {
    const sync = vi.fn().mockResolvedValue(result);
    const res = await createJiushiSyncTriggerRoutes(sync).fetch(
      new Request("https://example.test/internal/sync/jiushi", { method: "POST" }),
      { ...env, JIUSHI_SYNC_TRIGGER_SECRET: "" },
    );
    expect(res.status).toBe(503);
    expect(sync).not.toHaveBeenCalled();
  });

  it("runs only Jiushi with the correct machine token", async () => {
    const sync = vi.fn().mockResolvedValue(result);
    const bindings = { ...env, JIUSHI_SYNC_TRIGGER_SECRET: secret };
    const res = await createJiushiSyncTriggerRoutes(sync).fetch(
      new Request("https://example.test/internal/sync/jiushi", {
        method: "POST", headers: { Authorization: `Bearer ${secret}` },
      }), bindings,
    );
    expect(res.status).toBe(200);
    expect(sync).toHaveBeenCalledWith("jiushi", bindings);
    expect(await res.json()).toMatchObject({ ok: true, slotsCount: 1 });
  });

  it("skips backup D1 work after a recent successful source publication", async () => {
    await publishSlotsSnapshot(env, { ...result, generatedAt: new Date(Date.now() - 5 * 60_000) });
    const sync = vi.fn().mockResolvedValue(result);
    const response = await createJiushiSyncTriggerRoutes(sync).fetch(new Request("https://example.test/internal/sync/jiushi", {
      method: "POST", headers: { Authorization: `Bearer ${secret}` },
    }), { ...env, JIUSHI_SYNC_TRIGGER_SECRET: secret });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, skipped: true, reason: "fresh_snapshot" });
    expect(sync).not.toHaveBeenCalled();
  });

  it("does retry after an old publication or a failed primary sync", async () => {
    for (const [age, warnings] of [[11 * 60_000, []], [60_000, ["upstream failed"]]] as const) {
      await publishSlotsSnapshot(env, { ...result, generatedAt: new Date(Date.now() - age), warnings: [...warnings] });
      const sync = vi.fn().mockResolvedValue(result);
      const response = await createJiushiSyncTriggerRoutes(sync).fetch(new Request("https://example.test/internal/sync/jiushi", {
        method: "POST", headers: { Authorization: `Bearer ${secret}` },
      }), { ...env, JIUSHI_SYNC_TRIGGER_SECRET: secret });
      expect(response.status).toBe(200); expect(sync).toHaveBeenCalledTimes(1);
    }
  });

  it("returns failure when the source reports an incomplete sync", async () => {
    const sync = vi.fn().mockResolvedValue({ ...result, slots: [], warnings: ["upstream failed"] });
    const res = await createJiushiSyncTriggerRoutes(sync).fetch(
      new Request("https://example.test/internal/sync/jiushi", {
        method: "POST", headers: { Authorization: `Bearer ${secret}` },
      }), { ...env, JIUSHI_SYNC_TRIGGER_SECRET: secret },
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false });
  });
});
