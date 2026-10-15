import { describe, expect, it } from "vitest";
import { buildWeekModel, cellKey, type BookingDuration } from "../../src/web/features/dashboard/week-model";
import type { UnifiedTimeSlot } from "../../ts/types";
const slot = (id: string, start: string, end: string, status = "Available"): UnifiedTimeSlot => ({ FacilityID: id, Date: "2026-10-14", StartTime: start, EndTime: end, Status: status, ActivityName: "Court " + id });
const model = (slots: UnifiedTimeSlot[], duration: BookingDuration = 1) => buildWeekModel(slots, "jiushi", "2026-10-13", Date.parse("2026-10-13T16:00:00+08:00"), duration);

describe("seven-day availability model", () => {
  it("always includes seven dates, even with no data", () => {
    const week = model([]); expect(week.days).toHaveLength(7); expect(week.days.at(-1)?.date).toBe("2026-10-19");
    expect(week.cells.get(cellKey("2026-10-14", "18:00"))?.hasData).toBe(false);
  });
  it("requires a continuous run on the same court for two hours", () => {
    const week = model([slot("113", "18:00", "19:00"), slot("113", "19:00", "20:00"), slot("114", "18:00", "19:00"), slot("115", "19:00", "20:00")], 2);
    expect(week.cells.get(cellKey("2026-10-14", "18:00"))?.available.map(c => c.id)).toEqual(["113"]);
    expect(week.cells.get(cellKey("2026-10-14", "19:00"))?.available).toEqual([]);
  });
  it("handles half-hour blocks, gaps, mixed-case statuses and past start times", () => {
    const week = model([slot("113", "18:00", "18:30", " available "), slot("113", "18:30", "19:00"), slot("114", "18:00", "18:30"), slot("114", "19:00", "19:30")]);
    expect(week.cells.get(cellKey("2026-10-14", "18:00"))?.available.map(c => c.id)).toEqual(["113"]);
    const past = buildWeekModel([slot("113", "18:00", "19:00")], "jiushi", "2026-10-14", Date.parse("2026-10-14T18:00:00+08:00"));
    expect(past.cells.get(cellKey("2026-10-14", "18:00"))?.available).toEqual([]);
    expect(past.cells.get(cellKey("2026-10-14", "18:00"))?.past).toBe(true);
  });
  it("filters evening and courts without hiding dates", () => {
    const week = buildWeekModel([slot("113", "18:00", "19:00"), slot("114", "18:00", "19:00"), slot("113", "10:00", "11:00")], "jiushi", "2026-10-13", 0, 1, "evening", "114");
    expect(week.days).toHaveLength(7); expect(week.times).not.toContain("10:00");
    expect(week.cells.get(cellKey("2026-10-14", "18:00"))?.available.map(c => c.id)).toEqual(["114"]);
    expect(week.filteredSlots).toHaveLength(1);
  });
  it.each([3, 4, 5, 6] as const)("finds %i continuous hours without crossing courts or a gap", duration => {
    const slots = Array.from({ length: 6 }, (_, i) => slot("113", `${8 + i}:00`.padStart(5, "0"), `${9 + i}:00`.padStart(5, "0")));
    const week = model(slots, duration);
    expect(week.cells.get(cellKey("2026-10-14", "08:00"))?.available.map(c => c.id)).toEqual(["113"]);
    const broken = model(slots.map((s, index) => index === 1 ? { ...s, FacilityID: "114" } : s), duration);
    expect(broken.cells.get(cellKey("2026-10-14", "08:00"))?.available).toEqual([]);
    expect(week.times.every(time => Number(time.slice(0, 2)) + duration <= 24)).toBe(true);
  });
  it("localizes weekdays without changing availability", () => {
    const slots = [slot("113", "18:00", "19:00")];
    const week = buildWeekModel(slots, "jiushi", "2026-10-13", 0, 1, "all", "", "en");
    expect(week.days[1].weekday).toBe("Wed");
    expect(week.availableTimes).toBe(model(slots).availableTimes);
  });
});
