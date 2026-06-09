import { Hono } from "hono";
import { healthRoutes } from "./routes/health";

export function createApp() {
  return new Hono<{ Bindings: Env }>()
    .basePath("/api")
    .route("/", healthRoutes)
    .notFound((c) => c.json({ error: "not_found" }, 404));
}
