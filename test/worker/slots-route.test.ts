import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSlotsRoutes } from "../../ts/http/routes/slots";
import { snapshotKey, type PublishedSnapshot } from "../../ts/cache/slots-snapshot";
import { getTodayUTC8, getDateDaysAhead } from "../../ts/utils/time";
import { createApp } from "../../ts/http/app";

function memoryCache() {
  const storage = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: RequestInfo | URL) => storage.get(String(key))?.clone()),
    put: vi.fn(async (key: RequestInfo | URL, value: Response) => { storage.set(String(key), value.clone()); }),
  };
  return { cache, storage };
}
const snapshot = (source: "jiushi" | "usthing" = "jiushi"): PublishedSnapshot => ({
  version: 1, source, healthy: true, lastSyncedAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(),
  slots: [0, 6, 7].map(days => ({ FacilityID: "113", Date: getDateDaysAhead(days), StartTime: "18:00", EndTime: "19:00", Status: "Available", ActivityName: "court" })),
});

beforeEach(async () => { await env.SLOTS_CACHE.delete(snapshotKey("jiushi")); await env.SLOTS_CACHE.delete(snapshotKey("usthing")); });

describe("public snapshot API", () => {
  it("bypasses session resolution and every D1 binding through the full app", async () => {
    await env.SLOTS_CACHE.put(snapshotKey("jiushi"), JSON.stringify(snapshot()));
    const prepare = vi.fn(() => { throw new Error("Public request must not access D1"); });
    const getSession = vi.fn(() => { throw new Error("Public request must not resolve a session"); });
    const bindings = { ...env, DB: { prepare }, JIUSHI_DB: { prepare }, APP_DB: { prepare } } as unknown as Env;
    const response = await createApp({ getSession }).fetch(new Request("https://public-app.test/api/slots?source=jiushi", {
      headers: { Cookie: "better-auth.session_token=private-user" },
    }), bindings);
    expect(response.status).toBe(200);
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });
  it("uses the canonical five-minute cache and honors conditional requests", async () => {
    await env.SLOTS_CACHE.put(snapshotKey("jiushi"), JSON.stringify(snapshot()));
    const { cache } = memoryCache();
    const app = createSlotsRoutes({ cache });
    const first = await app.fetch(new Request("https://example.test/slots?source=jiushi&utm=one", { headers: { Cookie: "private-session=one" } }), env);
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=300, must-revalidate");
    expect(first.headers.get("X-CourtSync-Cache")).toBe("MISS");
    const body = await first.json();
    expect(body).toMatchObject({ source: "jiushi", sourceState: "ready", startDate: getTodayUTC8(), endDate: getDateDaysAhead(6), count: 2 });
    const second = await app.fetch(new Request("https://example.test/slots?tracking=two&days=7&source=jiushi", { headers: { "If-None-Match": "W/" + first.headers.get("ETag"), Cookie: "private-session=two" } }), env);
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("X-CourtSync-Cache")).toBe("HIT");
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(String(cache.put.mock.calls[0][0])).toContain("/jiushi/" + getTodayUTC8() + "/7");
    expect(first.headers.get("Set-Cookie")).toBeNull();
  });

  it("does no D1 work on simultaneous cold misses and separates source/range keys", async () => {
    await env.SLOTS_CACHE.put(snapshotKey("jiushi"), JSON.stringify(snapshot()));
    await env.SLOTS_CACHE.put(snapshotKey("usthing"), JSON.stringify(snapshot("usthing")));
    const prepare = vi.fn(() => { throw new Error("Visitors must not use D1"); });
    const bindings = { ...env, JIUSHI_DB: { prepare }, DB: { prepare }, APP_DB: { prepare } } as unknown as Env;
    const { cache } = memoryCache();
    const app = createSlotsRoutes({ cache });
    const responses = await Promise.all(Array.from({ length: 24 }, () => app.fetch(new Request("https://example.test/slots?source=jiushi"), bindings)));
    expect(responses.every(r => r.status === 200)).toBe(true);
    const extended = await app.fetch(new Request("https://example.test/slots?source=jiushi&days=14"), bindings);
    expect((await extended.json()).count).toBe(3);
    const defaultSource = await app.fetch(new Request("https://example.test/slots"), bindings);
    expect((await defaultSource.json()).source).toBe("usthing");
    expect(prepare).not.toHaveBeenCalled();
    expect(new Set(cache.put.mock.calls.map(([key]) => String(key))).size).toBe(3);
  });

  it("never caches errors or accepts arbitrary cache keys", async () => {
    const { cache } = memoryCache(); const app = createSlotsRoutes({ cache });
    for (const query of ["source=evil", "source=jiushi&days=999"]) {
      expect((await app.fetch(new Request("https://example.test/slots?" + query), env)).status).toBe(400);
    }
    expect((await app.fetch(new Request("https://example.test/slots?source=jiushi"), env)).status).toBe(503);
    await env.SLOTS_CACHE.put(snapshotKey("jiushi"), JSON.stringify({ version: 0, slots: [] }));
    expect((await app.fetch(new Request("https://example.test/slots?source=jiushi"), env)).status).toBe(503);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("does not extend a cached response by another five minutes", async () => {
    const { cache, storage } = memoryCache();
    const key = "https://example.test/api/slots-cache/v2/jiushi/" + getTodayUTC8() + "/7";
    storage.set(key, Response.json({ count: 2 }, { headers: { "X-CourtSync-Cached-At": String(Date.now() - 120_000), ETag: '"old"' } }));
    const response = await createSlotsRoutes({ cache }).fetch(new Request("https://example.test/slots?source=jiushi"), env);
    expect(Number(response.headers.get("Age"))).toBeGreaterThanOrEqual(120);
    expect(response.headers.get("Cache-Control")).toMatch(/max-age=1[78]\d/);
    expect(response.headers.has("X-CourtSync-Cached-At")).toBe(false);
  });

  it("still serves the snapshot if the edge response cache fails", async () => {
    await env.SLOTS_CACHE.put(snapshotKey("jiushi"), JSON.stringify(snapshot()));
    const cache = { match: vi.fn().mockRejectedValue(new Error("cache failed")), put: vi.fn().mockRejectedValue(new Error("cache failed")) };
    expect((await createSlotsRoutes({ cache }).fetch(new Request("https://example.test/slots?source=jiushi"), env)).status).toBe(200);
  });
});
