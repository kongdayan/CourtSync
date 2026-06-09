export interface MatchState {
  isActive: boolean;
  notificationCount: number;
  lastNotifiedAt?: string | null;
}

export interface RuleConfig {
  pushLimit: number;
  enabled: boolean;
}

const COOLDOWN_MINUTES = 30;

export function isMatchEligible(
  state: MatchState,
  rule: RuleConfig,
  now: Date,
): boolean {
  if (!state.isActive) return false;
  if (!rule.enabled || rule.pushLimit === 0) return false;

  // Finite limit reached
  if (rule.pushLimit > 0 && state.notificationCount >= rule.pushLimit) return false;

  // Cooldown check
  if (state.lastNotifiedAt) {
    const lastTime = new Date(state.lastNotifiedAt).getTime();
    const elapsed = now.getTime() - lastTime;
    if (elapsed < COOLDOWN_MINUTES * 60 * 1000) return false;
  }

  return true;
}
