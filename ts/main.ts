import { runScheduledSync } from "./sync/orchestrator";
import { createApp } from "./http/app";
import { DeliveryService } from "./notifications/delivery-service";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

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
