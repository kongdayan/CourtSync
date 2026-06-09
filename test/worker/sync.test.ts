import { describe, expect, it, vi } from "vitest";
import { syncConfiguredSources } from "../../ts/sync/run";

describe("syncConfiguredSources", () => {
  it("runs both sources independently and preserves their order", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ source: "usthing", status: "success", slots: [], warnings: [] })
      .mockResolvedValueOnce({ source: "jiushi", status: "success", slots: [], warnings: [] });

    const results = await syncConfiguredSources(run as never);

    expect(run.mock.calls.map(([source]) => source)).toEqual(["usthing", "jiushi"]);
    expect(results.map((result) => result.source)).toEqual(["usthing", "jiushi"]);
  });
});
