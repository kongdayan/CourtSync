import { describe, expect, it } from "vitest";
import { buildWeekModel } from "../../src/web/features/dashboard/week-model";
import { defaultSearchFilters, findMatchingSlots, weekdayOf } from "../../src/web/features/dashboard/slot-search";
import type { UnifiedTimeSlot } from "../../ts/types";

const slot = (date: string, id: string, hour: number): UnifiedTimeSlot => ({ Date: date, FacilityID: id, StartTime: String(hour).padStart(2, "0") + ":00", EndTime: String(hour + 1).padStart(2, "0") + ":00", Status: "Available" });
const slots = [8, 9, 10, 11, 18, 19, 20].flatMap(hour => [slot("2026-10-14", "113", hour), slot("2026-10-17", "114", hour)]);
const week = (duration: 1 | 2 = 1, courtId = "") => buildWeekModel(slots, "jiushi", "2026-10-13", Date.parse("2026-10-13T17:00:00+08:00"), duration, "all", courtId);

describe("matching court search", () => {
  it("searches late openings beyond the old first three suggestions", () => {
    const model = week();
    expect(model.suggestions.length).toBeGreaterThan(3);
    expect(findMatchingSlots(model, { ...defaultSearchFilters(), start: "18:00", end: "20:00" }).map(cell => cell.start)).toEqual(["18:00", "19:00", "18:00", "19:00"]);
  });
  it("fits the full continuous duration inside the window and honors weekdays and courts", () => {
    const filters = { start: "18:00", end: "20:00", weekdays: [6] };
    const found = findMatchingSlots(week(2), filters);
    expect(found.map(cell => [cell.date, cell.start, cell.end, cell.available[0].id])).toEqual([["2026-10-17", "18:00", "20:00", "114"]]);
    expect(findMatchingSlots(week(2, "113"), filters)).toEqual([]);
    expect(weekdayOf("2026-10-14")).toBe(3);
  });
  it("handles half-hour boundaries, empty days, reversed windows and expired starts", () => {
    expect(findMatchingSlots(week(), { start: "18:30", end: "20:00", weekdays: [3] }).map(cell => cell.start)).toEqual(["19:00"]);
    expect(findMatchingSlots(week(), { start: "20:00", end: "18:00", weekdays: [3] })).toEqual([]);
    expect(findMatchingSlots(week(), { ...defaultSearchFilters(), weekdays: [] })).toEqual([]);
    const current = buildWeekModel(slots, "jiushi", "2026-10-14", Date.parse("2026-10-14T19:00:00+08:00"));
    expect(findMatchingSlots(current, { start: "18:00", end: "22:00", weekdays: [3] }).map(cell => cell.start)).toEqual(["20:00"]);
  });
});
