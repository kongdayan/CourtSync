import { md5Hex } from "../utils/md5";
import { toBase64 } from "../utils/base64";
import {
  dateStringToUnixSeconds,
  formatAsDateUTC8,
  formatAsTimeUTC8,
} from "../utils/time";
import { UnifiedTimeSlot } from "../types";

interface JiushiGround {
  groundId: string;
  name: string;
}

interface JiushiBlockModel {
  groundId: string;
  groundName: string;
  id: string;
  price: string;
  sportsType: string;
  status: string;
}

interface JiushiStatusList {
  blockModel: JiushiBlockModel[];
  startTime: number | string;
  endTime: number | string;
  minHour: string;
}

export interface JiushiResponse {
  data: {
    groundList: JiushiGround[];
    statusList: JiushiStatusList[];
  };
  rtnCode: string;
  rtnMessage: string;
}

type HeaderMap = Record<string, string>;

const JIUSHI_SALT = "527093093C418483029EEC61F70E9DD1";
const JIUSHI_API = "https://jsapp.jussyun.com/jiushi-core/venue/getVenueGround";

const BASE_HEADERS: HeaderMap = {
  Connection: "keep-alive",
  app_id: "0ff444f417de34c1352af3b3ffc30348",
  os_type: "wechat_mini",
  "content-type": "application/json",
  os_version: "iOS 18.1",
  device_type: "iPhone 13<iPhone14,5>",
  gw_channel: "api",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54(0x18003625) NetType/WIFI Language/zh_CN",
  Referer: "https://servicewechat.com/wxbd4ec54a9e9ce6dd/119/page-frame.html",
};

// ---- Automated acw_tc cookie acquisition ----

let cachedAcwTc: { cookie: string; expiresAt: number } | null = null;

/**
 * 自动获取阿里云 ESA WAF 的 acw_tc cookie。
 * 发送一次不带 cookie 的预热请求，WAF 会在 Set-Cookie 中返回 token。
 * 有效期 3600s，缓存到过期前 5 分钟。
 */
async function acquireAcwTc(fetchImpl: typeof fetch): Promise<string> {
  // 缓存未过期直接返回
  if (cachedAcwTc && Date.now() + 5 * 60 * 1000 < cachedAcwTc.expiresAt) {
    return cachedAcwTc.cookie;
  }

  // 用 minimal headers 发预热请求（不需要 js_sign）
  const warmupHeaders: HeaderMap = {
    "content-type": "application/json",
    "User-Agent": BASE_HEADERS["User-Agent"],
    Referer: BASE_HEADERS["Referer"],
  };

  const response = await fetchImpl(JIUSHI_API, {
    method: "POST",
    headers: warmupHeaders,
    body: "{}",
  });

  // 从 Set-Cookie 提取 acw_tc（Worker 中必须用 getSetCookie）
  const setCookieAll = response.headers.getSetCookie?.()
    ?? [response.headers.get("set-cookie")].filter(Boolean);
  let match: RegExpMatchArray | null = null;
  for (const sc of setCookieAll) {
    match = sc.match(/acw_tc=([^;]+)/);
    if (match) break;
  }
  if (!match) {
    throw new Error("acw_tc not found in Set-Cookie headers");
  }

  const cookie = `acw_tc=${match[1]}`;
  cachedAcwTc = {
    cookie,
    expiresAt: Date.now() + 3600 * 1000, // acw_tc Max-Age is 3600
  };

  console.log("[Jiushi] Acquired fresh acw_tc cookie");
  return cookie;
}

/** 强制清除 cookie 缓存（遇到 403 时调用） */
function clearAcwTc(): void {
  cachedAcwTc = null;
  console.log("[Jiushi] acw_tc cache cleared");
}

function generateJsSign(payload: unknown): string {
  const serialized = JSON.stringify(payload);
  const digest = md5Hex(serialized + JIUSHI_SALT);
  return toBase64(digest);
}

