import type { UnifiedTimeSlot } from "../types";
import type { IndexedSlot, SnapshotIndex } from "./types";

export function buildSnapshotIndex(slots: UnifiedTimeSlot[]): SnapshotIndex {
  const index = new Map<string, Map<string, Set<string>>>();

  for (const slot of slots) {
    if (slot.Status?.toLowerCase() !== "available") continue;

    const date = slot.Date;
    const start = slot.StartTime;

    if (!index.has(date)) index.set(date, new Map());
    const day = index.get(date)!;

    if (!day.has(start)) day.set(start, new Set());
    day.get(start)!.add(slot.FacilityID);
  }

  // Convert to read-only index with sorted entries
  const result = new Map<string, Map<string, IndexedSlot>>();
  for (const [date, dayMap] of [...index.entries()].sort()) {
    const sortedDay = new Map<string, IndexedSlot>();
    for (const [start, facSet] of [...dayMap.entries()].sort()) {
      // Find end time from original slots (use first matching slot's EndTime)
      const matchingSlot = slots.find(s => s.Date === date && s.StartTime === start && s.Status?.toLowerCase() === "available");
      const endTime = matchingSlot?.EndTime ?? "";
      sortedDay.set(start, {
        startTime: start,
        endTime: endTime,
        availableFacilityIds: new Set([...facSet].sort()),
      });
    }
    result.set(date, sortedDay);
  }

  return result;
}
