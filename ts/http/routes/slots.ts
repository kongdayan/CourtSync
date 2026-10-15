import { Hono } from "hono";
import { getTodayUTC8 } from "../../utils/time";
import { type DataSourceKey } from "../../shared/sources";
import { SLOTS_CACHE_SECONDS } from "../../shared/slots";
import { readPublishedSnapshot, publicSlotsResponse } from "../../cache/slots-snapshot";

type ResponseCache = Pick<Cache, "match" | "put">;

function matchesEtag(header: string | undefined, etag: string): boolean {
  return !!header && header.split(",").some((part) => part.trim() === "*" || part.trim().replace(/^W\//, "") === etag);
}

function clientResponse(response: Response, ifNoneMatch: string | undefined, hit: boolean): Response {
  const headers = new Headers(response.headers);
  const cachedAt = Number(headers.get("X-CourtSync-Cached-At"));
  const age = Math.max(0, Math.floor((Date.now() - cachedAt) / 1000));
  const remaining = Math.max(0, SLOTS_CACHE_SECONDS - age);
  // Browser reuse must not extend the shared five-minute cache lifetime.
  headers.set("Cache-Control", "public, max-age=" + remaining + ", must-revalidate");
  headers.set("Age", String(age));
  headers.set("X-CourtSync-Cache", hit ? "HIT" : "MISS");
  headers.delete("X-CourtSync-Cached-At");
  if (matchesEtag(ifNoneMatch, headers.get("ETag") ?? "")) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}

export function createSlotsRoutes(deps: { cache?: ResponseCache } = {}) {
  return new Hono<{ Bindings: Env }>().get("/slots", async (c) => {
    const requestedSource = c.req.query("source") ?? "usthing";
    if (requestedSource !== "usthing" && requestedSource !== "jiushi") {
      return c.json({ error: "invalid_source" }, 400);
    }
    const requestedDays = c.req.query("days") ?? "7";
    if (requestedDays !== "7" && requestedDays !== "14") return c.json({ error: "invalid_days" }, 400);
    const source: DataSourceKey = requestedSource;
    const days: 7 | 14 = requestedDays === "7" ? 7 : 14;
    const now = new Date();
    const startDate = getTodayUTC8(now);
    const key = new URL("/api/slots-cache/v2/" + source + "/" + startDate + "/" + days, c.req.url);
    const cache = deps.cache ?? await caches.open("courtsync-slots-v2");
    const cached = await cache.match(key).catch(() => undefined);
    if (cached) return clientResponse(cached, c.req.header("If-None-Match"), true);

    if (!c.env.SLOTS_CACHE) return c.json({ error: "snapshot_not_configured" }, 503);
    try {
      const snapshot = await readPublishedSnapshot(c.env.SLOTS_CACHE, source);
      if (!snapshot) return c.json({ error: "snapshot_unavailable" }, 503);
      const body = JSON.stringify(publicSlotsResponse(snapshot, startDate, days, now));
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
      const etag = '"' + Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("") + '"';
      const response = new Response(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=" + SLOTS_CACHE_SECONDS,
          "ETag": etag,
          "X-CourtSync-Cached-At": String(now.getTime()),
          "X-CourtSync-Cache-TTL": String(SLOTS_CACHE_SECONDS),
        },
      });
      // Concurrent cold misses read KV only, never D1 or the upstream.
      await cache.put(key, response.clone()).catch((error) => console.error("Public response cache write failed", error));
      return clientResponse(response, c.req.header("If-None-Match"), false);
    } catch (error) {
      console.error("Public snapshot read failed", error);
      return c.json({ error: "snapshot_unavailable" }, 503);
    }
  });
}

export const slotsRoutes = createSlotsRoutes();
