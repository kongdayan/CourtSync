import type { RuleMatch } from "./types";

function canonicalStringify(val: unknown): string {
  if (val === null) return "null";
  if (typeof val === "boolean" || typeof val === "number") return JSON.stringify(val);
  if (typeof val === "string") return JSON.stringify(val);
  if (Array.isArray(val)) {
    return "[" + val.map(canonicalStringify).join(",") + "]";
  }
  if (typeof val === "object") {
    const keys = Object.keys(val as Record<string, unknown>).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalStringify((val as Record<string, unknown>)[k])).join(",") + "}";
  }
  return "null";
}

export async function fingerprintMatch(match: RuleMatch): Promise<string> {
  const payload = {
    ruleId: match.ruleId,
    slotDate: match.slotDate,
    startTime: match.startTime,
    endTime: match.endTime,
    availability: match.availability.map(a => ({
      startTime: a.startTime,
      endTime: a.endTime,
      facilityIds: [...a.facilityIds].sort(),
    })),
  };
  const data = new TextEncoder().encode(canonicalStringify(payload));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
