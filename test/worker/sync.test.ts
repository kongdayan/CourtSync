import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { runTimeslotSync, syncConfiguredSources } from "../../ts/sync/run";

describe("syncConfiguredSources", () => {
  it("runs both sources independently and preserves their order", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ source: "usthing", status: "success", slots: [], warnings: [] })
      .mockResolvedValueOnce({ source: "jiushi", status: "success", slots: [], warnings: [] });

    const results = await syncConfiguredSources(run as never);

    expect(run.mock.calls.map(([source]) => source)).toEqual(["usthing", "jiushi"]);
    expect(results.map((result) => result.source)).toEqual(["usthing", "jiushi"]);
  });

  it("queries the private Jiushi proxy and persists its response without public fetch", async () => {
    await env.JIUSHI_DB.prepare(`CREATE TABLE IF NOT EXISTS slot_snapshot (
      facility_id TEXT, slot_date TEXT, start_time TEXT, end_time TEXT,
      status TEXT, activity_name TEXT, updated_at TEXT,
      PRIMARY KEY (facility_id, slot_date, start_time)
    )`).run();
    const publicFetch = vi.fn<typeof fetch>();
    const proxyFetch = vi.fn(async function (this: Fetcher) {
      expect(this).toBe(proxy);
      return Response.json({
        rtnCode: "10000", rtnMessage: "成功",
        data: {
          groundList: [{ groundId: "test-court", name: "Test court" }],
          statusList: [{
            startTime: Date.parse("2026-10-18T18:00:00+08:00"),
            endTime: Date.parse("2026-10-18T19:00:00+08:00"),
            blockModel: [{ groundId: "test-court", groundName: "Test court", status: "1" }],
          }],
        },
      });
    });
    const proxy = { fetch: proxyFetch } as Fetcher;
    const result = await runTimeslotSync("jiushi", {
      ...env, JIUSHI_VENUE_ID: "27", JIUSHI_MAX_DAYS: "9",
      JIUSHI_PROXY: proxy, JIUSHI_PROXY_URL: "https://legacy.example.test",
      JIUSHI_PROXY_TOKEN: "test-token",
    }, publicFetch, "2026-10-18", "2026-10-18");

    expect(publicFetch).not.toHaveBeenCalled();
    expect(proxyFetch).toHaveBeenCalledWith("http://jiushi-proxy.internal", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      body: JSON.stringify({ venueId: "27", bookTime: 1792252800000 }),
    }));
    expect(result.warnings).toEqual([]);
    expect(await env.JIUSHI_DB.prepare("SELECT status FROM slot_snapshot WHERE facility_id = ?")
      .bind("test-court").first()).toEqual({ status: "Available" });
  });
});
