function formatNumber(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatAsDateUTC8(date: Date): string {
  const adjusted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = adjusted.getUTCFullYear();
  const month = formatNumber(adjusted.getUTCMonth() + 1);
  const day = formatNumber(adjusted.getUTCDate());
  return `${year}-${month}-${day}`;
}

export function formatAsTimeUTC8(timestamp: number): string {
  const adjusted = new Date(timestamp + 8 * 60 * 60 * 1000);
  const hours = formatNumber(adjusted.getUTCHours());
  const minutes = formatNumber(adjusted.getUTCMinutes());
  return `${hours}:${minutes}`;
}

export function dateStringToUnixSeconds(date: string): number {
  const base = new Date(`${date}T00:00:00+08:00`);
  return Math.floor(base.getTime() / 1000);
}

export function getNextWeekSameDay(now: Date = new Date()): string {
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return formatAsDateUTC8(nextWeek);
}

export function getTodayUTC8(now: Date = new Date()): string {
  return formatAsDateUTC8(now);
}

export function getDateDaysAhead(
  days: number,
  now: Date = new Date()
): string {
  const target = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return formatAsDateUTC8(target);
}
