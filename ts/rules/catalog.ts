import type { DataSourceKey } from "../shared/sources";

export interface FacilityOption {
  id: string;
  label: string;
}

export const FACILITY_CATALOG: Record<DataSourceKey, FacilityOption[]> = {
  usthing: [
    { id: "2", label: "LG1C1" },
    { id: "3", label: "LG1C2" },
    { id: "4", label: "LG1C3" },
    { id: "5", label: "LG1C4" },
    { id: "79", label: "LG1C5" },
    { id: "80", label: "LG1C6" },
    { id: "100", label: "SFC1" },
    { id: "101", label: "SFC2" },
  ],
  jiushi: [
    { id: "113", label: "羽毛球 1" }, { id: "114", label: "羽毛球 2" },
    { id: "115", label: "羽毛球 3" }, { id: "116", label: "羽毛球 4" },
    { id: "117", label: "羽毛球 5" }, { id: "118", label: "羽毛球 6" },
    { id: "119", label: "羽毛球 7" }, { id: "120", label: "羽毛球 8" },
    { id: "151", label: "羽毛球 9" }, { id: "152", label: "羽毛球 10" },
    { id: "153", label: "羽毛球 11" }, { id: "154", label: "羽毛球 12" },
    { id: "155", label: "羽毛球 13" }, { id: "156", label: "羽毛球 14" },
    { id: "157", label: "羽毛球 15" }, { id: "158", label: "羽毛球 16" },
    { id: "159", label: "羽毛球 17" }, { id: "160", label: "羽毛球 18" },
    { id: "161", label: "羽毛球 19" }, { id: "162", label: "羽毛球 20" },
    { id: "163", label: "羽毛球 21" }, { id: "164", label: "羽毛球 22" },
    { id: "165", label: "羽毛球 23" }, { id: "166", label: "羽毛球 24" },
    { id: "167", label: "羽毛球 25" }, { id: "168", label: "羽毛球 26" },
    { id: "169", label: "羽毛球 27" }, { id: "170", label: "羽毛球 28" },
    { id: "171", label: "羽毛球 29" }, { id: "172", label: "羽毛球 30" },
    { id: "173", label: "羽毛球 31" }, { id: "174", label: "羽毛球 32" },
    { id: "175", label: "羽毛球 33" }, { id: "216", label: "羽毛球 34" },
    { id: "217", label: "羽毛球 35" },
  ],
};

export function getFacilityIdsForSource(source: DataSourceKey): Set<string> {
  return new Set(FACILITY_CATALOG[source].map((f) => f.id));
}
