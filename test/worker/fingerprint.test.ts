import { describe, expect, it } from "vitest";
import { fingerprintMatch } from "../../ts/matching/fingerprint";
import type { RuleMatch } from "../../ts/matching/types";

function matchWith(facilityIds: string[]): RuleMatch {
  return {
    fingerprint: "", ruleId: "r1", userId: "u1", ruleName: "t", source: "usthing",
    slotDate: "2026-06-10", startTime: "18:00", endTime: "19:00",
    slotCount: 1, pushLimit: 3,
    availability: [{ startTime: "18:00", endTime: "19:00", facilityIds }],
  };
}

describe("fingerprintMatch", () => {
  it("is stable across facility input order", async () => {
    const fp1 = await fingerprintMatch(matchWith(["117", "113"]));
    const fp2 = await fingerprintMatch(matchWith(["113", "117"]));
    expect(fp1).toBe(fp2);
  });

  it("changes when facility set changes", async () => {
    const fp1 = await fingerprintMatch(matchWith(["113"]));
    const fp2 = await fingerprintMatch(matchWith(["113", "117"]));
    expect(fp1).not.toBe(fp2);
  });
});
