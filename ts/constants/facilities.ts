import { DataSourceKey } from "../types";

const usthingFacilityMap: Record<string, string> = {
  "2": "LG1C1",
  "3": "LG1C2",
  "4": "LG1C3",
  "5": "LG1C4",
  "79": "LG1C5",
  "80": "LG1C6",
  "100": "SFC1",
  "101": "SFC2",
};

const jiushiFacilityMap: Record<string, string> = {
  "113": "羽毛球 1",
  "114": "羽毛球 2",
  "115": "羽毛球 3",
  "116": "羽毛球 4",
  "117": "羽毛球 5",
  "118": "羽毛球 6",
  "119": "羽毛球 7",
  "120": "羽毛球 8",
  "151": "羽毛球 9",
  "152": "羽毛球 10",
  "153": "羽毛球 11",
  "154": "羽毛球 12",
  "155": "羽毛球 13",
  "156": "羽毛球 14",
  "157": "羽毛球 15",
  "158": "羽毛球 16",
  "159": "羽毛球 17",
  "160": "羽毛球 18",
  "161": "羽毛球 19",
  "162": "羽毛球 20",
  "163": "羽毛球 21",
  "164": "羽毛球 22",
  "165": "羽毛球 23",
  "166": "羽毛球 24",
  "167": "羽毛球 25",
  "168": "羽毛球 26",
  "169": "羽毛球 27",
  "170": "羽毛球 28",
  "171": "羽毛球 29",
  "172": "羽毛球 30",
  "173": "羽毛球 31",
  "174": "羽毛球 32",
  "175": "羽毛球 33",
  "216": "羽毛球 34",
  "217": "羽毛球 35",
};

const facilityMaps: Record<DataSourceKey, Record<string, string>> = {
  usthing: usthingFacilityMap,
  jiushi: jiushiFacilityMap,
};

export function resolveFacilityName(
  id: string,
  source: DataSourceKey = "usthing"
): string {
  return facilityMaps[source]?.[id] ?? id;
}

export function listKnownFacilities(
  source: DataSourceKey = "usthing"
): Array<[string, string]> {
  const map = facilityMaps[source];
  return map ? Object.entries(map) : [];
}
