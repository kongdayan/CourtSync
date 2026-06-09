import { Hono } from "hono";
import { AccessRepository } from "../app-db/access-repository";
import { createAuth } from "../auth/config";
import { parseAdminEmails } from "../auth/admin-emails";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import {
  createSessionMiddleware,
  type AuthVariables,
} from "./middleware/session";
import { activeUserMiddleware } from "./middleware/access";
import { sameOriginJsonMiddleware } from "./middleware/same-origin";
import type { UserAccess } from "../app-db/types";

/**
 * Overridable session/access resolvers used to inject stubs during tests.
 *
 * Each function receives the Cloudflare {@link Env} so that default
 * implementations backed by real Better Auth + D1 can be wired up here,
 * while test stubs ignore the parameter entirely.
 */
export interface AppDependencies {
  getSession?: (
    headers: Headers,
    env: Env,
  ) => Promise<AuthVariables["session"] | null>;
  ensureForLogin?: (
    params: { userId: string; email: string },
    env: Env,
  ) => Promise<UserAccess>;
}

export function createApp(deps?: AppDependencies) {
  // Default resolvers backed by real Better Auth + D1.
  const getSession: NonNullable<AppDependencies["getSession"]> =
    deps?.getSession ??
    (async (headers, env) => {
      const auth = createAuth(env);
      return auth.api.getSession({ headers });
    });

  const ensureForLogin: NonNullable<AppDependencies["ensureForLogin"]> =
    deps?.ensureForLogin ??
    (async (params, env) => {
      const repo = new AccessRepository(env.APP_DB);
      return repo.ensureForLogin({
        userId: params.userId,
        email: params.email,
        adminEmails: parseAdminEmails(env.ADMIN_EMAILS),
        defaultRuleLimit: Number(env.DEFAULT_RULE_LIMIT),
        adminRuleLimit: Number(env.ADMIN_RULE_LIMIT),
        now: new Date().toISOString(),
      });
    });

  const sessionMiddleware = createSessionMiddleware({
    getSession,
    ensureForLogin,
  });

  // Authenticated route group (session + access gate + CSRF).
  // NOTE: meRoutes is mounted before activeUserMiddleware intentionally —
  // pending and disabled users must be able to call GET /api/me to discover
  // their own access status. Protected feature routes go below the gates.
  const authenticated = new Hono<{
    Bindings: Env;
    Variables: AuthVariables;
  }>()
    .use(sessionMiddleware)
    .route("/", meRoutes)
    .use(activeUserMiddleware)
    .use(sameOriginJsonMiddleware)
    .get("/protected", (c) => c.json({ ok: true }));

  return new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .basePath("/api")
    // Better Auth handles /api/auth/* — mounted before any other middleware so
    // that the library owns its own callbacks and form content types.
    .on(["GET", "POST"], "/auth/*", (c) => {
      return createAuth(c.env).handler(c.req.raw);
    })
    .route("/", healthRoutes)
    .route("/", authenticated)
    .notFound((c) => c.json({ error: "not_found" }, 404));
}
