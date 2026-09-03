import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("admin diagnostics", () => {
  it("returns 401 without session", async () => {
    const response = await exports.default.fetch("http://localhost/api/admin/diagnostics/admin-pushdeer", { method: "POST" });
    expect(response.status).toBe(401);
  });
});
