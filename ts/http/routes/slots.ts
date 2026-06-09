import { Hono } from "hono";
import { getTodayUTC8, getDateDaysAhead } from "../../utils/time";
import { loadSlots } from "../../db/slots";
import type { DataSourceKey, UnifiedTimeSlot } from "../../types";

const SOURCE_NAMES: Record<string, string> = {
  usthing: "香港科技大学",
  jiushi: "上海万体汇羽毛球馆",
};

const AVAILABLE_SOURCES = [
  { key: "usthing" as const, name: "香港科技大学" },
  { key: "jiushi" as const, name: "上海万体汇羽毛球馆" },
];

export const slotsRoutes = new Hono<{ Bindings: Env }>().get("/slots", async (c) => {
  const source = (c.req.query("source") ?? "usthing") as DataSourceKey;
  const targetDb = source === "jiushi" ? c.env.JIUSHI_DB : c.env.DB;
  const startDate = getTodayUTC8();
  const endDate = getDateDaysAhead(14);
  const warnings: string[] = [];

  let slots: UnifiedTimeSlot[] = [];
  let latestUpdatedAt: string | null = null;

  if (targetDb) {
    try {
      const result = await loadSlots(targetDb, startDate, endDate);
      slots = result.slots;
      latestUpdatedAt = result.latestUpdatedAt ?? null;
    } catch (err) {
      warnings.push("Unable to load slot data from database.");
    }
  } else {
    warnings.push("Database binding is not available.");
  }

  return c.json({
    source,
    sourceName: SOURCE_NAMES[source] ?? source,
    count: slots.length,
    startDate,
    endDate,
    lastUpdatedAt: latestUpdatedAt ?? new Date().toISOString(),
    warnings,
    slots,
    availableSources: AVAILABLE_SOURCES,
  });
});
