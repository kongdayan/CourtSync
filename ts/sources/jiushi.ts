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

const DEFAULT_HEADERS: HeaderMap = {
  Connection: "keep-alive",
  app_id: "0ff444f417de34c1352af3b3ffc30348",
  os_type: "wechat_mini",
  "content-type": "application/json",
  os_version: "iOS 18.1",
  fullMobile: "[object Undefined]",
  gw_channel: "api",
  device_type: "iPhone 13<iPhone14,5>",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54(0x18003625) NetType/WIFI Language/zh_CN",
  Referer: "https://servicewechat.com/wxbd4ec54a9e9ce6dd/119/page-frame.html",
};

/** Anti-bot cookies from WeChat session — supplied via env var for rotation */
function getCookie(): string {
  const envCookie = (globalThis as any)?.JIUSHI_COOKIE;
  if (envCookie) return envCookie;
  // 默认 cookie（可能过期，如遇 403 需刷新）
  return "ssxmod_itna3=C50qzx2D9GYYqDvI4QT4CqPxRh4xnDWu5PDQYKpDUBA+40ydidYXDExDPD8DXxBKGRU6M5iDGGG4DzRcdY+ND7oeDsUxBoDThe+LklDQHQ33WeRDPa3WP3KDZnxBdDqx0EH1H=SPSHW9W4zslhsD3YhsC2dYAYD02qDRxD1i4i79YExPK7+BhiGVPBPam0+Iz8=E88=4D;; acw_tc=ac11000117320139878728712e01289119415469e04ea58c2bca1128695933";
}

/** 精简 WAF 错误消息，避免日志爆炸 */
function formatFetchError(status: number, body: string): string {
  if (body.includes("Denied by http_custom")) {
    const reqId = body.match(/RequestID:\s*(\S+)/)?.[1] ?? "unknown";
    const ruleId = body.match(/RuleID:\s*(\d+)/)?.[1] ?? "unknown";
    return `Blocked by Alibaba Cloud ESA WAF (RuleID: ${ruleId}, RequestID: ${reqId}). Cloudflare Worker IPs are denied. Consider using a proxy or running Jiushi sync locally.`;
  }
  // 截断非 WAF 错误
  const preview = body.length > 300 ? body.slice(0, 300) + "..." : body;
  return `Unexpected status ${status}. Body: ${preview}`;
}

function generateJsSign(payload: unknown): string {
  const serialized = JSON.stringify(payload);
  const digest = md5Hex(serialized + JIUSHI_SALT);
  return toBase64(digest);
}

function coerceTimestamp(value: number | string): number {
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Jiushi timestamp: ${value}`);
  }
  return parsed;
}

export async function queryVenueData(
  venueId: string,
  bookTimeSeconds: number,
  fetchImpl: typeof fetch = fetch,
  options: { proxyUrl?: string } = {}
): Promise<JiushiResponse> {
  const baseUrl = options.proxyUrl ?? "https://jsapp.jussyun.com";
  const url = `${baseUrl}/jiushi-core/venue/getVenueGround`;
  const payload = {
    venueId,
    bookTime: bookTimeSeconds * 1000,
  };

  const headers: HeaderMap = { ...DEFAULT_HEADERS };
  headers.cookie = getCookie();
  headers.js_sign = generateJsSign(payload);

  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatFetchError(response.status, text));
  }

  const data = (await response.json()) as JiushiResponse;

  if (data.rtnCode !== "10000") {
    throw new Error(`API error: ${data.rtnMessage ?? "unknown error"}`);
  }

  return data;
}

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
  options: { proxyUrl?: string } = {}
): Promise<UnifiedTimeSlot[]> {
  const bookTime = dateStringToUnixSeconds(targetDate);
  const response = await queryVenueData(venueId, bookTime, fetchImpl, options);
  return responseToUnifiedSlots(response, venueId);
}
