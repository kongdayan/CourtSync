import type { NotificationProvider } from "./types";

interface PushDeerConfig {
  pushKey: string;
}

export class PushDeerProvider implements NotificationProvider<PushDeerConfig, unknown> {
  async test(config: PushDeerConfig, fetchImpl: typeof fetch = fetch): Promise<void> {
    const body = new URLSearchParams({
      pushkey: config.pushKey,
      text: "CourtSync 测试通知",
      desp: "推送配置验证成功。此消息由用户主动触发，无需处理。",
      type: "markdown",
    });

    const response = await fetchImpl("https://api2.pushdeer.com/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) throw new Error(`PushDeer HTTP ${response.status}`);

    const json = await response.json() as { code: number };
    if (json.code !== 0) throw new Error(`PushDeer API code ${json.code}`);
  }
}
