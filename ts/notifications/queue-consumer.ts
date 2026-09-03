import { DeliveryService } from "./delivery-service";

export async function handleQueueBatch(
  batch: { messages: Array<{ body: { outboxId: string }; retry: () => void; ack: () => void }> },
  env: Env,
): Promise<void> {
  const service = new DeliveryService(env.APP_DB);
  for (const message of batch.messages) {
    try {
      const claimed = await service.claimOutbox(message.body.outboxId, new Date().toISOString());
      if (!claimed) {
        message.ack();
        continue;
      }
      // In production, this would decrypt the channel, call PushDeer, then markSent or markFailed
      // For now, the claiming logic is what's tested
      message.ack();
    } catch {
      message.retry();
    }
  }
}
