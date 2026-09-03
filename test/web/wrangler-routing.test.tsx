import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("wrangler static asset routing", () => {
  it("routes API requests through the Worker before SPA assets", () => {
    // wrangler.jsonc is JSONC (allows whole-line comments) — strip them before parsing.
    const raw = readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "");
    const config = JSON.parse(raw);

    expect(config.assets.run_worker_first).toContain("/api/*");
  });
});
