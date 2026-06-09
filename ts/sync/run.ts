import {
  updateUSThingTimeSlots,
  updateJiushiTimeSlots,
} from "../service/updateTimeSlots";
import { PushDeerService } from "../notifications/pushdeer";
import { acquireToken, setCredentials } from "../sources/usthing";
import {
  UnifiedTimeSlot,
  PushDeerConfig,
  USThingConfig,
  JiushiConfig,
  DataSourceKey,
} from "../types";
import { getTodayUTC8, getDateDaysAhead } from "../utils/time";
import { persistSlots } from "../db/slots";

// Augment the global Env type with sync-specific optional fields not present
// in the auto-generated type from wrangler config.
declare global {
  interface Env {
    PUSHDEER_KEYS?: string;
    USTHING_UST_ID?: string;
    USTHING_FACILITY_IDS?: string;
    JIUSHI_GROUND_IDS?: string;
  }
}

const USTHING_BEARER_KV_KEY = "usthing:bearer";

export type SourceSyncStatus = "success" | "failed";

export interface TimeslotSyncResult {
  source: DataSourceKey;
  status: SourceSyncStatus;
  slots: UnifiedTimeSlot[];
  warnings: string[];
  startDate: string;
  endDate: string;
  generatedAt: Date;
}

export const AVAILABLE_SOURCES: DataSourceKey[] = ["usthing", "jiushi"];

function parsePushConfig(env?: Env): PushDeerConfig | null {
  const rawKeys = env?.PUSHDEER_KEYS;
  if (!rawKeys) {
    return null;
  }

  const pushKeys = rawKeys
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (!pushKeys.length) {
    return null;
  }

  return { pushKeys };
}

