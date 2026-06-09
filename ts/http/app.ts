import { Hono } from "hono";
import { AccessRepository } from "../app-db/access-repository";
import { createAuth } from "../auth/config";
import { parseAdminEmails } from "../auth/admin-emails";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { channelsRoutes } from "./routes/channels";
import { rulesRoutes } from "./routes/rules";
import { slotsRoutes } from "./routes/slots";
import { adminUsersRoutes } from "./routes/admin-users";
import { adminDiagnosticsRoutes } from "./routes/admin-diagnostics";
import {
  createSessionMiddleware,
  type AuthVariables,
} from "./middleware/session";
import { activeUserMiddleware, adminMiddleware } from "./middleware/access";
import { sameOriginJsonMiddleware } from "./middleware/same-origin";
import type { UserAccess } from "../app-db/types";

/**
 * Overridable session/access resolvers used to inject stubs during tests.
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

  const sessionMiddleware = createSessionMiddleware({ getSession, ensureForLogin });

  const authenticated = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .use(sessionMiddleware)
    .route("/", meRoutes)
    .use(activeUserMiddleware)
    .use(sameOriginJsonMiddleware)
    .route("/", rulesRoutes)
    .route("/", channelsRoutes)
    .get("/protected", (c) => c.json({ ok: true }));

  const adminApp = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .use(sessionMiddleware)
    .use(activeUserMiddleware)
    .use(adminMiddleware)
    .route("/", adminUsersRoutes)
    .route("/", adminDiagnosticsRoutes);

  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .basePath("/api")
    // Better Auth — mounted as sub-app for proper route matching
    .on(["GET", "POST"], "/auth/*", async (c) => {
      const auth = createAuth(c.env);
      return auth.handler(c.req.raw);
    })
    .route("/", healthRoutes)
    .route("/", slotsRoutes)
    .route("/", authenticated)
    .route("/", adminApp)
    .notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}

