import { minutesOf, type WeekCell, type WeekModel } from "./week-model";

export interface SlotSearchFilters {
  start: string;
  end: string;
  weekdays: number[];
}
export const defaultSearchFilters = (): SlotSearchFilters => ({ start: "08:00", end: "22:00", weekdays: [0, 1, 2, 3, 4, 5, 6] });
export const weekdayOf = (date: string) => new Date(date + "T00:00:00Z").getUTCDay();
export const validSearchWindow = ({ start, end }: SlotSearchFilters) => minutesOf(end) > minutesOf(start);

export function findMatchingSlots(model: WeekModel, filters: SlotSearchFilters): WeekCell[] {
  if (!validSearchWindow(filters)) return [];
  const start = minutesOf(filters.start), end = minutesOf(filters.end);
  return model.suggestions.filter(cell => !cell.past && cell.available.length > 0
    && filters.weekdays.includes(weekdayOf(cell.date))
    && minutesOf(cell.start) >= start && minutesOf(cell.end) <= end);
}
