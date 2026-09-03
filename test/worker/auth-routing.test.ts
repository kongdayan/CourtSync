import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createApp } from "../../ts/http/app";

/**
 * Better Auth routing smoke tests — deliberately use the REAL createApp
 * (real better-auth handler, real D1 via migrations), with NO stubbed
 * session/auth. These guard the historically-broken /api/auth/* wiring:
 * if the Hono basePath mount or the worker-first asset routing regresses,
 * these fail instead of the login page 404ing in production.
 */
function fetchApp(path: string, init?: RequestInit) {
  return createApp().fetch(new Request(`http://localhost${path}`, init), env as unknown as Env);
}

describe("better auth routing (/api/auth/*)", () => {
  it("GET /api/auth/get-session returns 200 (null when signed out), not 404", async () => {
    const res = await fetchApp("/api/auth/get-session", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("POST /api/auth/sign-in/social reaches better-auth and returns the Google URL", async () => {
    const res = await fetchApp("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/auth/popup-complete?next=/" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url?: string; redirect?: boolean };
    expect(body.redirect).toBe(true);
    expect(body.url).toContain("accounts.google.com");
    // OAuth redirect_uri must be served by the worker, not the SPA assets.
    expect(body.url).toContain(
      encodeURIComponent("http://localhost/api/auth/callback/google"),
    );
  });

  it("unknown /api/auth/* subpaths are handled by better-auth, not the SPA 404", async () => {
    const res = await fetchApp("/api/auth/no-such-endpoint");
    const text = await res.text();
    // 404 from better-auth's own router is fine — what must never happen is
    // falling through to the SPA HTML (assets would swallow /api/auth/*).
    expect(res.status).toBe(404);
    expect(text).not.toContain("<html");
  });

  it("app-level /api routes still reach our handlers (no auth regression)", async () => {
    const health = await fetchApp("/api/health");
    expect(health.status).toBe(200);

    // Protected route without a session -> our 401, not better-auth's.
    const rules = await fetchApp("/api/rules");
    expect(rules.status).toBe(401);
  });
});
