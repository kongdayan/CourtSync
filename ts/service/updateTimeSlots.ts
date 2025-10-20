import { UnifiedTimeSlot, AlumniTimeSlot, USThingTimeSlot } from "../types";
import * as alumni from "../sources/alumni";
import * as usthing from "../sources/usthing";

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
    ActivityName: slot.activityName,
  }));
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
