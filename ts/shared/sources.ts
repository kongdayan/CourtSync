export const SOURCE_DEFINITIONS = {
  usthing: { key: "usthing", name: "香港科技大学" },
  jiushi: { key: "jiushi", name: "上海万体汇羽毛球馆" },
} as const;

export type DataSourceKey = keyof typeof SOURCE_DEFINITIONS;

export const HOURLY_TIMESLOTS = Array.from({ length: 15 }, (_, index) => {
  const hour = index + 8;
  return {
    index,
    start: `${String(hour).padStart(2, "0")}:00`,
    end: `${String(hour + 1).padStart(2, "0")}:00`,
  };
});