function coerceTimestamp(value: number | string): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Jiushi timestamp: ${value}`);
  }
  return parsed;
}

/** 精简 WAF 错误消息 */
function formatFetchError(status: number, body: string): string {
  if (body.includes("Denied by http_custom")) {
    const ruleId = body.match(/RuleID:\s*(\d+)/)?.[1] ?? "unknown";
    return `Blocked by WAF (RuleID: ${ruleId}). acw_tc cookie may be stale.`;
  }
  const preview = body.length > 300 ? body.slice(0, 300) + "..." : body;
  return `Unexpected status ${status}. Body: ${preview}`;
}

// ---- Main API call ----

interface QueryOptions {
  fetchImpl?: typeof fetch;
  proxyUrl?: string;
  proxyToken?: string;
}

export async function queryVenueData(
  venueId: string,
  bookTimeSeconds: number,
  fetchImpl: typeof fetch = fetch,
  options: QueryOptions = {}
): Promise<JiushiResponse> {
  const { proxyUrl, proxyToken } = options;
  const payload = {
    venueId,
    bookTime: bookTimeSeconds * 1000,
  };

  // 代理模式：请求直接转发到代理，由代理处理 WAF cookie + 签名
  if (proxyUrl) {
    const headers: HeaderMap = { "Content-Type": "application/json" };
    if (proxyToken) {
      headers.Authorization = `Bearer ${proxyToken}`;
    }
    const resp = await fetchImpl(proxyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(formatFetchError(resp.status, text));
    }
    const data = (await resp.json()) as JiushiResponse;
    if (data.rtnCode !== "10000") {
      throw new Error(`Jiushi API error: ${data.rtnMessage ?? "unknown"}`);
    }
    return data;
  }

  // 直连模式：自行获取 WAF cookie + 签名
  const jsSign = generateJsSign(payload);

  const makeRequest = async (cookie: string) => {
    const headers: HeaderMap = {
      ...BASE_HEADERS,
      cookie,
      js_sign: jsSign,
    };
    return fetchImpl(JIUSHI_API, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  };

  let cookie: string;
  try {
    cookie = await acquireAcwTc(fetchImpl);
  } catch {
    cookie = "";
  }

  let response = await makeRequest(cookie);

  if (response.status === 403) {
    const text = await response.text();
    if (text.includes("Denied by http_custom")) {
      console.log("[Jiushi] WAF blocked — refreshing acw_tc and retrying...");
      clearAcwTc();
      try {
        cookie = await acquireAcwTc(fetchImpl);
      } catch {
        throw new Error(formatFetchError(403, text));
      }
      response = await makeRequest(cookie);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatFetchError(response.status, text));
  }

  const data = (await response.json()) as JiushiResponse;

  if (data.rtnCode !== "10000") {
    throw new Error(`Jiushi API error: ${data.rtnMessage ?? "unknown"}`);
  }

  return data;
}

// ---- Converter ----

export function responseToUnifiedSlots(
  response: JiushiResponse,
  fallbackFacilityID: string
): UnifiedTimeSlot[] {
  const slots: UnifiedTimeSlot[] = [];

  for (const status of response.data.statusList ?? []) {
    const startMs = coerceTimestamp(status.startTime);
    const endMs = coerceTimestamp(status.endTime);
    const date = formatAsDateUTC8(new Date(startMs));
    const start = formatAsTimeUTC8(startMs);
    const end = formatAsTimeUTC8(endMs);

    for (const block of status.blockModel ?? []) {
      slots.push({
        FacilityID: block.groundId || fallbackFacilityID,
        Date: date,
        StartTime: start,
        EndTime: end,
        Status: block.status === "1" ? "Available" : "Unavailable",
        ActivityName: block.groundName || "",
      });
    }
  }

  return slots;
}

export async function getAvailableTimeSlots(
  facilityId: string,
  targetDate: string,
  fetchImpl: typeof fetch = fetch
): Promise<UnifiedTimeSlot[]> {
  const slots = await getUnifiedSlotsForDate(facilityId, targetDate, fetchImpl);
  return slots.filter((slot) => slot.Status === "Available");
}

export async function getUnifiedSlotsForDate(
  venueId: string,
  targetDate: string,
  fetchImpl: typeof fetch = fetch,
  options: { proxyUrl?: string; proxyToken?: string } = {}
): Promise<UnifiedTimeSlot[]> {
  const bookTime = dateStringToUnixSeconds(targetDate);
  const response = await queryVenueData(venueId, bookTime, fetchImpl, options);
  return responseToUnifiedSlots(response, venueId);
}
