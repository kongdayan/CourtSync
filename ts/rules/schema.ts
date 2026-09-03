import { z } from "zod";
import { SOURCE_DEFINITIONS, HOURLY_TIMESLOTS } from "../shared/sources";
import type { DataSourceKey } from "../shared/sources";
import { getFacilityIdsForSource } from "./catalog";
import { weekdaysToMask, timeslotsToMask } from "./masks";

const sourceKeys = Object.keys(SOURCE_DEFINITIONS) as [string, ...string[]];
const timeslotStarts = HOURLY_TIMESLOTS.map((t) => t.start) as [string, ...string[]];

const ruleInputFields = {
  name: z.string().trim().min(1).max(80),
  source: z.enum(sourceKeys as [string, ...string[]]),
  weekdays: z.array(z.number().int().min(1).max(7)).default([]),
  facilityIds: z.array(z.string()).default([]),
  timeslots: z.array(z.enum(timeslotStarts as [string, ...string[]])).default([]),
  minConsecutive: z.number().int().min(1).max(12).default(1),
  pushLimit: z.union([z.literal(-1), z.number().int().min(0).max(100)]).default(3),
  enabled: z.boolean().default(true),
};

/**
 * Full schema for create (POST /api/rules).
 * NOTE: contains a top-level `.refine()`. Do NOT call `.partial()` on this
 * schema — zod v4 throws at runtime for refined objects, and `.partial()` on
 * fields carrying `.default()` silently injects defaults for absent keys
 * (PATCH would reset masks). Updates use {@link rulePatchSchema} instead.
 */
export const ruleInputSchema = z.object(ruleInputFields).refine(
  (data) => {
    const validIds = getFacilityIdsForSource(data.source as DataSourceKey);
    return data.facilityIds.every((id) => validIds.has(id));
  },
  { message: "facility IDs must belong to the selected source", path: ["facilityIds"] }
);

/**
 * Partial schema for PATCH /api/rules/:id — every field optional, none with
 * defaults (absent key ⇔ undefined, never a mask-resetting default).
 * Facility/source consistency can't be checked here (existing rule lives in
 * the DB), so RuleService.update enforces it against the merged values.
 */
export const rulePatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  source: z.enum(sourceKeys as [string, ...string[]]).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  facilityIds: z.array(z.string()).optional(),
  timeslots: z.array(z.enum(timeslotStarts as [string, ...string[]])).optional(),
  minConsecutive: z.number().int().min(1).max(12).optional(),
  pushLimit: z.union([z.literal(-1), z.number().int().min(0).max(100)]).optional(),
  enabled: z.boolean().optional(),
});

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
