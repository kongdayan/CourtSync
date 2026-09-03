import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("wrangler static asset routing", () => {
  it("routes API requests through the Worker before SPA assets", () => {
    const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));

    expect(config.assets.run_worker_first).toContain("/api/*");
  });
});
