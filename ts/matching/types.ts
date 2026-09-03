import type { DataSourceKey } from "../shared/sources";

export interface CompiledRule {
  id: string;
  userId: string;
  name: string;
  source: DataSourceKey;
  weekdayMask: number;
  timeslotMask: number;
  facilityIds: ReadonlySet<string>;
  minConsecutive: number;
  pushLimit: number;
}

export interface IndexedSlot {
  startTime: string;
  endTime: string;
  availableFacilityIds: ReadonlySet<string>;
}

export type SnapshotIndex = ReadonlyMap<string, ReadonlyMap<string, IndexedSlot>>;

export interface MatchAvailability {
  startTime: string;
  endTime: string;
  facilityIds: string[];
}

export interface RuleMatch {
  fingerprint: string;
  ruleId: string;
  userId: string;
  ruleName: string;
  source: DataSourceKey;
  slotDate: string;
  startTime: string;
  endTime: string;
  slotCount: number;
  availability: MatchAvailability[];
  pushLimit: number;
}
