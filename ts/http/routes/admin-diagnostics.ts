import { Hono } from "hono";
import { PushDeerProvider } from "../../notifications/providers/pushdeer";
import { runTimeslotSync } from "../../sync/run";
import type { AuthVariables } from "../middleware/session";

/**
 * Admin diagnostics route handlers (no middleware).
 *
 * Middleware (session + active user + admin role) is applied by the
 * caller in {@link createApp} via a wrapping Hono instance.
 */
export const adminDiagnosticsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

  // POST /api/admin/diagnostics/admin-pushdeer
  .post("/admin/diagnostics/admin-pushdeer", async (c) => {
    const key = c.env.ADMIN_PUSHDEER_KEY;
    if (!key) {
      return c.json({ error: "admin_pushdeer_not_configured" }, 503);
    }

    try {
      const provider = new PushDeerProvider();
      // Override test message for admin alert
      const body = new URLSearchParams({
        pushkey: key,
        text: "CourtSync 管理员告警测试",
        desp: "系统告警通道配置正常。此消息由管理员主动触发。",
        type: "markdown",
      });
      const response = await fetch("https://api2.pushdeer.com/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!response.ok) {
        const message = `PushDeer HTTP ${response.status}`;
        return c.json({ error: "pushdeer_error", message }, 502);
      }
      const json = await response.json() as { code: number };
      if (json.code !== 0) {
        return c.json({ error: "pushdeer_error", message: `code ${json.code}` }, 502);
      }
    } catch (err: any) {
      return c.json({ error: "pushdeer_error", message: err.message?.slice(0, 200) ?? "unknown" }, 502);
    }

    // Audit the action
    await c.env.APP_DB.prepare(`
      INSERT INTO admin_audit_log (id, actor_user_id, action, target_user_id, before_json, after_json, request_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      c.get("access").userId,
      "test_admin_alert",
      c.get("access").userId,
      "{}",
      "{}",
      c.req.header("X-Request-Id") ?? crypto.randomUUID(),
      new Date().toISOString(),
    ).run();

    return c.json({ ok: true });
  })

  // POST /api/admin/diagnostics/jiushi-proxy
  // Tests raw connectivity to JIUSHI_PROXY_URL from inside the Worker.
  // Returns status, response headers and body preview so we can confirm
  // whether the 403 is from Cloudflare edge (error 1003) or the proxy itself.
  .post("/admin/diagnostics/jiushi-proxy", async (c) => {
    const proxyUrl = c.env.JIUSHI_PROXY
      ? "http://jiushi-proxy.internal"
      : c.env.JIUSHI_PROXY_URL?.trim();
    if (!proxyUrl) {
      return c.json({ error: "jiushi_proxy_not_configured" }, 503);
    }

    const proxyToken = c.env.JIUSHI_PROXY_TOKEN?.trim();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (proxyToken) headers.Authorization = `Bearer ${proxyToken}`;

    const startMs = Date.now();
    let status: number;
    let responseHeaders: Record<string, string> = {};
    let bodyPreview: string;
    let durationMs: number;

    try {
      const fetchProxy = c.env.JIUSHI_PROXY
        ? c.env.JIUSHI_PROXY.fetch.bind(c.env.JIUSHI_PROXY)
        : fetch;
      const resp = await fetchProxy(proxyUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ venueId: c.env.JIUSHI_VENUE_ID ?? "27", bookTime: Date.now() }),
      });
      durationMs = Date.now() - startMs;
      status = resp.status;
      resp.headers.forEach((v, k) => { responseHeaders[k] = v; });
      const text = await resp.text();
      bodyPreview = text.length > 500 ? text.slice(0, 500) + "…" : text;
    } catch (err: any) {
      durationMs = Date.now() - startMs;
      return c.json({
        ok: false,
        proxyUrl: proxyUrl.replace(/^(https?:\/\/[^/]{0,6}).*/, "$1…"),
        error: err?.message ?? String(err),
        durationMs,
      });
    }

    return c.json({
      ok: status >= 200 && status < 300,
      proxyUrl: proxyUrl.replace(/^(https?:\/\/[^/]{0,6}).*/, "$1…"),
      status,
      durationMs,
      responseHeaders,
      bodyPreview,
    });
  })

  // POST /api/admin/diagnostics/sync
  // Body: { "source": "jiushi" | "usthing" }
  // Manually triggers one source sync and returns the result (slots count + warnings).
  .post("/admin/diagnostics/sync", async (c) => {
    const body = await c.req.json<{ source?: string }>().catch(() => ({ source: undefined }));
    const source = body?.source;
    if (source !== "jiushi" && source !== "usthing") {
      return c.json({ error: "source must be 'jiushi' or 'usthing'" }, 400);
    }

    const startMs = Date.now();
    try {
      const result = await runTimeslotSync(source, c.env);
      return c.json({
        ok: result.status === "success",
        source: result.source,
        status: result.status,
        slotsCount: result.slots.length,
        warnings: result.warnings,
        startDate: result.startDate,
        endDate: result.endDate,
        durationMs: Date.now() - startMs,
      });
    } catch (err: any) {
      return c.json({
        ok: false,
        source,
        error: err?.message ?? String(err),
        durationMs: Date.now() - startMs,
      }, 500);
    }
  });
