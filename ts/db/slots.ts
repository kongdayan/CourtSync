import { UnifiedTimeSlot } from "../types";

const UPSERT_SQL = `
  INSERT OR REPLACE INTO slot_snapshot (
    facility_id,
    slot_date,
    start_time,
    end_time,
    status,
    activity_name,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const TRIM_SQL = `
  DELETE FROM slot_snapshot
  WHERE slot_date < ? OR slot_date > ?
`;

const SELECT_RANGE_SQL = `
  SELECT facility_id, slot_date, start_time, end_time, status, activity_name, updated_at
  FROM slot_snapshot
  WHERE slot_date BETWEEN ? AND ?
  ORDER BY slot_date, start_time, facility_id
`;

const BATCH_SIZE = 40;

export async function persistSlots(
  db: D1Database | undefined,
  slots: UnifiedTimeSlot[],
  startDate: string,
  endDate: string,
  generatedAt: Date
): Promise<void> {
  if (!db) {
    return;
  }

  const trimmedSlots = slots.map((slot) => ({
    ...slot,
    ActivityName: slot.ActivityName?.trim() ?? "",
  }));

  try {
    await db.prepare(TRIM_SQL).bind(startDate, endDate).run();
  } catch (error) {
    console.error("Failed to trim slot_snapshot table", error);
  }

  if (!trimmedSlots.length) {
    return;
  }

  const updatedAt = generatedAt.toISOString();
  const statements = trimmedSlots.map((slot) =>
    db
      .prepare(UPSERT_SQL)
      .bind(
        slot.FacilityID,
        slot.Date,
        slot.StartTime,
        slot.EndTime,
        slot.Status,
        slot.ActivityName ?? "",
        updatedAt
      )
  );

  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE);
    await db.batch(chunk);
  }
}

export interface LoadedSlots {
  slots: UnifiedTimeSlot[];
  latestUpdatedAt?: string;
}

export async function loadSlots(
  db: D1Database | undefined,
  startDate: string,
  endDate: string
): Promise<LoadedSlots> {
  if (!db) {
    return { slots: [] };
  }

  const result = await db
    .prepare(SELECT_RANGE_SQL)
    .bind(startDate, endDate)
    .all();

  const rows = result.results ?? [];

  const slots = rows.map((row: any) => ({
    FacilityID: String(row.facility_id),
    Date: String(row.slot_date),
    StartTime: String(row.start_time),
    EndTime: String(row.end_time),
    Status: String(row.status),
    ActivityName: row.activity_name ? String(row.activity_name) : "",
  }));

  let latestUpdatedAt: string | undefined;
  for (const row of rows) {
    if (row.updated_at) {
      const current = String(row.updated_at);
      if (!latestUpdatedAt || current > latestUpdatedAt) {
        latestUpdatedAt = current;
      }
    }
  }

  return { slots, latestUpdatedAt };
}
