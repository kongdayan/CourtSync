import type { UnifiedTimeSlot } from "../types";
import type { DataSourceKey } from "./sources";

export const SLOTS_CACHE_SECONDS = 300;
export const SOURCE_SYNC_MINUTES = 60;

export interface SlotsResponse {
  source: DataSourceKey;
  sourceName: string;
  count: number;
  startDate: string;
  endDate: string;
  lastUpdatedAt: string | null;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  sourceState: "ready" | "stale" | "unavailable";
  warnings: string[];
  slots: UnifiedTimeSlot[];
  availableSources: Array<{ key: DataSourceKey; name: string }>;
  cacheTtlSeconds: number;
  syncIntervalMinutes: number;
}
