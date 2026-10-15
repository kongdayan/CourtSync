import type { UnifiedTimeSlot } from "../../../../ts/types";
import type { Language } from "./i18n";
import type { DataSourceKey } from "../../../../ts/shared/sources";
import { formatAsDateUTC8 } from "../../../../ts/utils/time";
import { listKnownFacilities, resolveFacilityName } from "../../../../ts/constants/facilities";

export interface Court { id: string; name: string }
export interface WeekCell {
  key: string;
  date: string;
  start: string;
  end: string;
  available: Court[];
  total: number;
  hasData: boolean;
  past: boolean;
}
export interface WeekDay { date: string; weekday: string; label: string; availableTimes: number }
export interface WeekModel {
  days: WeekDay[];
  times: string[];
  cells: Map<string, WeekCell>;
  courts: Court[];
  suggestions: WeekCell[];
  availableTimes: number;
  filteredSlots: UnifiedTimeSlot[];
}
export const DURATIONS = [1, 2, 3, 4, 5, 6] as const;
export type BookingDuration = (typeof DURATIONS)[number];
export type TimeBand = "all" | "evening";

const DAY = 86_400_000;
const nameOrder = new Intl.Collator("zh-CN", { numeric: true });
export const cellKey = (date: string, time: string) => date + "|" + time;
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const timeOf = (minutes: number) => String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
export const slotAvailable = (slot: UnifiedTimeSlot) => slot.Status.trim().toLowerCase() === "available";

export function weekDates(today: string): string[] {
  const base = Date.parse(today + "T00:00:00+08:00");
  return Array.from({ length: 7 }, (_, index) => formatAsDateUTC8(new Date(base + index * DAY)));
}

export function buildWeekModel(
  slots: UnifiedTimeSlot[],
  source: DataSourceKey,
  today: string,
  now: number,
  duration: BookingDuration = 1,
  band: TimeBand = "all",
  courtId = "",
  language: Language = "zh",
): WeekModel {
  const dates = weekDates(today);
  const dateSet = new Set(dates);
  const knownNames = new Map(listKnownFacilities(source));
  const courtMap = new Map<string, Court>();
  const byCell = new Map<string, Map<string, UnifiedTimeSlot>>();
  const byCourtDay = new Map<string, UnifiedTimeSlot[]>();
  const starts = new Set<string>();

  // Index once. No cell performs Array.find for every court on every render.
  for (const slot of slots) {
    if (!dateSet.has(slot.Date)) continue;
    if (!courtMap.has(slot.FacilityID)) {
      const name = knownNames.get(slot.FacilityID)
        ?? (slot.ActivityName?.trim() || resolveFacilityName(slot.FacilityID, source));
      courtMap.set(slot.FacilityID, { id: slot.FacilityID, name });
    }
    if (courtId && slot.FacilityID !== courtId) continue;
    const key = cellKey(slot.Date, slot.StartTime);
    let cell = byCell.get(key);
    if (!cell) { cell = new Map(); byCell.set(key, cell); }
    cell.set(slot.FacilityID, slot);
    const courtKey = slot.Date + "|" + slot.FacilityID;
    const courtSlots = byCourtDay.get(courtKey) ?? [];
    courtSlots.push(slot);
    byCourtDay.set(courtKey, courtSlots);
    starts.add(slot.StartTime);
  }

  // Available runs must be on the same court and truly contiguous, not merely
  // neighbouring rows. This also supports providers returning half-hour blocks.
  const runs = new Map<string, Array<{ start: number; end: number }>>();
  for (const [key, courtSlots] of byCourtDay) {
    const merged: Array<{ start: number; end: number }> = [];
    for (const slot of courtSlots.filter(slotAvailable).sort((a, b) => a.StartTime.localeCompare(b.StartTime))) {
      const start = minutesOf(slot.StartTime), end = minutesOf(slot.EndTime);
      if (!(end > start)) continue;
      const last = merged.at(-1);
      if (last && start <= last.end) last.end = Math.max(last.end, end);
      else merged.push({ start, end });
    }
    runs.set(key, merged);
  }

  // Include the provider's operating-hour grid even when a date has no rows,
  // so all seven dates and empty/occupied/past states remain distinguishable.
  for (let hour = 8; hour < (source === "jiushi" ? 22 : 23); hour++) starts.add(timeOf(hour * 60));
  const times = [...starts].filter((time) => minutesOf(time) + duration * 60 <= 24 * 60
    && (band !== "evening" || minutesOf(time) >= 18 * 60)).sort();
  const courts = [...courtMap.values()].sort((a, b) => nameOrder.compare(a.name, b.name));
  const filteredSlots = slots.filter((slot) => dateSet.has(slot.Date)
    && (!courtId || slot.FacilityID === courtId)
    && (band !== "evening" || minutesOf(slot.StartTime) >= 18 * 60));

  const cells = new Map<string, WeekCell>();
  let availableTimes = 0;
  const suggestions: WeekCell[] = [];
  const days = dates.map((date): WeekDay => {
    let dayAvailable = 0;
    for (const start of times) {
      const key = cellKey(date, start);
      const cellSlots = byCell.get(key);
      const startMinute = minutesOf(start);
      const past = Date.parse(date + "T" + start + ":00+08:00") <= now;
      const available = past ? [] : courts.filter((court) => (!courtId || court.id === courtId)
        && (runs.get(date + "|" + court.id) ?? []).some((run) => run.start <= startMinute && run.end >= startMinute + duration * 60));
      const cell: WeekCell = {
        key, date, start, end: timeOf(startMinute + duration * 60), available,
        total: cellSlots?.size ?? 0, hasData: !!cellSlots?.size, past,
      };
      cells.set(key, cell);
      if (available.length) { availableTimes++; dayAvailable++; suggestions.push(cell); }
    }
    const dateObject = new Date(date + "T00:00:00+08:00");
    return {
      date, weekday: dateObject.toLocaleDateString(language === "en" ? "en-GB" : "zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" }),
      label: date.slice(5).replace("-", "/"), availableTimes: dayAvailable,
    };
  });
  suggestions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  // Keep every opening: search filters must run before limiting visible results.
  return { days, times, cells, courts, suggestions, availableTimes, filteredSlots };
}

