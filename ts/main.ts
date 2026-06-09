import {
  updateUSThingTimeSlots,
  updateJiushiTimeSlots,
} from "./service/updateTimeSlots";
import { PushDeerService } from "./notifications/pushdeer";
import { acquireToken, clearTokenCache, setCredentials } from "./sources/usthing";
import {
  UnifiedTimeSlot,
  PushDeerConfig,
  USThingConfig,
  JiushiConfig,
  DataSourceKey,
} from "./types";
import { getTodayUTC8, getDateDaysAhead } from "./utils/time";
import { renderSlotsTable } from "./views/table";
import { persistSlots, loadSlots } from "./db/slots";

export interface WorkerEnv {
  DB: D1Database;
  JIUSHI_DB?: D1Database;
  hkust_token?: KVNamespace;
  PUSHDEER_KEYS?: string;
  USTHING_UST_ID?: string;
  USTHING_USER_TYPE?: string;
  USTHING_FACILITY_IDS?: string;
  USTHING_BEARER?: string;
  /** Azure AD username for dynamic token (ROPC) */
  USTHING_USERNAME?: string;
  /** Azure AD password for dynamic token (ROPC) */
  USTHING_PASSWORD?: string;
  TOKEN_ADMIN_SECRET?: string;
  JIUSHI_VENUE_ID?: string;
  JIUSHI_GROUND_IDS?: string;
  JIUSHI_MAX_DAYS?: string;
  JIUSHI_PROXY_URL?: string;
  JIUSHI_PROXY_TOKEN?: string;
  JIUSHI_COOKIE?: string;
}

const USTHING_BEARER_KV_KEY = "usthing:bearer";

const DEFAULT_DATA_SOURCE: DataSourceKey = "usthing";
const AVAILABLE_SOURCES: DataSourceKey[] = ["usthing", "jiushi"];

function normalizeDataSource(value: string | null | undefined): DataSourceKey {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "jiushi") {
    return "jiushi";
  }
  return DEFAULT_DATA_SOURCE;
}

