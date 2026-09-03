import { z } from "zod";
import { SOURCE_DEFINITIONS, HOURLY_TIMESLOTS } from "../shared/sources";
import type { DataSourceKey } from "../shared/sources";
import { getFacilityIdsForSource } from "./catalog";
import { weekdaysToMask, timeslotsToMask } from "./masks";

const sourceKeys = Object.keys(SOURCE_DEFINITIONS) as [string, ...string[]];
const timeslotStarts = HOURLY_TIMESLOTS.map((t) => t.start) as [string, ...string[]];

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  source: z.enum(sourceKeys as [string, ...string[]]),
  weekdays: z.array(z.number().int().min(1).max(7)).default([]),
  facilityIds: z.array(z.string()).default([]),
  timeslots: z.array(z.enum(timeslotStarts as [string, ...string[]])).default([]),
  minConsecutive: z.number().int().min(1).max(12).default(1),
  pushLimit: z.union([z.literal(-1), z.number().int().min(0).max(100)]).default(3),
  enabled: z.boolean().default(true),
}).refine(
  (data) => {
    const validIds = getFacilityIdsForSource(data.source as DataSourceKey);
    return data.facilityIds.every((id) => validIds.has(id));
  },
  { message: "facility IDs must belong to the selected source", path: ["facilityIds"] }
);

export type RuleInput = z.infer<typeof ruleInputSchema>;

export interface CompiledRule {
  name: string;
  source: DataSourceKey;
  weekdayMask: number;
  timeslotMask: number;
  facilityIds: string[];
  minConsecutive: number;
  pushLimit: number;
  enabled: boolean;
}

export function compileRuleInput(input: RuleInput): CompiledRule {
  const enabled = input.pushLimit === 0 ? false : input.enabled;
  return {
    name: input.name,
    source: input.source as DataSourceKey,
    weekdayMask: weekdaysToMask(input.weekdays),
    timeslotMask: timeslotsToMask(input.timeslots),
    facilityIds: input.facilityIds,
    minConsecutive: input.minConsecutive,
    pushLimit: input.pushLimit,
    enabled,
  };
}
