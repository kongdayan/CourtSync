import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /api/slots", () => {
  it("returns slots response with available sources", async () => {
    const response = await exports.default.fetch(
      "http://example.com/api/slots?source=usthing"
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      source: "usthing",
      sourceName: "香港科技大学",
      availableSources: [
        { key: "usthing", name: "香港科技大学" },
        { key: "jiushi", name: "上海万体汇羽毛球馆" },
      ],
    });
    expect(Array.isArray(body.slots)).toBe(true);
  });

  it("defaults to usthing when no source specified", async () => {
    const response = await exports.default.fetch("http://example.com/api/slots");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("usthing");
  });
});
