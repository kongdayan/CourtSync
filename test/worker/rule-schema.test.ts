import { describe, expect, it } from "vitest";
import { compileRuleInput, ruleInputSchema, rulePatchSchema } from "../../ts/rules/schema";

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

describe("rulePatchSchema (PATCH /api/rules/:id)", () => {
  it("parses a name-only update (regression: zod v4 .partial() crashed on refined schemas)", () => {
    const parsed = rulePatchSchema.safeParse({ name: "改个名字" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("改个名字");
      expect(parsed.data.weekdays).toBeUndefined();
      expect(parsed.data.timeslots).toBeUndefined();
      expect(parsed.data.facilityIds).toBeUndefined();
      expect(parsed.data.source).toBeUndefined();
    }
  });

  it("does not inject defaults for absent keys (name-only PATCH must not clear masks)", () => {
    const parsed = rulePatchSchema.safeParse({ name: "only-name" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Absent multi-select fields stay undefined so the route handler does
      // NOT overwrite weekdayMask/timeslotMask with the empty-set mask.
      expect(parsed.data.weekdays).toBeUndefined();
      expect(parsed.data.timeslots).toBeUndefined();
    }
  });

  it("parses partial multi-selects without coercion", () => {
    const parsed = rulePatchSchema.safeParse({
      name: "周末晚上",
      weekdays: [6, 7],
      minConsecutive: 2,
      pushLimit: -1,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.weekdays).toEqual([6, 7]);
      expect(parsed.data.minConsecutive).toBe(2);
      expect(parsed.data.pushLimit).toBe(-1);
    }
  });

  it("rejects invalid field shapes in partial updates", () => {
    const parsed = rulePatchSchema.safeParse({ minConsecutive: 99 });
    expect(parsed.success).toBe(false);
  });
});
