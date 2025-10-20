const facilityMap: Record<string, string> = {
  "2": "LG1C1",
  "3": "LG1C2",
  "4": "LG1C3",
  "5": "LG1C4",
  "79": "LG1C5",
  "80": "LG1C6",
  "100": "SFC1",
  "101": "SFC2",
};

export function resolveFacilityName(id: string): string {
  return facilityMap[id] ?? id;
}

export function listKnownFacilities(): Array<[string, string]> {
  return Object.entries(facilityMap);
}
