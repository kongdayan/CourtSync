import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("rules routes", () => {
  it("returns 401 without session", async () => {
    const response = await exports.default.fetch("http://example.com/api/rules");
    expect(response.status).toBe(401);
  });

  // More tests will need session mocking — these basic smoke tests validate routing works
  it("returns 401 for rule-options without session", async () => {
    const response = await exports.default.fetch("http://example.com/api/rule-options");
    expect(response.status).toBe(401);
  });
});
