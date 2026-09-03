import { HOURLY_TIMESLOTS } from "../shared/sources";

// Monday = bit 0, Sunday = bit 6
export function weekdaysToMask(days: number[]): number {
  let mask = 0;
  for (const d of days) {
    if (d >= 1 && d <= 7) {
      mask |= 1 << (d - 1);
    }
  }
  return mask;
}

export function maskToWeekdays(mask: number): number[] {
  const days: number[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) {
      days.push(i + 1);
    }
  }
  return days;
}

export function timeslotsToMask(starts: string[]): number {
  let mask = 0;
  for (const start of starts) {
    const idx = HOURLY_TIMESLOTS.findIndex((t) => t.start === start);
    if (idx >= 0) {
      mask |= 1 << idx;
    }
  }
  return mask;
}

export function maskToTimeslots(mask: number): string[] {
  const starts: string[] = [];
  for (let i = 0; i < HOURLY_TIMESLOTS.length; i++) {
    if (mask & (1 << i)) {
      starts.push(HOURLY_TIMESLOTS[i].start);
    }
  }
  return starts;
}