async function resolveUSThingBearer(
  env: Env,
  warnings: string[]
): Promise<string | undefined> {
  // 优先使用静态 bearer（向后兼容）
  const inlineBearer = env.USTHING_BEARER?.trim();
  if (inlineBearer) {
    return inlineBearer;
  }

  // 尝试 Azure AD 动态获取 token
  const username = env.USTHING_USERNAME?.trim();
  const password = env.USTHING_PASSWORD?.trim();
  if (username && password) {
    // 缓存凭据以便后续 401 自动刷新
    setCredentials(username, password);
    try {
      const token = await acquireToken(username, password);
      return `Bearer ${token}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      warnings.push(`Azure AD token acquisition failed: ${msg}`);
      console.error("Azure AD token error", error);
    }
  }

  // 回退到 KV 中存储的 token
  if (!env.hkust_token) {
    warnings.push(
      "USThing bearer token is not configured. Set USTHING_USERNAME+USTHING_PASSWORD for Azure AD auto-auth, USTHING_BEARER for a static token, or configure KV."
    );
    return undefined;
  }

  try {
    const kvValue = await env.hkust_token.get(USTHING_BEARER_KV_KEY, "text");
    const trimmed = kvValue?.trim();
    if (trimmed) {
      return trimmed;
    }
    warnings.push(
      `USThing bearer token not found in KV namespace (binding "hkust_token", key "${USTHING_BEARER_KV_KEY}").`
    );
  } catch (error) {
    console.error("Failed to read USThing bearer from KV", error);
    warnings.push("Unable to read USThing bearer token from KV.");
  }

  return undefined;
}

async function parseUSThingConfig(
  env: Env,
  warnings: string[]
): Promise<USThingConfig> {
  const ustID = env?.USTHING_UST_ID?.trim() ?? "";
  const userType = env?.USTHING_USER_TYPE?.trim() ?? "01";

  const facilityIDs =
    env?.USTHING_FACILITY_IDS
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? ["2", "3", "4", "5", "79", "80", "100", "101"];

  return {
    ustID,
    userType,
    facilityIDs,
    bearer: await resolveUSThingBearer(env, warnings),
  };
}

function parseJiushiConfig(
  env: Env,
  warnings: string[]
): JiushiConfig | null {
  const venueId = env?.JIUSHI_VENUE_ID?.trim() ?? "";
  if (!venueId) {
    warnings.push(
      "Jiushi venue ID is not configured. Set the JIUSHI_VENUE_ID environment variable to enable Jiushi sync."
    );
    return null;
  }

  const allowedGroundIds =
    env?.JIUSHI_GROUND_IDS
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];

  const parsedMaxDays = Number.parseInt(env?.JIUSHI_MAX_DAYS ?? "", 10);
  const maxDays = Number.isFinite(parsedMaxDays) && parsedMaxDays > 0
    ? Math.min(parsedMaxDays, 31)
    : 9;

  return {
    venueId,
    allowedGroundIds,
    maxDays,
    proxyUrl: env?.JIUSHI_PROXY_URL?.trim() || undefined,
    proxyToken: env?.JIUSHI_PROXY_TOKEN?.trim() || undefined,
    cookie: env?.JIUSHI_COOKIE?.trim() || undefined,
  };
}

async function runUSThingTimeslotSync(
  env: Env,
  fetchImpl: typeof fetch = fetch,
  startDate?: string,
  endDate?: string
): Promise<TimeslotSyncResult> {
  const effectiveStart = startDate ?? getTodayUTC8();
  const effectiveEnd = endDate ?? getDateDaysAhead(14);
  const warnings: string[] = [];
  const usthingConfig = await parseUSThingConfig(env, warnings);

  console.log(
    `[USThing] Starting sync for facilities ${usthingConfig.facilityIDs.join(
      ", "
    )} from ${effectiveStart} to ${effectiveEnd} (ustID length: ${
      usthingConfig.ustID.length
    }, bearer provided: ${Boolean(usthingConfig.bearer)})`
  );

  const generatedAt = new Date();

  const slots = await updateUSThingTimeSlots({
    ustID: usthingConfig.ustID,
    userType: usthingConfig.userType,
    facilityIDs: usthingConfig.facilityIDs,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    bearer: usthingConfig.bearer,
    fetchImpl,
    warnings,
  });

  try {
    await persistSlots(env.DB, slots, effectiveStart, effectiveEnd, generatedAt);
  } catch (error) {
    console.error("Failed to persist slot snapshot to D1", error);
    warnings.push(
      "Unable to persist slot data to D1. The dashboard may serve stale results."
    );
  }

  const pushConfig = parsePushConfig(env);

  if (!slots.length) {
    const jwtWarning =
      "USThing authorization token appears to be invalid or expired. Please contact the administrator to refresh the bearer JWT.";
    if (!warnings.some((w) => w.toLowerCase().includes("jwt"))) {
      warnings.push(jwtWarning);
    }
  }

  if (pushConfig && slots.length > 0) {
    console.log(
      `[PushDeer] Dispatching ${slots.length} slots to ${pushConfig.pushKeys.length} keys`
    );
    const pushService = new PushDeerService(pushConfig.pushKeys);
    await pushService.pushTimeSlots(slots, fetchImpl);
  } else if (pushConfig) {
    console.log(
      "[PushDeer] Push configured but no slots available; skipping notification"
    );
  } else {
    console.log("[PushDeer] No push configuration provided; skipping push");
  }

  if (!slots.length) {
    console.warn("[USThing] No slots returned in this sync");
  }

  return {
    source: "usthing",
    status: "success",
    slots,
    warnings,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    generatedAt,
  };
}

async function runJiushiTimeslotSync(
  env: Env,
  fetchImpl: typeof fetch = fetch,
  startDate?: string,
  endDate?: string
): Promise<TimeslotSyncResult> {
  const effectiveStart = startDate ?? getTodayUTC8();
  const effectiveEnd = endDate ?? getDateDaysAhead(14);
  const warnings: string[] = [];
  const config = parseJiushiConfig(env, warnings);
  const generatedAt = new Date();

  if (!config) {
    return {
      source: "jiushi",
      status: "success",
      slots: [],
      warnings,
      startDate: effectiveStart,
      endDate: effectiveEnd,
      generatedAt,
    };
  }

  const slots = await updateJiushiTimeSlots({
    venueId: config.venueId,
    allowedGroundIds: config.allowedGroundIds,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    fetchImpl,
    warnings,
    maxDays: config.maxDays,
    proxyUrl: config.proxyUrl,
    proxyToken: config.proxyToken,
  });

  if (!env.JIUSHI_DB) {
    warnings.push(
      "Jiushi D1 binding (JIUSHI_DB) is not configured. Results cannot be persisted."
    );
  } else {
    try {
      await persistSlots(
        env.JIUSHI_DB,
        slots,
        effectiveStart,
        effectiveEnd,
        generatedAt
      );
    } catch (error) {
      console.error("Failed to persist Jiushi slot snapshot to D1", error);
      warnings.push(
        "Unable to persist Jiushi slot data to D1. The dashboard may serve stale results."
      );
    }
  }

  if (!slots.length) {
    console.warn("[Jiushi] No slots returned in this sync");
  }

  return {
    source: "jiushi",
    status: "success",
    slots,
    warnings,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    generatedAt,
  };
}

export async function runTimeslotSync(
  source: DataSourceKey,
  env: Env,
  fetchImpl: typeof fetch = fetch,
  startDate?: string,
  endDate?: string
): Promise<TimeslotSyncResult> {
  if (source === "jiushi") {
    return runJiushiTimeslotSync(env, fetchImpl, startDate, endDate);
  }
  return runUSThingTimeslotSync(env, fetchImpl, startDate, endDate);
}

export async function syncConfiguredSources(
  run: (source: DataSourceKey) => Promise<TimeslotSyncResult>,
): Promise<TimeslotSyncResult[]> {
  const results: TimeslotSyncResult[] = [];
  for (const source of ["usthing", "jiushi"] as const) {
    try {
      results.push(await run(source));
    } catch (error) {
      results.push({
        source,
        status: "failed",
        slots: [],
        warnings: [error instanceof Error ? error.message : String(error)],
        startDate: getTodayUTC8(),
        endDate: getDateDaysAhead(14),
        generatedAt: new Date(),
      });
    }
  }
  return results;
}
