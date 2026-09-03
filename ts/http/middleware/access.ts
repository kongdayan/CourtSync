import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "./session";

/**
 * Middleware that rejects requests from users who are not yet active.
 *
 * Must be registered after {@link createSessionMiddleware} so that
 * `c.var.access` is populated.
 *
 * - 403 `{ error: "pending_approval" }`  – user's registration is still pending.
 * - 403 `{ error: "account_disabled" }`  – user has been disabled.
 */
export const activeUserMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const access = c.get("access");

  if (access.status === "pending") {
    return c.json({ error: "pending_approval" }, 403);
  }
  if (access.status === "disabled") {
    return c.json({ error: "account_disabled" }, 403);
  }

  await next();
});

/**
 * Middleware that rejects non-admin users.
 *
 * Must be registered after {@link createSessionMiddleware} so that
 * `c.var.access` is populated.
 *
 * - 403 `{ error: "admin_required" }`  – user does not have the admin role.
 */
export const adminMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const access = c.get("access");

  if (access.role !== "admin") {
    return c.json({ error: "admin_required" }, 403);
  }

  await next();
});
