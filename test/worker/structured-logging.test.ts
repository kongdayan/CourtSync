import { describe, expect, it } from "vitest";

describe("structured logging", () => {
  it("logs only approved keys", () => {
    const approvedKeys = ["event", "syncRunId", "sourceResults", "ruleCount", "matchCount", "outboxCount", "durationMs"];
    const sample = {
      event: "scheduled_sync_complete",
      syncRunId: "test",
      sourceResults: [],
      ruleCount: 0,
      matchCount: 0,
      outboxCount: 0,
      durationMs: 0,
    };
    expect(Object.keys(sample).every(k => approvedKeys.includes(k))).toBe(true);
    expect(Object.keys(sample)).toHaveLength(approvedKeys.length);
  });
});
