import { USThingTimeSlot } from "../types";

type HeaderMap = Record<string, string>;

const BASE_HEADERS: HeaderMap = {
  Accept: "application/json",
  "Content-Length": "0",
  Connection: "keep-alive",
  Cookie: "language=en-US",
  "User-Agent": "USThing/428 CFNetwork/3860.100.1 Darwin/25.0.0",
};

function buildHeaders(bearer?: string): HeaderMap {
  const headers: HeaderMap = { ...BASE_HEADERS };
  if (bearer) {
    headers.Authorization = bearer.startsWith("Bearer ")
      ? bearer
      : `Bearer ${bearer}`;
  }
  return headers;
}

interface USThingTimeslotResponse {
  status: string;
  message: string;
  facilityID: number;
  userType: string;
  ustID: string;
  startDate: string;
  endDate: string;
  timeslot: USThingTimeSlot[];
}

interface USThingBookingResponse {
  status: string;
  message: string;
  errorCode: string;
  totalRecord: number;
  userType: string;
  ustID: string;
  emailAddr: string;
  facilityID: number;
  timeslotDate: string;
  startTime: string;
  endTime: string;
  bookingRef: number;
  cancelInd: string | null;
  bookingResult: unknown[];
}

export async function getAvailableTimeSlots(
  ustID: string,
  userType: string,
  facilityID: string,
  startDate: string,
  endDate: string,
  options: { fetchImpl?: typeof fetch; bearer?: string } = {}
): Promise<USThingTimeSlot[]> {
  const { fetchImpl = fetch, bearer } = options;
  const url = `https://ms.api.usthing.xyz/v2/fbs/facilityTimeslot?ustID=${encodeURIComponent(
    ustID
  )}&userType=${encodeURIComponent(
    userType
  )}&facilityID=${encodeURIComponent(
    facilityID
  )}&startDate=${encodeURIComponent(
    startDate
  )}&endDate=${encodeURIComponent(endDate)}`;

  console.log(
    `[USThing] GET facilityTimeslot ustID length=${ustID.length} userType=${userType} facility=${facilityID} range=${startDate}->${endDate} bearerProvided=${Boolean(
      bearer
    )}`
  );

  const response = await fetchImpl(url, {
    method: "GET",
    headers: buildHeaders(bearer),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `USThing scan failed with ${response.status}: ${response.statusText}. Body: ${text}`
    );
  }

  const data = (await response.json()) as USThingTimeslotResponse;

  if (data.status !== "200") {
    throw new Error(`Unexpected status: ${data.status}`);
  }

  return (data.timeslot ?? []).filter(
    (slot) => slot.timeslotStatus === "Available"
  );
}

export async function booking(
  ustID: string,
  userType: string,
  facilityID: string,
  timeslotDate: string,
  startTime: string,
  endTime: string,
  cancelInd: string,
  options: { fetchImpl?: typeof fetch; bearer?: string } = {}
): Promise<USThingBookingResponse> {
  const { fetchImpl = fetch, bearer } = options;
  const url = `https://ms.api.usthing.xyz/v2/fbs/book?ustID=${encodeURIComponent(
    ustID
  )}&userType=${encodeURIComponent(
    userType
  )}&facilityID=${encodeURIComponent(
    facilityID
  )}&timeslotDate=${encodeURIComponent(
    timeslotDate
  )}&startTime=${encodeURIComponent(
    startTime
  )}&endTime=${encodeURIComponent(
    endTime
  )}&cancelInd=${encodeURIComponent(cancelInd)}`;

  console.log(
    `[USThing] POST book ustID length=${ustID.length} userType=${userType} facility=${facilityID} date=${timeslotDate} ${startTime}-${endTime} cancelInd=${cancelInd} bearerProvided=${Boolean(
      bearer
    )}`
  );

  const response = await fetchImpl(url, {
    method: "POST",
    headers: buildHeaders(bearer),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `USThing booking failed with ${response.status}: ${response.statusText}. Body: ${text}`
    );
  }

  const data = (await response.json()) as USThingBookingResponse;

  if (data.status !== "200") {
    throw new Error(`USThing booking unsuccessful: ${data.message}`);
  }

  return data;
}
