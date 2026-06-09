import { Hono } from "hono";

export const healthRoutes = new Hono<{ Bindings: Env }>().get("/health", (c) =>
  c.json({ ok: true, service: "courtsync" }),
);
