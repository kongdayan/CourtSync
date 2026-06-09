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
        const handlerRes = await auth.handler(request);
        // Log for debugging
        console.log(JSON.stringify({
          authPath: url.pathname,
          authMethod: request.method,
          authStatus: handlerRes.status,
          authHeaders: Object.fromEntries(handlerRes.headers.entries()),
        }));
        return handlerRes;
      } catch (err: any) {
        console.error("[Auth] error:", err?.message || String(err));
        return new Response(`Auth error: ${err?.message || "unknown"}`, { status: 500 });
      }
    }

    // Diagnostic: test Better Auth initialization
    if (url.pathname === "/api/debug/auth-init") {
      try {
        const auth = createAuth(env);
        const dbType = typeof env.APP_DB;
        const dbKeys = env.APP_DB ? Object.keys(env.APP_DB).slice(0, 10) : [];
        const prepared = env.APP_DB ? "prepare" in env.APP_DB : false;
        // Test DB query
        let dbOk = false;
        try {
          const result = await env.APP_DB.prepare("SELECT 1 as ok").first<{ ok: number }>();
          dbOk = result?.ok === 1;
        } catch {}
        // Test handler
        const testReq = new Request("https://sports.hunao.online/api/auth/sign-in/social?provider=google&callbackURL=%2F");
        const res = await auth.handler(testReq);
        const body = await res.text().catch(() => "");
        return Response.json({
          dbType, dbKeys, prepared, dbOk,
          handlerStatus: res.status,
          handlerBody: body.slice(0, 300),
          configBaseURL: auth.options?.baseURL ?? "unknown",
          secretLen: env.BETTER_AUTH_SECRET?.length ?? 0,
        });
      } catch (e: any) {
        return Response.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
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
