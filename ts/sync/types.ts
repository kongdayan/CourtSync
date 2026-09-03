import type { DataSourceKey } from "../shared/sources";
import type { UnifiedTimeSlot } from "../types";

export type SourceSyncStatus = "success" | "failed" | "closed";

export interface SourceSyncResult {
  source: DataSourceKey;
  status: SourceSyncStatus;
  slots: UnifiedTimeSlot[];
  warnings: string[];
  completedUnits: number;
  failedUnits: number;
  fatalCode?: string;
  startDate: string;
  endDate: string;
  generatedAt: Date;
}
