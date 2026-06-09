import { Hono } from "hono";
import { PushDeerProvider } from "../../notifications/providers/pushdeer";
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
  });
