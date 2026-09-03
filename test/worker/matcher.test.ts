import { describe, expect, it } from "vitest";
import { buildSnapshotIndex } from "../../ts/matching/snapshot-index";
import { matchRule } from "../../ts/matching/matcher";
import type { UnifiedTimeSlot } from "../../ts/types";

function slot(date: string, start: string, end: string, facilityId: string, status = "Available"): UnifiedTimeSlot {
  return { Date: date, StartTime: start, EndTime: end, FacilityID: facilityId, Status: status, ActivityName: "" };
}

function rule(overrides: Record<string, any> = {}) {
  return {
    id: "r1", userId: "u1", name: "test", source: "usthing" as const,
    weekdayMask: 0, timeslotMask: 0, facilityIds: new Set<string>(),
    minConsecutive: 2, pushLimit: 3,
    ...overrides,
  };
}

describe("matchRule", () => {
  it("forms one maximal cross-court run", async () => {
    const index = buildSnapshotIndex([
      slot("2026-06-10", "18:00", "19:00", "113"),
      slot("2026-06-10", "19:00", "20:00", "115"),
      slot("2026-06-10", "20:00", "21:00", "117"),
    ]);

    const matches = await matchRule(rule({ minConsecutive: 2 }), index);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      slotDate: "2026-06-10",
      startTime: "18:00",
      endTime: "21:00",
      slotCount: 3,
    });
  });

  it("gap in selected timeslot mask prevents a match", async () => {
    // Available at 18:00 and 20:00, but rule only has mask bits for 18:00 and 20:00 (not 19:00)
    const index = buildSnapshotIndex([
      slot("2026-06-10", "18:00", "19:00", "113"),
      slot("2026-06-10", "20:00", "21:00", "113"),
    ]);
    // timeslotMask selects only 18:00 and 20:00 (bits at indices 0 and 2)
    const mask = (1 << 0) | (1 << 2); // 18:00 and 20:00
    const matches = await matchRule(rule({ minConsecutive: 2, timeslotMask: mask }), index);
    // 18:00-19:00 and 20:00-21:00 are not consecutive hours
    expect(matches).toHaveLength(0);
  });

  it("actual time gap prevents a match", async () => {
    // Slots at 18:00-18:30 and 19:00-20:00 don't share a continuous boundary
    const index = buildSnapshotIndex([
      slot("2026-06-10", "18:00", "18:30", "113"),
      slot("2026-06-10", "19:00", "20:00", "113"),
    ]);
    const matches = await matchRule(rule({ minConsecutive: 2 }), index);
    expect(matches).toHaveLength(0);
  });

  it("empty filters (wildcards) return maximal run", async () => {
    const index = buildSnapshotIndex([
      slot("2026-06-11", "14:00", "15:00", "113"),
      slot("2026-06-11", "15:00", "16:00", "113"),
      slot("2026-06-11", "16:00", "17:00", "113"),
    ]);
    const matches = await matchRule(rule({ minConsecutive: 2 }), index);
    expect(matches).toHaveLength(1);
    expect(matches[0].slotCount).toBe(3);
  });

  it("separate available runs produce two matches", async () => {
    const index = buildSnapshotIndex([
      slot("2026-06-10", "18:00", "19:00", "113"),
      slot("2026-06-10", "19:00", "20:00", "113"),
      // gap: 20:00 not available
      slot("2026-06-10", "21:00", "22:00", "113"),
      slot("2026-06-10", "22:00", "23:00", "113"),
    ]);
    const matches = await matchRule(rule({ minConsecutive: 2 }), index);
    expect(matches).toHaveLength(2);
  });
});
