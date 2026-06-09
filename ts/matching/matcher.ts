import { HOURLY_TIMESLOTS } from "../shared/sources";
import type { CompiledRule, RuleMatch, MatchAvailability, SnapshotIndex } from "./types";

function filterFacilities(available: ReadonlySet<string>, selected: ReadonlySet<string>): string[] {
  if (selected.size === 0) return [...available].sort();
  return [...available].filter(f => selected.has(f)).sort();
}

export async function matchRule(rule: CompiledRule, index: SnapshotIndex): Promise<RuleMatch[]> {
  const results: RuleMatch[] = [];

  for (const [date, day] of index) {
    // Apply weekday filter
    if (rule.weekdayMask !== 0) {
      const dayOfWeek = new Date(date + "T00:00:00").getDay(); // 0=Sun, 1=Mon, ...
      const weekdayNum = dayOfWeek === 0 ? 7 : dayOfWeek; // convert to 1=Mon, 7=Sun
      if ((rule.weekdayMask & (1 << (weekdayNum - 1))) === 0) continue;
    }

    let current: MatchAvailability[] = [];

    const emitIfLongEnough = () => {
      if (current.length >= rule.minConsecutive) {
        results.push({
          fingerprint: "", // filled in later by fingerprinting
          ruleId: rule.id,
          userId: rule.userId,
          ruleName: rule.name,
          source: rule.source,
          slotDate: date,
          startTime: current[0].startTime,
          endTime: current[current.length - 1].endTime,
          slotCount: current.length,
          availability: current,
          pushLimit: rule.pushLimit,
        });
      }
      current = [];
    };

    for (const timeslot of HOURLY_TIMESLOTS) {
      const selected = rule.timeslotMask === 0 || (rule.timeslotMask & (1 << timeslot.index)) !== 0;
      const indexed = day.get(timeslot.start);
      const facilityIds = selected && indexed
        ? filterFacilities(indexed.availableFacilityIds, rule.facilityIds)
        : [];

      const touchesPrevious = current.length === 0 ||
        (current.at(-1)!.endTime === indexed?.startTime);

      if (!selected || !indexed || facilityIds.length === 0 || !touchesPrevious) {
        emitIfLongEnough();
      }

      if (selected && indexed && facilityIds.length > 0) {
        current.push({ startTime: indexed.startTime, endTime: indexed.endTime, facilityIds });
      }
    }
    emitIfLongEnough();
  }

  return results;
}
