import { updateUSThingTimeSlots } from "./service/updateTimeSlots";
import { PushDeerService } from "./notifications/pushdeer";
import {
  UnifiedTimeSlot,
  PushDeerConfig,
  USThingConfig,
} from "./types";
import { getTodayUTC8, getDateDaysAhead } from "./utils/time";
import { renderSlotsTable } from "./views/table";
import { persistSlots, loadSlots } from "./db/slots";

export interface WorkerEnv {
  DB: D1Database;
  PUSHDEER_KEYS?: string;
  USTHING_UST_ID?: string;
  USTHING_USER_TYPE?: string;
  USTHING_FACILITY_IDS?: string;
  USTHING_BEARER?: string;
}

function parsePushConfig(env?: WorkerEnv): PushDeerConfig | null {
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

function parseUSThingConfig(env?: WorkerEnv): USThingConfig {
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
    bearer: env?.USTHING_BEARER?.trim() || undefined,
  };
}

export async function runTimeslotSync(
  env: WorkerEnv,
  fetchImpl: typeof fetch = fetch,
  startDate?: string,
  endDate?: string
): Promise<{
  slots: UnifiedTimeSlot[];
  warnings: string[];
  startDate: string;
  endDate: string;
  generatedAt: Date;
}> {
  const effectiveStart = startDate ?? getTodayUTC8();
  const effectiveEnd = endDate ?? getDateDaysAhead(14);
  const usthingConfig = parseUSThingConfig(env);
  const warnings: string[] = [];

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

  return { slots, warnings, startDate: effectiveStart, endDate: effectiveEnd, generatedAt };
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const startDate = getTodayUTC8();
    const endDate = getDateDaysAhead(14);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    let warnings: string[] = [];
    let generatedAt = new Date();

    let { slots: dbSlots, latestUpdatedAt } = await loadSlots(
      env.DB,
      startDate,
      endDate
    );

    if (dbSlots.length === 0 || forceRefresh) {
      const syncResult = await runTimeslotSync(env, fetch, startDate, endDate);
      warnings = warnings.concat(syncResult.warnings);
      generatedAt = syncResult.generatedAt;
      const reload = await loadSlots(env.DB, startDate, endDate);
      dbSlots = reload.slots;
      latestUpdatedAt = reload.latestUpdatedAt ?? latestUpdatedAt;
    }

    if (latestUpdatedAt) {
      const parsed = new Date(latestUpdatedAt);
      if (!Number.isNaN(parsed.getTime())) {
        generatedAt = parsed;
      }
    }

    let displaySlots = dbSlots;
    if (!displaySlots.length) {
      warnings.push(
        "No slot data is currently available. The D1 snapshot may be empty."
      );
    }

    const format = url.searchParams.get("format");
    const accept = request.headers.get("Accept") ?? "";
    const wantsHtml = format === "html" || accept.includes("text/html");
    const pageParam = Number.parseInt(url.searchParams.get("page") ?? "0", 10);
    const page = Number.isFinite(pageParam) ? Math.max(0, pageParam) : 0;

    if (wantsHtml) {
      const baseParams = new URLSearchParams(url.searchParams);
      baseParams.set("format", "html");
      baseParams.delete("page");
      const baseQuery = baseParams.toString();
      const html = renderSlotsTable(displaySlots, {
        generatedAt,
        page,
        pageSize: 8,
        basePath: url.pathname,
        baseQuery,
        warnings,
      });
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const body = JSON.stringify(
      {
        count: displaySlots.length,
        startDate,
        endDate,
        refreshed: forceRefresh,
        lastUpdatedAt: generatedAt.toISOString(),
        warnings,
        slots: displaySlots,
      },
      null,
      2
    );
    return new Response(body, {
      headers: { "Content-Type": "application/json" },
    });
  },

  async scheduled(
    event: ScheduledEvent,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    const startDate = getTodayUTC8();
    const endDate = getDateDaysAhead(14);
    ctx.waitUntil(
      (async () => {
        const result = await runTimeslotSync(env, fetch, startDate, endDate);
        if (result.warnings.length) {
          console.warn("Scheduled sync warnings:", result.warnings);
        }
      })()
    );
  },
};
