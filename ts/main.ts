import { updateUSThingTimeSlots } from "./service/updateTimeSlots";
import { PushDeerService } from "./notifications/pushdeer";
import {
  UnifiedTimeSlot,
  PushDeerConfig,
  USThingConfig,
} from "./types";
import { getTodayUTC8, getNextWeekSameDay } from "./utils/time";

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
      .filter(Boolean) ?? ["2", "3", "4", "5"];

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
): Promise<UnifiedTimeSlot[]> {
  const usthingConfig = parseUSThingConfig(env);
  const startDate = getTodayUTC8();
  const endDate = getNextWeekSameDay();

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
  });

  const pushConfig = parsePushConfig(env);

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

  return slots;
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

    const slots = await runTimeslotSync(env);
    const body = JSON.stringify({ count: slots.length, slots }, null, 2);
    return new Response(body, {
      headers: { "Content-Type": "application/json" },
    });
  },

  async scheduled(
    event: ScheduledEvent,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runTimeslotSync(env));
  },
};
