import { updateUSThingTimeSlots } from "./service/updateTimeSlots";
import { PushDeerService } from "./notifications/pushdeer";
import {
  UnifiedTimeSlot,
  PushDeerConfig,
  USThingConfig,
} from "./types";
import { getTodayUTC8, getDateDaysAhead } from "./utils/time";
import { renderSlotsTable } from "./views/table";

export interface WorkerEnv {
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
  env?: WorkerEnv,
  fetchImpl: typeof fetch = fetch
): Promise<{ slots: UnifiedTimeSlot[]; warnings: string[] }> {
  const usthingConfig = parseUSThingConfig(env);
  const startDate = getTodayUTC8();
  const endDate = getDateDaysAhead(14);
  const warnings: string[] = [];

  console.log(
    `[USThing] Starting sync for facilities ${usthingConfig.facilityIDs.join(
      ", "
    )} from ${startDate} to ${endDate} (ustID length: ${
      usthingConfig.ustID.length
    }, bearer provided: ${Boolean(usthingConfig.bearer)})`
  );

  const slots = await updateUSThingTimeSlots({
    ustID: usthingConfig.ustID,
    userType: usthingConfig.userType,
    facilityIDs: usthingConfig.facilityIDs,
    startDate,
    endDate,
    bearer: usthingConfig.bearer,
    fetchImpl,
    warnings,
  });

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

  return { slots, warnings };
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

    const { slots, warnings } = await runTimeslotSync(env);
    const url = new URL(request.url);
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
      const html = renderSlotsTable(slots, {
        generatedAt: new Date(),
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
      { count: slots.length, slots, warnings },
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
    ctx.waitUntil(runTimeslotSync(env).then(() => undefined));
  },
};
