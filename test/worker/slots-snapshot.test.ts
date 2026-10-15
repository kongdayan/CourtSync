import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { publishSlotsSnapshot, readPublishedSnapshot, publicSlotsResponse } from "../../ts/cache/slots-snapshot";
import type { TimeslotSyncResult } from "../../ts/sync/run";

const good: TimeslotSyncResult = {
  source: "jiushi", status: "success", warnings: [], startDate: "2026-10-13", endDate: "2026-10-21", generatedAt: new Date("2026-10-13T08:00:00Z"),
  slots: [{ FacilityID: "113", Date: "2026-10-14", StartTime: "18:00", EndTime: "19:00", Status: "Available", ActivityName: "court" }],
};
describe("published source snapshots", () => {
  it("preserves good data on failure while updating attempt time and health", async () => {
    await publishSlotsSnapshot(env, good);
    await publishSlotsSnapshot(env, { ...good, slots: [], warnings: ["private upstream error must not leak"], generatedAt: new Date("2026-10-13T09:00:00Z") });
    const snapshot = (await readPublishedSnapshot(env.SLOTS_CACHE, "jiushi"))!;
    expect(snapshot.slots).toEqual(good.slots);
    expect(snapshot.lastSyncedAt).toBe(good.generatedAt.toISOString());
    expect(snapshot.lastAttemptAt).toBe("2026-10-13T09:00:00.000Z");
    const response = publicSlotsResponse(snapshot, "2026-10-13", 7, new Date("2026-10-13T09:01:00Z"));
    expect(response.sourceState).toBe("stale");
    expect(JSON.stringify(response)).not.toContain("private upstream");
  });
  it("starts a fresh seven-day window after UTC+8 midnight and marks aged data", async () => {
    await publishSlotsSnapshot(env, good);
    const snapshot = (await readPublishedSnapshot(env.SLOTS_CACHE, "jiushi"))!;
    const response = publicSlotsResponse(snapshot, "2026-10-14", 7, new Date("2026-10-13T16:01:00Z"));
    expect(response.startDate).toBe("2026-10-14"); expect(response.endDate).toBe("2026-10-20");
    expect(response.sourceState).toBe("stale");
    expect(publicSlotsResponse(snapshot, "2026-10-15", 7, new Date()).sourceState).toBe("unavailable");
  });
});
