import type { UnifiedTimeSlot } from "../types";
import type { TimeslotSyncResult } from "../sync/run";
import { SOURCE_DEFINITIONS, type DataSourceKey } from "../shared/sources";
import { SLOTS_CACHE_SECONDS, SOURCE_SYNC_MINUTES, type SlotsResponse } from "../shared/slots";
import { formatAsDateUTC8 } from "../utils/time";

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_LIFETIME_SECONDS = 48 * 60 * 60;

export interface PublishedSnapshot {
  version: typeof SNAPSHOT_VERSION;
  source: DataSourceKey;
  lastSyncedAt: string | null;
  lastAttemptAt: string;
  healthy: boolean;
  slots: UnifiedTimeSlot[];
}

export function snapshotKey(source: DataSourceKey): string {
  return `slots:v${SNAPSHOT_VERSION}:${source}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSlot(value: unknown): value is UnifiedTimeSlot {
  return isRecord(value) && ["FacilityID", "Date", "StartTime", "EndTime", "Status", "ActivityName"]
    .every((key) => typeof value[key] === "string");
}

function isSnapshot(value: unknown, source: DataSourceKey): value is PublishedSnapshot {
  return isRecord(value) && value.version === SNAPSHOT_VERSION && value.source === source
    && (value.lastSyncedAt === null || (typeof value.lastSyncedAt === "string" && Number.isFinite(Date.parse(value.lastSyncedAt))))
    && typeof value.lastAttemptAt === "string" && Number.isFinite(Date.parse(value.lastAttemptAt))
    && typeof value.healthy === "boolean" && Array.isArray(value.slots)
    && value.slots.length <= 50_000 && value.slots.every(isSlot);
}

export async function readPublishedSnapshot(kv: KVNamespace, source: DataSourceKey): Promise<PublishedSnapshot | null> {
  const value: unknown = await kv.get(snapshotKey(source), { type: "json", cacheTtl: 60 });
  if (value === null) return null;
  if (!isSnapshot(value, source)) throw new Error("Invalid public slot snapshot");
  return value;
}

/** Publish once per source sync. Visitors never query the inventory databases. */
export async function publishSlotsSnapshot(env: Env, result: TimeslotSyncResult): Promise<void> {
  if (!env.SLOTS_CACHE) return;
  const healthy = result.status === "success" && result.warnings.length === 0 && result.slots.length > 0;
  const previous = healthy ? null : await readPublishedSnapshot(env.SLOTS_CACHE, result.source);
  const snapshot: PublishedSnapshot = {
    version: SNAPSHOT_VERSION,
    source: result.source,
    healthy,
    lastAttemptAt: result.generatedAt.toISOString(),
    lastSyncedAt: healthy ? result.generatedAt.toISOString() : previous?.lastSyncedAt ?? null,
    slots: healthy ? result.slots : previous?.slots ?? [],
  };
  await env.SLOTS_CACHE.put(snapshotKey(result.source), JSON.stringify(snapshot), {
    expirationTtl: SNAPSHOT_LIFETIME_SECONDS,
  });
}

export function publicSlotsResponse(snapshot: PublishedSnapshot, startDate: string, days: 7 | 14, now: Date): SlotsResponse {
  const endDate = formatAsDateUTC8(new Date(Date.parse(`${startDate}T00:00:00+08:00`) + (days - 1) * 86_400_000));
  const slots = snapshot.slots.filter((slot) => slot.Date >= startDate && slot.Date <= endDate);
  const tooOld = !snapshot.lastSyncedAt || now.getTime() - Date.parse(snapshot.lastSyncedAt) > 2 * SOURCE_SYNC_MINUTES * 60_000;
  const sourceState = !slots.length ? "unavailable" : (!snapshot.healthy || tooOld) ? "stale" : "ready";
  const warnings = sourceState === "ready" ? [] : [sourceState === "stale"
    ? "数据源暂未更新，正在显示上次成功采集的快照。"
    : "该数据源暂不可用，尚无可显示的采集快照。"];
  return {
    source: snapshot.source, sourceName: SOURCE_DEFINITIONS[snapshot.source].name,
    count: slots.length, startDate, endDate,
    lastUpdatedAt: snapshot.lastSyncedAt, lastSyncedAt: snapshot.lastSyncedAt,
    lastAttemptAt: snapshot.lastAttemptAt, sourceState, warnings, slots,
    availableSources: Object.values(SOURCE_DEFINITIONS),
    cacheTtlSeconds: SLOTS_CACHE_SECONDS, syncIntervalMinutes: SOURCE_SYNC_MINUTES,
  };
}
