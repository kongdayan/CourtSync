import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("legacy route removal", () => {
  it("does not expose the bearer token administration page", async () => {
    const response = await exports.default.fetch("http://example.com/admin/token");
    expect(response.status).toBe(404);
  });

  it("does not return server-rendered dashboard HTML from the Worker API", async () => {
    const response = await exports.default.fetch("http://example.com/api/slots?format=html");
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
