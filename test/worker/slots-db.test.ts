import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { persistSlots, loadSlots } from "../../ts/db/slots";
import type { UnifiedTimeSlot } from "../../ts/types";

function slot(partial: Partial<UnifiedTimeSlot>): UnifiedTimeSlot {
  return {
    FacilityID: "F1",
    Date: "2026-09-10",
    StartTime: "18:00",
    EndTime: "19:00",
    Status: "available",
    ActivityName: "",
    ...partial,
  } as UnifiedTimeSlot;
}

beforeEach(async () => {
  await env.DB
    .prepare(
      `CREATE TABLE IF NOT EXISTS slot_snapshot (
        facility_id   TEXT NOT NULL,
        slot_date     TEXT NOT NULL,
        start_time    TEXT NOT NULL,
        end_time      TEXT,
        status        TEXT NOT NULL,
        activity_name TEXT,
        updated_at    TEXT NOT NULL,
        PRIMARY KEY (facility_id, slot_date, start_time)
      )`
    )
    .run();
  await env.DB.prepare("DELETE FROM slot_snapshot").run();
});

describe("persistSlots conditional upsert", () => {
  it("inserts new rows", async () => {
    const result = await persistSlots(env.DB, [slot({})], "2026-09-03", "2026-09-17", new Date());
    expect(result).toEqual({ attempted: 1, changed: 1 });

    const { slots } = await loadSlots(env.DB, "2026-09-03", "2026-09-17");
    expect(slots).toHaveLength(1);
  });

  it("writes zero rows when nothing changed", async () => {
    const base = [slot({})];
    await persistSlots(env.DB, base, "2026-09-03", "2026-09-17", new Date("2026-09-03T01:00:00Z"));

    const again = await persistSlots(env.DB, base, "2026-09-03", "2026-09-17", new Date("2026-09-03T01:05:00Z"));
    expect(again.changed).toBe(0);
    expect(again.attempted).toBe(1);

    // updated_at must not have been bumped
    const row = await env.DB
      .prepare("SELECT updated_at FROM slot_snapshot WHERE facility_id = 'F1'")
      .first<{ updated_at: string }>();
    expect(row!.updated_at).toBe("2026-09-03T01:00:00.000Z");
  });

  it("writes only rows whose status changed", async () => {
    const base = [slot({}), slot({ FacilityID: "F2" })];
    await persistSlots(env.DB, base, "2026-09-03", "2026-09-17", new Date("2026-09-03T01:00:00Z"));

    const changed = await persistSlots(
      env.DB,
      [slot({}), slot({ FacilityID: "F2", Status: "booked" })],
      "2026-09-03",
      "2026-09-17",
      new Date("2026-09-03T01:05:00Z")
    );
    expect(changed.changed).toBe(1);

    const f2 = await env.DB
      .prepare("SELECT status FROM slot_snapshot WHERE facility_id = 'F2'")
      .first<{ status: string }>();
    expect(f2!.status).toBe("booked");
  });

  it("writes rows whose activity_name or end_time changed", async () => {
    await persistSlots(env.DB, [slot({})], "2026-09-03", "2026-09-17", new Date("2026-09-03T01:00:00Z"));

    const activity = await persistSlots(
      env.DB,
      [slot({ ActivityName: "  双打  " })],
      "2026-09-03",
      "2026-09-17",
      new Date("2026-09-03T01:05:00Z")
    );
    expect(activity.changed).toBe(1);

    const ended = await persistSlots(
      env.DB,
      [slot({ EndTime: "20:00" })],
      "2026-09-03",
      "2026-09-17",
      new Date("2026-09-03T01:10:00Z")
    );
    expect(ended.changed).toBe(1);
  });

  it("trims rows outside the date window", async () => {
    await persistSlots(env.DB, [slot({ Date: "2026-09-01" })], "2026-09-03", "2026-09-17", new Date());
    const result = await persistSlots(env.DB, [slot({})], "2026-09-03", "2026-09-17", new Date());
    expect(result.changed).toBe(1);

    const count = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM slot_snapshot")
      .first<{ n: number }>();
    expect(count!.n).toBe(1);
  });
});
