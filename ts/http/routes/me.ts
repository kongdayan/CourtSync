import { Hono } from "hono";
import type { AuthVariables } from "../middleware/session";

export const meRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>().get("/me", (c) => {
  const session = c.get("session");
  const access = c.get("access");
  return c.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
    access: {
      role: access.role,
      status: access.status,
      ruleLimit: access.ruleLimit,
    },
  });
});
