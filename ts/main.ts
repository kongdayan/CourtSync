import { runScheduledSync } from "./sync/orchestrator";
import { createApp } from "./http/app";
import { handleQueueBatch } from "./notifications/queue-consumer";

// Immutable routing is shared; bindings and session work remain request scoped.
const app = createApp();

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<{ outboxId: string }>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runScheduledSync(env, new Date(event.scheduledTime)));
  },
};
