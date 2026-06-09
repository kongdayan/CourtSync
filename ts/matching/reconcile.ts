import type { RuleMatch } from "./types";
import { MatchRepository } from "./repository";

export function skipReconciliationForFailedSource(): boolean {
  return true; // Caller checks source status before calling reconcileMatches
}

export async function reconcileMatches(
  repo: MatchRepository,
  source: string,
  syncRunId: string,
  matches: RuleMatch[],
  now: string,
): Promise<void> {
  for (const match of matches) {
    await repo.upsertMatch(match, syncRunId, now);
  }

  const ruleIds = [...new Set(matches.map(m => m.ruleId))];
  await repo.deactivateUnseen(source, ruleIds, syncRunId);
}
