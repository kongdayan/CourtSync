export interface NotificationProvider<TConfig, TPayload> {
  test(config: TConfig, fetchImpl?: typeof fetch): Promise<void>;
}
