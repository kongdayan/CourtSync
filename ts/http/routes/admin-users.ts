import { Hono } from "hono";
import { AdminRepository } from "../../app-db/admin-repository";
import type { AuthVariables } from "../middleware/session";

/**
 * Admin user management route handlers (no middleware).
 *
 * Middleware (session + active user + admin role) is applied by the
 * caller in {@link createApp} via a wrapping Hono instance.
 */
export const adminUsersRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

  // GET /api/admin/users
  .get("/admin/users", async (c) => {
    const repo = new AdminRepository(c.env.APP_DB);
    const status = c.req.query("status") as any;
    const search = c.req.query("search");
    const users = await repo.listUsers({ status, search });
    return c.json(users);
  })

  // PATCH /api/admin/users/:id/access
  .patch("/admin/users/:id/access", async (c) => {
    const body = await c.req.json<{ status?: string; role?: string; ruleLimit?: number }>();
    if (body.ruleLimit !== undefined && (body.ruleLimit < 0 || body.ruleLimit > 1000)) {
      return c.json({ error: "invalid ruleLimit" }, 400);
    }
    const repo = new AdminRepository(c.env.APP_DB);
    try {
      const result = await repo.updateAccess(
        c.get("access").userId,
        c.req.param("id"),
        {
          status: body.status as any,
          role: body.role as any,
          ruleLimit: body.ruleLimit,
          requestId: c.req.header("X-Request-Id") ?? crypto.randomUUID(),
          now: new Date().toISOString(),
        }
      );
      return c.json(result);
    } catch (err: any) {
      if (err.message === "user not found") return c.json({ error: "user_not_found" }, 404);
      throw err;
    }
  })

  // GET /api/admin/audit
  .get("/admin/audit", async (c) => {
    const repo = new AdminRepository(c.env.APP_DB);
    const targetUserId = c.req.query("targetUserId");
    if (!targetUserId) return c.json({ error: "targetUserId required" }, 400);
    const logs = await repo.getAuditLogs(targetUserId);
    return c.json(logs);
  });
