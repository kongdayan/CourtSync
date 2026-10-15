import { Hono } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";
import { runTimeslotSync } from "../../sync/run";
import { readPublishedSnapshot } from "../../cache/slots-snapshot";

// A source-specific machine endpoint for the Aliyun fallback timer.
// It only updates snapshots; it never books courts or sends notifications.
export function createJiushiSyncTriggerRoutes(sync: typeof runTimeslotSync = runTimeslotSync) {
  return new Hono<{ Bindings: Env }>()
  .post("/internal/sync/jiushi", async (c) => {
    const secret = c.env.JIUSHI_SYNC_TRIGGER_SECRET;
    if (!secret) return c.json({ error: "sync_trigger_not_configured" }, 503);
    const header = c.req.header("Authorization") ?? "";
    const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
    const supplied = createHash("sha256").update(header).digest();
    if (!timingSafeEqual(expected, supplied)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    // The backup runs five minutes after the primary Cron. A recent successful
    // publication is enough to skip all upstream calls and D1 work.
    if (c.env.SLOTS_CACHE) {
      const snapshot = await readPublishedSnapshot(c.env.SLOTS_CACHE, "jiushi")
        .catch(() => null);
      const age = snapshot?.lastSyncedAt ? Date.now() - Date.parse(snapshot.lastSyncedAt) : Infinity;
      if (snapshot?.healthy && snapshot.slots.length && age >= 0 && age < 10 * 60_000) {
        return c.json({ ok: true, source: "jiushi", skipped: true, reason: "fresh_snapshot",
          slotsCount: snapshot.slots.length, generatedAt: snapshot.lastSyncedAt });
      }
    }
    const result = await sync("jiushi", c.env);
    const ok = result.status === "success" && result.slots.length > 0 && result.warnings.length === 0;
    return c.json({
      ok, source: result.source, slotsCount: result.slots.length,
      warnings: result.warnings, generatedAt: result.generatedAt.toISOString(),
    }, ok ? 200 : 502);
  });
}

export const jiushiSyncTriggerRoutes = createJiushiSyncTriggerRoutes();
