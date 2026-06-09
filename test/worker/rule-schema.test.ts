import { describe, expect, it } from "vitest";
import { compileRuleInput, ruleInputSchema } from "../../ts/rules/schema";

describe("ruleInputSchema", () => {
  it("treats empty multi-select groups as wildcards", () => {
    const input = ruleInputSchema.parse({
      name: "全天任意场地",
      source: "jiushi",
      weekdays: [],
      facilityIds: [],
      timeslots: [],
      minConsecutive: 2,
      pushLimit: 3,
      enabled: true,
    });

    expect(compileRuleInput(input)).toMatchObject({
      weekdayMask: 0,
      timeslotMask: 0,
      facilityIds: [],
    });
  });

  it("rejects facilities from another source", () => {
    expect(() => ruleInputSchema.parse({
      name: "错误场地",
      source: "jiushi",
      weekdays: [1],
      facilityIds: ["LG1C1"],
      timeslots: ["18:00"],
      minConsecutive: 2,
      pushLimit: 1,
      enabled: true,
    })).toThrow(/facility/i);
  });

  it("normalizes push limit zero to disabled", () => {
    const compiled = compileRuleInput(ruleInputSchema.parse({
      name: "关闭",
      source: "usthing",
      weekdays: [],
      facilityIds: [],
      timeslots: [],
      minConsecutive: 1,
      pushLimit: 0,
      enabled: true,
    }));
    expect(compiled.enabled).toBe(false);
  });
});
