import { createMiddleware } from "hono/factory";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Middleware that protects mutating end-points against cross-origin requests
 * and requires a JSON content-type for mutation bodies.
 *
 * Non-mutating methods (GET, HEAD, OPTIONS) are passed through immediately.
 *
 * - 403 `{ error: "cross_origin_request" }` when the `Origin` header does not
 *   match the application's own origin.
 * - 415 `{ error: "json_required" }` when the content-type is not JSON.
 */
export const sameOriginJsonMiddleware = createMiddleware<{
  Bindings: Env;
}>(async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  const expectedOrigin = new URL(c.env.APP_BASE_URL).origin;
  const origin = c.req.header("Origin");

  if (origin !== expectedOrigin) {
    return c.json({ error: "cross_origin_request" }, 403);
  }

  const contentType = (c.req.header("Content-Type") ?? "")
    .toLowerCase()
    .trim();
  if (!contentType.startsWith("application/json")) {
    return c.json({ error: "json_required" }, 415);
  }

  await next();
});