export interface TimeslotSyncResult {
  source: DataSourceKey;
  slots: UnifiedTimeSlot[];
  warnings: string[];
  startDate: string;
  endDate: string;
  generatedAt: Date;
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

async function resolveUSThingBearer(
  env: WorkerEnv,
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

function renderTokenAdminPage(params: {
  message?: string;
  error?: string;
}): Response {
  const { message, error } = params;
  const body = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>USThing Bearer Manager</title>
    <style>
      body { font-family: ui-sans-serif, system-ui; margin: 0; padding: 2rem; background: #0f172a; color: #e2e8f0; }
      .card { max-width: 32rem; margin: 0 auto; background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.45); }
      h1 { font-size: 1.4rem; margin-bottom: 1rem; }
      label { display: block; margin-top: 1.2rem; font-weight: 600; color: #cbd5f5; }
      input, textarea { width: 100%; margin-top: 0.4rem; padding: 0.65rem 0.75rem; border-radius: 0.6rem; border: 1px solid rgba(148, 163, 184, 0.3); background: #0f172a; color: #e2e8f0; font-size: 0.95rem; }
      textarea { min-height: 10rem; resize: vertical; }
      button { margin-top: 1.5rem; width: 100%; padding: 0.75rem; border: none; border-radius: 0.75rem; font-size: 1rem; font-weight: 600; color: #0f172a; background: linear-gradient(135deg, #22d3ee, #0ea5e9); cursor: pointer; }
      button:hover { filter: brightness(1.05); }
      .hint { margin-top: 0.75rem; font-size: 0.85rem; color: #94a3b8; }
      .status { margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 0.75rem; font-size: 0.9rem; }
      .status-success { background: rgba(20, 184, 166, 0.12); border: 1px solid rgba(16, 185, 129, 0.45); color: #5eead4; }
      .status-error { background: rgba(239, 68, 68, 0.17); border: 1px solid rgba(239, 68, 68, 0.5); color: #fecaca; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Update USThing Bearer Token</h1>
      <p class="hint">Provide the admin secret and a full <code>Bearer ...</code> string. Submitting the form overwrites the existing entry in the <code>usthing:bearer</code> KV key.</p>
      ${
        message
          ? `<div class="status status-success">${message}</div>`
          : error
          ? `<div class="status status-error">${error}</div>`
          : ""
      }
      <form method="POST">
        <label for="secret">Admin Secret</label>
        <input id="secret" name="secret" type="password" autocomplete="current-password" required />

        <label for="token">USThing Bearer Token</label>
        <textarea id="token" name="token" placeholder="Bearer eyJ0eXAiOiJKV1QiLC..." required></textarea>

        <button type="submit">Save token</button>
      </form>
    </main>
  </body>
</html>`;

  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleTokenAdminRequest(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  if (request.method === "GET") {
    return renderTokenAdminPage({});
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!env.TOKEN_ADMIN_SECRET) {
    return renderTokenAdminPage({
      error:
        "Admin secret is not configured. Set the TOKEN_ADMIN_SECRET variable to enable updates.",
    });
  }

  if (!env.hkust_token) {
    return renderTokenAdminPage({
      error:
        "KV namespace binding is missing. Verify that hkust_token is configured in wrangler.toml.",
    });
  }

  const form = await request.formData();
  const secret = form.get("secret")?.toString().trim() ?? "";
  const token = form.get("token")?.toString().trim() ?? "";

  if (!secret || secret !== env.TOKEN_ADMIN_SECRET) {
    return renderTokenAdminPage({
      error: "Invalid admin secret. Token was not updated.",
    });
  }

  if (!token.toLowerCase().startsWith("bearer ")) {
    return renderTokenAdminPage({
      error: "Token must start with \"Bearer \".",
    });
  }

  try {
    await env.hkust_token.put(USTHING_BEARER_KV_KEY, token);
  } catch (error) {
    console.error("Failed to write token to KV", error);
    return renderTokenAdminPage({
      error: "Unable to write to KV. Check Wrangler bindings and retry.",
    });
  }

  return renderTokenAdminPage({
    message: "Bearer token successfully updated.",
  });
}

async function parseUSThingConfig(
  env: WorkerEnv,
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
  env: WorkerEnv,
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
  env: WorkerEnv,
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
    slots,
    warnings,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    generatedAt,
  };
}

async function runJiushiTimeslotSync(
  env: WorkerEnv,
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
    slots,
    warnings,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    generatedAt,
  };
}

export async function runTimeslotSync(
  source: DataSourceKey,
  env: WorkerEnv,
  fetchImpl: typeof fetch = fetch,
  startDate?: string,
  endDate?: string
): Promise<TimeslotSyncResult> {
  if (source === "jiushi") {
    return runJiushiTimeslotSync(env, fetchImpl, startDate, endDate);
  }
  return runUSThingTimeslotSync(env, fetchImpl, startDate, endDate);
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/admin/token") {
      return handleTokenAdminRequest(request, env);
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const source = normalizeDataSource(url.searchParams.get("source"));
    const targetDb = source === "jiushi" ? env.JIUSHI_DB : env.DB;

    const startDate = getTodayUTC8();
    const endDate = getDateDaysAhead(14);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    let warnings: string[] = [];
    let generatedAt = new Date();

    if (!targetDb) {
      warnings.push(
        source === "jiushi"
          ? "Jiushi database binding (JIUSHI_DB) is not available. Live results will not be cached."
          : "Primary database binding (DB) is not available. Live results will not be cached."
      );
    }

    let { slots: dbSlots, latestUpdatedAt } = await loadSlots(
      targetDb,
      startDate,
      endDate
    );

    if (dbSlots.length === 0 || forceRefresh) {
      const syncResult = await runTimeslotSync(
        source,
        env,
        fetch,
        startDate,
        endDate
      );
      warnings = warnings.concat(syncResult.warnings);
      generatedAt = syncResult.generatedAt;
      if (targetDb) {
        const reload = await loadSlots(targetDb, startDate, endDate);
        dbSlots = reload.slots;
        latestUpdatedAt = reload.latestUpdatedAt ?? latestUpdatedAt;
      } else {
        dbSlots = syncResult.slots;
        latestUpdatedAt = syncResult.generatedAt.toISOString();
      }
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
      const sourceParams = new URLSearchParams(baseParams);
      sourceParams.delete("source");
      const sourceQueryBase = sourceParams.toString();
      const html = renderSlotsTable(displaySlots, {
        generatedAt,
        page,
        pageSize: 8,
        basePath: url.pathname,
        baseQuery,
        source,
        availableSources: AVAILABLE_SOURCES,
        sourceQueryBase,
        warnings,
      });
      const cacheTTL = forceRefresh ? "no-cache" : "public, max-age=120";
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": cacheTTL,
        },
      });
    }

    const body = JSON.stringify(
      {
        count: displaySlots.length,
        startDate,
        endDate,
        source,
        availableSources: AVAILABLE_SOURCES,
        refreshed: forceRefresh,
        lastUpdatedAt: generatedAt.toISOString(),
        warnings,
        slots: displaySlots,
      },
      null,
      2
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": forceRefresh ? "no-cache" : "public, max-age=120",
      },
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
        for (const source of AVAILABLE_SOURCES) {
          try {
            const result = await runTimeslotSync(
              source,
              env,
              fetch,
              startDate,
              endDate
            );
            if (result.warnings.length) {
              console.warn(
                `[${source}] Scheduled sync warnings:`,
                result.warnings
              );
            }
          } catch (error) {
            console.error(`[${source}] Scheduled sync failed`, error);
          }
        }
      })()
    );
  },
};
