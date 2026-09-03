import { describe, expect, it } from "vitest";

describe("channel routes", () => {
  it("returns 401 without session", async () => {
    const { exports } = await import("cloudflare:workers");
    const response = await exports.default.fetch("http://example.com/api/channels");
    expect(response.status).toBe(401);
  });
});
