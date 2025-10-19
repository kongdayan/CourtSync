import { UnifiedTimeSlot } from "../types";
import { resolveFacilityName } from "../constants/facilities";

function formatSlots(slots: UnifiedTimeSlot[]): string {
  const parts: string[] = [];

  for (const slot of slots) {
    const facilityName = resolveFacilityName(slot.FacilityID);
    parts.push(
      `${slot.Date.slice(5, 7)}月${slot.Date.slice(8)}日${slot.StartTime.slice(
        0,
        2
      )}点${facilityName}`
    );
  }

  return parts.join(", ");
}

export class PushDeerService {
  constructor(private readonly pushKeys: string[]) {}

  async pushTimeSlots(
    timeslots: UnifiedTimeSlot[],
    fetchImpl: typeof fetch = fetch
  ): Promise<void> {
    const content = formatSlots(timeslots);

    await Promise.all(
      this.pushKeys.map(async (key) => {
        try {
          await this.sendPush(key, content, fetchImpl);
        } catch (error) {
          console.error(`PushDeer send failed for key ${key}:`, error);
        }
      })
    );
  }

  private async sendPush(
    key: string,
    text: string,
    fetchImpl: typeof fetch
  ): Promise<void> {
    const url = `https://api2.pushdeer.com/message/push?pushkey=${encodeURIComponent(
      key
    )}&text=${encodeURIComponent(text)}`;

    const response = await fetchImpl(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(
        `PushDeer responded with ${response.status}: ${response.statusText}`
      );
    }
  }
}
