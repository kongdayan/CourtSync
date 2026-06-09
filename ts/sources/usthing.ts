import { USThingTimeSlot, USThingFacility, USThingBookingInfo } from "../types";

type HeaderMap = Record<string, string>;

const BASE_HEADERS: HeaderMap = {
  Accept: "application/json",
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

// ---- Azure AD Token ----

interface AzureTokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * 通过 Azure AD ROPC 获取 access token。建议在 Worker 中通过 secrets 传入凭据。
 */
export async function acquireToken(
  username: string,
  password: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<string> {
  // 检查缓存
  if (cachedToken && Date.now() + 5 * 60 * 1000 < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const { fetchImpl = fetch } = options;
  const body = new URLSearchParams();
  body.set("grant_type", "password");
  body.set("client_id", "04b07795-8ddb-461a-bbee-02f9e1bf7b46");
  body.set("scope", "openid profile email offline_access");
  body.set("username", username);
  body.set("password", password);

  const response = await fetchImpl(
    "https://login.microsoftonline.com/c917f3e2-9322-4926-9bb3-daca730413ca/oauth2/v2.0/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Azure AD token request failed with ${response.status}: ${text}`
    );
  }

  const data = (await response.json()) as AzureTokenResponse;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  console.log(`[Auth] Token refreshed, expires in ${data.expires_in}s`);
  return data.access_token;
}

/** 清除缓存的 token（用于凭据变更时） */
export function clearTokenCache(): void {
  cachedToken = null;
}

// ---- Response types (internal) ----

interface USThingTimeslotResponse {
  status: string;
  message: string;
  errorCode?: string;
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

interface USThingFacilityResponse {
  status: string;
  message: string;
  totalRecord: number;
  userType: string;
  ustID: string;
  facility: USThingFacility[];
}

interface USThingBookingInfoResponse {
  status: string;
  message: string;
  errorCode: string;
  totalRecord: number;
  userType: string;
  ustID: string;
  emailAddr: string;
  booking: USThingBookingInfo[];
}

// ---- API Functions ----

/** 获取所有设施列表 (v3) */
export async function getFacilities(
  options: { fetchImpl?: typeof fetch; bearer?: string } = {}
): Promise<USThingFacility[]> {
  const { fetchImpl = fetch, bearer } = options;
  const url = "https://ms.api.usthing.xyz/v3/msapi/fbs/facilities";

  console.log("[USThing] GET facilities");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: buildHeaders(bearer),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `USThing facilities failed with ${response.status}: ${text}`
    );
  }

  const data = (await response.json()) as USThingFacilityResponse;
  console.log(`[USThing] Facilities: ${data.totalRecord} found`);
  return data.facility ?? [];
}

/** 获取可用时间段 (v3) */
export async function getAvailableTimeSlots(
  ustID: string,
  userType: string,
  facilityID: string,
  startDate: string,
  endDate: string,
  options: { fetchImpl?: typeof fetch; bearer?: string } = {}
): Promise<USThingTimeSlot[]> {
  const { fetchImpl = fetch, bearer } = options;
  const url = `https://ms.api.usthing.xyz/v3/msapi/fbs/facilityTimeslot?ustID=${encodeURIComponent(
    ustID
  )}&userType=${encodeURIComponent(
    userType
  )}&facilityID=${encodeURIComponent(
    facilityID
  )}&startDate=${encodeURIComponent(
    startDate
  )}&endDate=${encodeURIComponent(endDate)}`;

  console.log(
    `[USThing] GET facilityTimeslot facility=${facilityID} range=${startDate}→${endDate}`
  );

  const response = await fetchImpl(url, {
    method: "GET",
    headers: buildHeaders(bearer),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `USThing timeslot failed with ${response.status}: ${text}`
    );
  }

  const data = (await response.json()) as USThingTimeslotResponse;

  if (data.errorCode === "03") {
    throw new Error(`USThing system closed: ${data.message}`);
  }

  if (data.status !== "200") {
    throw new Error(`Unexpected status: ${data.status} - ${data.message}`);
  }

  return data.timeslot ?? [];
}

/** 获取当前预订列表 (v3) */
export async function getBookingInfo(
  ustID: string,
  userType: string,
  options: { fetchImpl?: typeof fetch; bearer?: string } = {}
): Promise<USThingBookingInfo[]> {
  const { fetchImpl = fetch, bearer } = options;
  const url = `https://ms.api.usthing.xyz/v3/msapi/fbs/bookingInfo?ustID=${encodeURIComponent(
    ustID
  )}&userType=${encodeURIComponent(userType)}`;

  console.log("[USThing] GET bookingInfo");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: buildHeaders(bearer),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `USThing bookingInfo failed with ${response.status}: ${text}`
    );
  }

  const data = (await response.json()) as USThingBookingInfoResponse;
  console.log(`[USThing] Bookings: ${data.totalRecord}`);
  return data.booking ?? [];
}

/** 预订/取消场地 (v2 — 此端点仍有效) */
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
    `[USThing] POST book facility=${facilityID} ${timeslotDate} ${startTime}-${endTime} cancelInd=${cancelInd}`
  );

  const response = await fetchImpl(url, {
    method: "POST",
    headers: buildHeaders(bearer),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `USThing booking failed with ${response.status}: ${text}`
    );
  }

  const data = (await response.json()) as USThingBookingResponse;

  if (data.status !== "200") {
    throw new Error(`USThing booking unsuccessful: ${data.message}`);
  }

  console.log(
    `[USThing] Booking ${cancelInd === "Y" ? "cancelled" : "created"}, bookingRef=${data.bookingRef}`
  );
  return data;
}
