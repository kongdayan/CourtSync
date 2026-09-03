export interface NotificationPayload {
  matches: Array<{
    ruleName: string;
    slotDate: string;
    startTime: string;
    endTime?: string;
  }>;
}

export interface NotificationProvider<TConfig> {
  test(config: TConfig, fetchImpl?: typeof fetch): Promise<void>;
  send(config: TConfig, payload: NotificationPayload, fetchImpl?: typeof fetch): Promise<void>;
}
