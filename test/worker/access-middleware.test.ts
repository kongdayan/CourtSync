import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createApp } from "../../ts/http/app";
import type { UserAccess } from "../../ts/app-db/types";

function createAccessTestApp(status: string | undefined) {
  return createApp({
    getSession: async () => {
      if (!status) return null;
      return {
        user: {
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
          image: null,
        },
        session: { id: "session-1", token: "token-1" },
      };
    },
    ensureForLogin: async (params) =>
      ({
        userId: params.userId,
        role: "user" as const,
        status: (status ?? "active") as UserAccess["status"],
        ruleLimit: 5,
        firstLoginAt: "2026-01-01T00:00:00.000Z",
        lastLoginAt: "2026-06-09T00:00:00.000Z",
        statusChangedAt: "2026-01-01T00:00:00.000Z",
        statusChangedBy: undefined,
      }) satisfies UserAccess,
  });
}

describe("access middleware", () => {
  it.each([
    [undefined, 401, "unauthenticated"],
    ["pending", 403, "pending_approval"],
    ["disabled", 403, "account_disabled"],
  ] as const)("rejects %s access", async (status, expectedStatus, code) => {
    const app = createAccessTestApp(status);
    const response = await app.request("/api/protected", {}, env);
    expect(response.status).toBe(expectedStatus);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: code });
  });

  it("allows active users", async () => {
    const app = createAccessTestApp("active");
    const response = await app.request("/api/protected", {}, env);
    expect(response.status).toBe(200);
  });

  it("rejects cross-origin business mutations", async () => {
    const app = createAccessTestApp("active");
    const response = await app.request(
      "/api/protected",
      {
        method: "POST",
        headers: {
          Origin: "https://attacker.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      },
      env,
    );
    expect(response.status).toBe(403);
  });
});
