import { createMiddleware } from "hono/factory";
import type { UserAccess } from "../../app-db/types";

/**
 * Variables injected into Hono context by the session middleware.
 */
export interface AuthVariables {
  session: {
    user: {
      id: string;
      email: string;
      name: string | null;
      image?: string | null;
    };
    session: {
      id: string;
      token: string;
    };
  };
  access: UserAccess;
}

/**
 * Dependency injections used by the session middleware factory.
 *
 * Each function receives the Cloudflare {@link Env} so that default
 * implementations (backed by real Better Auth + D1) can be wired up
 * inside {@link createApp}, while test stubs can ignore the parameter.
 */
export interface SessionDeps {
  getSession: (
    headers: Headers,
    env: Env,
  ) => Promise<AuthVariables["session"] | null>;
  ensureForLogin: (
    params: { userId: string; email: string },
    env: Env,
  ) => Promise<UserAccess>;
}

/**
 * Creates a Hono middleware that resolves the current user session and
 * access-control record.
 *
 * - Returns 401 `{ error: "unauthenticated" }` when no valid session exists.
 * - Sets `c.var.session` and `c.var.access` for downstream handlers.
 */
export function createSessionMiddleware(deps: SessionDeps) {
  return createMiddleware<{
    Bindings: Env;
    Variables: AuthVariables;
  }>(async (c, next) => {
    const session = await deps.getSession(c.req.raw.headers, c.env);
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const access = await deps.ensureForLogin(
      {
        userId: session.user.id,
        email: session.user.email,
      },
      c.env,
    );

    c.set("session", session);
    c.set("access", access);
    await next();
  });
}
