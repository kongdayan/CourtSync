import { UnifiedTimeSlot, AlumniTimeSlot, USThingTimeSlot } from "../types";
import * as alumni from "../sources/alumni";
import * as usthing from "../sources/usthing";
import * as jiushi from "../sources/jiushi";
import { formatAsDateUTC8 } from "../utils/time";

export function convertAlumniToUnified(
  alumniSlots: AlumniTimeSlot[]
): UnifiedTimeSlot[] {
  return alumniSlots.map((slot) => ({
    FacilityID: slot.facility_id,
    Date: slot.date,
    StartTime: slot.start_time,
    EndTime: slot.end_time,
    Status: slot.status,
    ActivityName: slot.activity_name,
  }));
}

export function convertUSThingToUnified(
  usthingSlots: USThingTimeSlot[]
): UnifiedTimeSlot[] {
  return usthingSlots.map((slot) => ({
    FacilityID: String(slot.facilityID),
    Date: slot.timeslotDate,
    StartTime: slot.startTime,
    EndTime: slot.endTime,
    Status: slot.timeslotStatus,
    ActivityName: slot.activityName?.trim() ?? "",
  }));
}

function enumerateDateRangeInclusive(
  startDate: string,
  endDate: string
): string[] {
  const start = new Date(`${startDate}T00:00:00+08:00`);
  const end = new Date(`${endDate}T00:00:00+08:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(
      `Unable to enumerate date range: invalid start (${startDate}) or end (${endDate}) date`
    );
  }

  const results: string[] = [];
  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    results.push(formatAsDateUTC8(cursor));
  }

  return results;
}

interface AlumniOptions {
  facilityIDs?: string[];
  fetchImpl?: typeof fetch;
  startDate: string;
  endDate: string;
}

export async function updateAlumniTimeSlots(
  options: AlumniOptions
): Promise<UnifiedTimeSlot[]> {
  const { facilityIDs = ["2", "3", "4", "5"], fetchImpl = fetch } = options;
  const slots = await Promise.all(
    facilityIDs.map((facilityId) =>
      alumni
        .getAvailableTimeSlots(
          facilityId,
          options.startDate,
          options.endDate,
          fetchImpl
        )
        .catch((error) => {
          console.error(
            `Failed to fetch Alumni slots for facility ${facilityId}:`,
            error
          );
          return [];
        })
    )
  );

  return convertAlumniToUnified(slots.flat());
}

interface USThingOptions {
  facilityIDs?: string[];
  fetchImpl?: typeof fetch;
  ustID: string;
  userType: string;
  startDate: string;
  endDate: string;
  bearer?: string;
  warnings?: string[];
}

export async function updateUSThingTimeSlots(
  options: USThingOptions
): Promise<UnifiedTimeSlot[]> {
  const {
    facilityIDs = ["2", "3", "4", "5", "79", "80", "100", "101"],
    fetchImpl = fetch,
    bearer,
    warnings,
  } = options;

  const addWarning = (message: string) => {
    if (!warnings) {
      return;
    }
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  };

  const jwtWarning =
    "USThing authorization token appears to be invalid or expired. Please contact the administrator to refresh the bearer JWT.";

  console.log(
    `[USThing] Fetching slots for facilities ${facilityIDs.join(
      ", "
    )} between ${options.startDate} and ${options.endDate}`
  );

  const slots = await Promise.all(
    facilityIDs.map((facilityId) =>
      usthing
        .getAvailableTimeSlots(
          options.ustID,
          options.userType,
          facilityId,
          options.startDate,
          options.endDate,
          { fetchImpl, bearer }
        )
        .then((facilitySlots) => {
          console.log(
            `[USThing] Facility ${facilityId} returned ${facilitySlots.length} slots`
          );
          return facilitySlots;
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          const normalized = message.toLowerCase();
          if (
            normalized.includes("jwt") ||
            normalized.includes("unauthor") ||
            normalized.includes("401")
          ) {
            addWarning(jwtWarning);
          }
          addWarning(
            `Failed to fetch USThing slots for facility ${facilityId}: ${message}`
          );
          console.error(
            `Failed to fetch USThing slots for facility ${facilityId}:`,
            error
          );
          return [];
        })
    )
  );

  const flattened = slots.flat();
  console.log(
    `[USThing] Total slots before conversion: ${flattened.length}`
  );
  const unified = convertUSThingToUnified(flattened);
  console.log(
    `[USThing] Total unified slots returned: ${unified.length}`
  );
  return unified;
}

export interface JiushiOptions {
  venueId: string;
  startDate: string;
  endDate: string;
  fetchImpl?: typeof fetch;
  allowedGroundIds?: string[];
  warnings?: string[];
  maxDays?: number;
  /** Proxy URL for bypassing WAF (e.g. Cloudflare Worker → residential proxy → Jiushi) */
  proxyUrl?: string;
}

export async function updateJiushiTimeSlots(
  options: JiushiOptions
): Promise<UnifiedTimeSlot[]> {
  const { fetchImpl = fetch, warnings, allowedGroundIds, proxyUrl } = options;
  const dates = enumerateDateRangeInclusive(options.startDate, options.endDate);
  const boundedDates = options.maxDays
    ? dates.slice(0, Math.max(1, options.maxDays))
    : dates;
  const groundsFilter = allowedGroundIds?.length
    ? new Set(allowedGroundIds)
    : null;

  const addWarning = (message: string) => {
    if (!warnings) {
      return;
    }
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  };

  console.log(
    `[Jiushi] Fetching venue ${options.venueId} for ${boundedDates.length} day(s)${proxyUrl ? ` via proxy ${proxyUrl}` : ""}`
  );

  const aggregated: UnifiedTimeSlot[] = [];
  for (const date of boundedDates) {
    try {
      const slots = await jiushi.getUnifiedSlotsForDate(
        options.venueId,
        date,
        fetchImpl,
        { proxyUrl }
      );
      const filtered = groundsFilter
        ? slots.filter((slot) => groundsFilter.has(slot.FacilityID))
        : slots;
      console.log(`[Jiushi] ${date} returned ${filtered.length} slot(s)`);
      aggregated.push(...filtered);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // WAF 拦截不逐天重试
      if (message.includes("Alibaba Cloud ESA WAF")) {
        addWarning(`Jiushi API blocked by WAF: ${message}`);
        break;
      }
      addWarning(`Failed to fetch Jiushi slots on ${date}: ${message}`);
      console.error(`[Jiushi] Failed to fetch slots on ${date}`, error);

      if (message.includes("超过可包场的时间")) {
        addWarning(
          `Jiushi API booking window exceeded at ${date}; skipping later dates.`
        );
        break;
      }
    }
  }

  return aggregated;
}
