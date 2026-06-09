import { runScheduledSync } from "./sync/orchestrator";
import { createApp } from "./http/app";
import { createAuth } from "./auth/config";
import { DeliveryService } from "./notifications/delivery-service";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle Better Auth /api/auth/** at the Worker level.
    if (url.pathname.startsWith("/api/auth")) {
      try {
        const auth = createAuth(env);
        // Construct a fresh request to ensure clean state
        const authReq = new Request(`https://sports.hunao.online${url.pathname}${url.search}`, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          redirect: "manual",
        });
        const res = await auth.handler(authReq);
        return res;
      } catch (err: any) {
        console.error("[Auth] error:", err?.message || String(err));
        return new Response(`Auth error: ${err?.message || "unknown"}`, { status: 500 });
      }
    }

    return createApp().fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<{ outboxId: string }>, env: Env): Promise<void> {
    const service = new DeliveryService(env.APP_DB);
    for (const message of batch.messages) {
      try {
        const claimed = await service.claimOutbox(message.body.outboxId, new Date().toISOString());
        if (claimed) {
          message.ack();
        } else {
          message.ack();
        }
      } catch {
        message.retry();
      }
    }
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runScheduledSync(env, new Date(event.scheduledTime)));
  },
};
