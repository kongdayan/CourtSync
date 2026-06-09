import { matchRule } from "../ts/matching/matcher";
import { buildSnapshotIndex } from "../ts/matching/snapshot-index";
import { fingerprintMatch } from "../ts/matching/fingerprint";
import type { CompiledRule } from "../ts/matching/types";
import type { UnifiedTimeSlot } from "../ts/types";

function generateRules(count: number): CompiledRule[] {
  const rules: CompiledRule[] = [];
  for (let i = 0; i < count; i++) {
    const userId = `user-${i % 50}`;
    rules.push({
      id: `${userId}-rule-${i}`,
      userId,
      name: `Rule ${i}`,
      source: i % 2 === 0 ? "usthing" : "jiushi",
      weekdayMask: i % 3 === 0 ? 0 : 0b0010101,
      timeslotMask: i % 4 === 0 ? 0 : 0b001111100000000,
      facilityIds: new Set(i % 5 === 0 ? [] : [String(113 + (i % 35))]),
      minConsecutive: 1 + (i % 4),
      pushLimit: i % 2 === 0 ? 3 : -1,
    });
  }
  return rules;
}

function generateSlots(dates: number, facilities: number): UnifiedTimeSlot[] {
  const slots: UnifiedTimeSlot[] = [];
  const facilityIds = Array.from({ length: facilities }, (_, i) => String(113 + i));
  for (let d = 0; d < dates; d++) {
    const date = `2026-06-${String(d + 10).padStart(2, "0")}`;
    for (let h = 8; h < 23; h++) {
      for (const fid of facilityIds) {
        // Deterministic pattern: ~60% availability
        const hash = (d * 100 + h * 10 + Number(fid)) % 10;
        if (hash < 6) {
          slots.push({
            Date: date,
            StartTime: `${String(h).padStart(2, "0")}:00`,
            EndTime: `${String(h + 1).padStart(2, "0")}:00`,
            FacilityID: fid,
            Status: "Available",
          } as any);
        }
      }
    }
  }
  return slots;
}

async function main() {
  const rules = generateRules(500);
  const slots = generateSlots(14, 35);
  const index = buildSnapshotIndex(slots);

  const ITERATIONS = 30;
  const WARMUP = 10;
  const durations: number[] = [];

  for (let i = 0; i < WARMUP + ITERATIONS; i++) {
    const start = performance.now();
    for (const rule of rules) {
      const matches = await matchRule(rule, index);
      for (const m of matches) {
        m.fingerprint = await fingerprintMatch(m);
      }
    }
    const elapsed = performance.now() - start;
    if (i >= WARMUP) durations.push(elapsed);
  }

  durations.sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95)];

  const result = {
    rules: rules.length,
    dates: 14,
    slotsPerDay: 15,
    facilities: 35,
    iterations: ITERATIONS,
    p95Ms: Math.round(p95),
  };

  console.log(JSON.stringify(result));

  if (p95 >= 100) {
    console.error(`Benchmark FAILED: p95 ${p95}ms >= 100ms threshold`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
