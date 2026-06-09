import { runTimeslotSync as defaultSyncFn } from "./run";
import { buildSnapshotIndex } from "../matching/snapshot-index";
import { matchRule } from "../matching/matcher";
import { fingerprintMatch } from "../matching/fingerprint";
import { MatchRepository } from "../matching/repository";
import { reconcileMatches } from "../matching/reconcile";
import { isMatchEligible } from "../notifications/eligibility";
import { OutboxRepository } from "../notifications/outbox-repository";
import { SourceHealthRepository } from "./source-health-repository";
import type { SourceSyncResult } from "./types";
import type { CompiledRule, RuleMatch } from "../matching/types";
import type { DataSourceKey } from "../shared/sources";
import type { TimeslotSyncResult } from "./run";

type SyncFn = (source: DataSourceKey, env: Env) => Promise<TimeslotSyncResult>;

export async function runScheduledSync(
  env: Env,
  now: Date,
  runTimeslotSync: SyncFn = defaultSyncFn,
): Promise<void> {
  const syncRunId = crypto.randomUUID();
  const sources: DataSourceKey[] = ["usthing", "jiushi"];
  const allResults: SourceSyncResult[] = [];
  const healthRepo = new SourceHealthRepository(env.APP_DB);

  // Step 1: Run source syncs independently
  for (const source of sources) {
    const startedAt = new Date().toISOString();
    let result: SourceSyncResult;

    try {
      const syncResult = await runTimeslotSync(source, env);
      result = {
        ...syncResult,
        completedUnits: syncResult.slots.length > 0 ? 8 : 0,
        failedUnits: 0,
      };
    } catch (err) {
      result = {
        source,
        status: "failed",
        slots: [],
        warnings: [err instanceof Error ? err.message : String(err)],
        completedUnits: 0,
        failedUnits: 8,
        fatalCode: "sync_error",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        generatedAt: new Date(),
      };
    }

    const finishedAt = new Date().toISOString();
    const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

    await healthRepo.recordRun(syncRunId, source, result.status, result.slots.length, result.warnings, durationMs, startedAt, finishedAt);
    await healthRepo.updateHealth(source, result.status, finishedAt);
    allResults.push(result);
  }

  // Step 2: For each successful source, match rules
  const matchRepo = new MatchRepository(env.APP_DB);
  const outboxRepo = new OutboxRepository(env.APP_DB);
  const allMatches: RuleMatch[] = [];

  for (const result of allResults) {
    if (result.status !== "success") continue;

    // Load active rules for this source
    const rules = await env.APP_DB.prepare(`
      SELECT nr.* FROM notification_rule nr
      JOIN user_access ua ON ua.user_id = nr.user_id
      WHERE nr.source = ? AND nr.enabled = 1 AND ua.status = 'active'
    `).bind(result.source).all<{
      id: string; user_id: string; name: string; source: string;
      weekday_mask: number; timeslot_mask: number; facility_ids_json: string;
      min_consecutive: number; push_limit: number;
    }>();

    if (rules.results.length === 0) continue;

    const index = buildSnapshotIndex(result.slots);

    for (const r of rules.results) {
      const compiled: CompiledRule = {
        id: r.id, userId: r.user_id, name: r.name,
        source: r.source as DataSourceKey,
        weekdayMask: r.weekday_mask, timeslotMask: r.timeslot_mask,
        facilityIds: new Set(JSON.parse(r.facility_ids_json)),
        minConsecutive: r.min_consecutive, pushLimit: r.push_limit,
      };

      const matches = await matchRule(compiled, index);
      for (const m of matches) {
        m.fingerprint = await fingerprintMatch(m);
      }
      allMatches.push(...matches);
    }

    // Reconcile matches for this source
    await reconcileMatches(matchRepo, result.source, syncRunId, allMatches.filter(m => m.source === result.source), now.toISOString());
  }

  // Step 3: Plan outbox — group eligible matches by (userId, channelId)
  const eligibleByUser = new Map<string, RuleMatch[]>();
  for (const m of allMatches) {
    const state = await matchRepo.getByFingerprint(m.fingerprint);
    if (!state || !isMatchEligible(
      { isActive: state.isActive, notificationCount: state.notificationCount, lastNotifiedAt: state.lastNotifiedAt },
      { pushLimit: m.pushLimit, enabled: true },
      now,
    )) continue;

    const key = m.userId;
    if (!eligibleByUser.has(key)) eligibleByUser.set(key, []);
    eligibleByUser.get(key)!.push(m);
  }

  for (const [userId, matches] of eligibleByUser) {
    // Get verified enabled channels for this user
    const channels = await env.APP_DB.prepare(
      "SELECT id FROM notification_channel WHERE user_id = ? AND enabled = 1 AND verified_at IS NOT NULL"
    ).bind(userId).all<{ id: string }>();

    for (const ch of channels.results) {
      const fps = [...new Set(matches.map(m => m.fingerprint))];
      const outboxId = await outboxRepo.insertOutbox(
        userId, ch.id, syncRunId,
        JSON.stringify({ matches: matches.map(m => ({ ruleName: m.ruleName, slotDate: m.slotDate, startTime: m.startTime, endTime: m.endTime })) }),
        JSON.stringify(fps),
        now.toISOString(),
      );

      // Send to queue if inserted
      if (outboxId && env.NOTIFICATION_QUEUE) {
        try {
          await env.NOTIFICATION_QUEUE.send({ outboxId });
        } catch (err) {
          console.error("Failed to enqueue outbox", outboxId, err);
        }
      }
    }
  }

  // Step 4: Re-enqueue stale pending outboxes
  const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
  const stale = await outboxRepo.getPendingOlderThan(oneMinuteAgo, 100);
  for (const row of stale) {
    if (env.NOTIFICATION_QUEUE) {
      try {
        await env.NOTIFICATION_QUEUE.send({ outboxId: row.id });
      } catch {
        // will retry next run
      }
    }
  }
}
