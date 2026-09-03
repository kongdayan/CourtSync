import type { NotificationPayload, NotificationProvider } from "./types";

interface PushDeerConfig {
  pushKey: string;
}

function formatPayload(payload: NotificationPayload): string {
  const lines = payload.matches.map((m) => {
    const date = `${m.slotDate.slice(5, 7)}月${m.slotDate.slice(8)}日`;
    const time = m.endTime ? `${m.startTime}–${m.endTime}` : m.startTime;
    return `- ${m.ruleName}: ${date} ${time}`;
  });
  return `【CourtSync 有空场提醒】\n${lines.join("\n")}`;
}

export class PushDeerProvider implements NotificationProvider<PushDeerConfig> {
  async test(config: PushDeerConfig, fetchImpl: typeof fetch = fetch): Promise<void> {
    await this.push(config, fetchImpl, "推送配置验证成功。此消息由用户主动触发，无需处理。", "CourtSync 测试通知");
  }

  async send(config: PushDeerConfig, payload: NotificationPayload, fetchImpl: typeof fetch = fetch): Promise<void> {
    await this.push(config, fetchImpl, formatPayload(payload), "有空场提醒");
  }

  private async push(
    config: PushDeerConfig,
    fetchImpl: typeof fetch,
    text: string,
    desp: string
  ): Promise<void> {
    const body = new URLSearchParams({
      pushkey: config.pushKey,
      text,
      desp,
      type: "markdown",
    });

    const response = await fetchImpl("https://api2.pushdeer.com/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) throw new Error(`PushDeer HTTP ${response.status}`);

    const json = (await response.json()) as { code: number };
    if (json.code !== 0) throw new Error(`PushDeer API code ${json.code}`);
  }
}
