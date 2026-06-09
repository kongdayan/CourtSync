# Rule Notifications Phase 3: Matching, Outbox, and Queue Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match active rules after complete successful source synchronization, persist match lifecycles, merge eligible notifications by user, and deliver them asynchronously through Cloudflare Queues.

**Architecture:** A pure matcher consumes compiled rules and an in-memory snapshot index. D1 reconciliation handles new, continuing, disappeared, and reappearing fingerprints. An outbox transaction records user-level messages before queue publication; the queue consumer claims records and calls provider adapters.

**Tech Stack:** TypeScript, D1, Cloudflare Queues, Web Crypto SHA-256, Vitest, existing USThing/Jiushi clients.

---

## Phase Acceptance

- Cross-court consecutive availability produces one maximal interval.
- Empty conditions behave as wildcards.
- Facility-set changes produce a new fingerprint and fresh allowance.
- A disappeared fingerprint that later reappears resets its allowance.
- Source failure or partial source data performs no reconciliation.
- Same-run eligible matches merge into one notification per user and channel.
- Queue retries never increment counts until provider success.
- Legacy global `PUSHDEER_KEYS` delivery is removed.

### Task 1: Implement the Pure Matching Engine

**Files:**
- Create: `ts/matching/types.ts`
- Create: `ts/matching/snapshot-index.ts`
- Create: `ts/matching/matcher.ts`
- Create: `ts/matching/fingerprint.ts`
- Test: `test/worker/matcher.test.ts`
- Test: `test/worker/fingerprint.test.ts`

- [ ] **Step 1: Write matcher tests for all rule semantics**

Create `test/worker/matcher.test.ts` with fixtures that assert:

```ts
it("forms one maximal cross-court run", async () => {
  const index = buildSnapshotIndex([
    available("113", "2026-06-10", "18:00", "19:00"),
    available("115", "2026-06-10", "19:00", "20:00"),
    available("117", "2026-06-10", "20:00", "21:00"),
  ]);

  const matches = await matchRule(compiledRule({ minConsecutive: 2 }), index);

  expect(matches).toEqual([
    expect.objectContaining({
      slotDate: "2026-06-10",
      startTime: "18:00",
      endTime: "21:00",
      slotCount: 3,
      availability: [
        { startTime: "18:00", endTime: "19:00", facilityIds: ["113"] },
        { startTime: "19:00", endTime: "20:00", facilityIds: ["115"] },
        { startTime: "20:00", endTime: "21:00", facilityIds: ["117"] },
      ],
    }),
  ]);
});

```

Add these concrete fixtures and assertions to the same test file:

| Case | Input | Expected |
| --- | --- | --- |
| Selected-timeslot gap | Available `18:00-19:00` and `20:00-21:00`, selected mask excludes `19:00`, minimum 2 | No match. |
| Actual-time gap | Available `18:00-18:30` and `19:00-20:00`, minimum 2 | No match. |
| Empty filters | Wednesday Jiushi slots, zero masks, empty facility set | The available maximal run is returned. |
| Weekday OR | Rule selects Monday and Wednesday; fixtures include Tuesday and Wednesday | Only Wednesday matches. |
| Facility OR | Rule selects facilities `113` and `117`; both appear in one timeslot | The timeslot contains both sorted IDs. |
| Separate runs | Two available runs separated by one unavailable selected slot | Two maximal matches, no overlapping windows. |

- [ ] **Step 2: Run matcher tests and confirm modules are absent**

```bash
npm run test:worker -- test/worker/matcher.test.ts
```

Expected: FAIL on unresolved imports.

- [ ] **Step 3: Define matcher types**

Create `ts/matching/types.ts`:

```ts
export interface CompiledRule {
  id: string;
  userId: string;
  name: string;
  source: DataSourceKey;
  weekdayMask: number;
  timeslotMask: number;
  facilityIds: ReadonlySet<string>;
  minConsecutive: number;
  pushLimit: number;
}

export interface IndexedSlot {
  startTime: string;
  endTime: string;
  availableFacilityIds: ReadonlySet<string>;
}

export type SnapshotIndex = ReadonlyMap<string, ReadonlyMap<string, IndexedSlot>>;

export interface MatchAvailability {
  startTime: string;
  endTime: string;
  facilityIds: string[];
}

export interface RuleMatch {
  fingerprint: string;
  ruleId: string;
  userId: string;
  ruleName: string;
  source: DataSourceKey;
  slotDate: string;
  startTime: string;
  endTime: string;
  slotCount: number;
  availability: MatchAvailability[];
  pushLimit: number;
}
```

- [ ] **Step 4: Build the snapshot index**

`buildSnapshotIndex(slots)`:

- Ignores any status other than case-insensitive `Available`.
- Groups by `Date` and `StartTime`.
- Requires all rows sharing date/start to have the same `EndTime`; throw and mark the source run invalid if they differ.
- Adds every available facility ID to the slot set.
- Returns dates and times in deterministic insertion order after sorting.

- [ ] **Step 5: Implement linear maximal-run scanning**

For each date passing weekday filtering:

```ts
let current: MatchAvailability[] = [];
for (const timeslot of HOURLY_TIMESLOTS) {
  const selected = rule.timeslotMask === 0 || (rule.timeslotMask & (1 << timeslot.index)) !== 0;
  const indexed = day.get(timeslot.start);
  const facilityIds = selected && indexed
    ? filterFacilities(indexed.availableFacilityIds, rule.facilityIds)
    : [];
  const touchesPrevious = current.length === 0 || current.at(-1)!.endTime === indexed?.startTime;

  if (!selected || !indexed || facilityIds.length === 0 || !touchesPrevious) {
    emitIfLongEnough(current);
    current = [];
  }
  if (selected && indexed && facilityIds.length > 0) {
    current.push({ startTime: indexed.startTime, endTime: indexed.endTime, facilityIds });
  }
}
emitIfLongEnough(current);
```

Sort facility IDs lexically before storing them. `emitIfLongEnough` emits the entire run only when `current.length >= minConsecutive`.

- [ ] **Step 6: Implement canonical fingerprinting and tests**

Create `test/worker/fingerprint.test.ts`:

```ts
it("is stable across facility input order", async () => {
  expect(await fingerprintMatch(matchWith(["117", "113"])))
    .toBe(await fingerprintMatch(matchWith(["113", "117"])));
});

it("changes when any timeslot facility set changes", async () => {
  expect(await fingerprintMatch(matchWith(["113"])))
    .not.toBe(await fingerprintMatch(matchWith(["113", "117"])));
});
```

Canonical payload keys are `ruleId`, `slotDate`, `startTime`, `endTime`, and ordered `availability`. Hash UTF-8 canonical JSON with SHA-256 and return lowercase hex.

- [ ] **Step 7: Run matcher tests**

```bash
npm run test:worker -- test/worker/matcher.test.ts test/worker/fingerprint.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the pure matcher**

```bash
git add ts/matching test/worker/matcher.test.ts test/worker/fingerprint.test.ts
git commit -m "feat: add cross-court availability matcher"
```

### Task 2: Persist Match Lifecycles and Reset Reappearing Matches

**Files:**
- Create: `d1/migrations/0006_match_state.sql`
- Create: `ts/matching/repository.ts`
- Create: `ts/matching/reconcile.ts`
- Test: `test/worker/match-reconciliation.test.ts`

- [ ] **Step 1: Write reconciliation lifecycle tests**

Create `test/worker/match-reconciliation.test.ts` covering this exact sequence:

```ts
await reconcile({ source: "jiushi", syncRunId: "run-1", matches: [matchA], now: t0 });
await markDelivered(matchA.fingerprint, t0);

await reconcile({ source: "jiushi", syncRunId: "run-2", matches: [matchA], now: t1 });
expect(await state(matchA.fingerprint)).toMatchObject({ isActive: true, notificationCount: 1 });

await reconcile({ source: "jiushi", syncRunId: "run-3", matches: [], now: t2 });
expect(await state(matchA.fingerprint)).toMatchObject({ isActive: false, notificationCount: 1 });

await reconcile({ source: "jiushi", syncRunId: "run-4", matches: [matchA], now: t3 });
expect(await state(matchA.fingerprint)).toMatchObject({
  isActive: true,
  notificationCount: 0,
  lastNotifiedAt: null,
  firstSeenAt: t3,
});
```

Add a separate test proving `skipReconciliationForFailedSource()` leaves every row unchanged.

- [ ] **Step 2: Add match-state migration**

Create `d1/migrations/0006_match_state.sql`:

```sql
CREATE TABLE rule_match_state (
  fingerprint TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('usthing', 'jiushi')),
  slot_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  availability_json TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  notification_count INTEGER NOT NULL DEFAULT 0 CHECK (notification_count >= 0),
  last_notified_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_sync_run_id TEXT NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES notification_rule(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_match_rule_date_active
  ON rule_match_state(rule_id, slot_date, is_active);
CREATE INDEX idx_match_user_active_seen
  ON rule_match_state(user_id, is_active, last_seen_at DESC);
CREATE INDEX idx_match_source_active_seen
  ON rule_match_state(source, is_active, last_seen_at DESC);
```

- [ ] **Step 3: Implement batch reconciliation**

For every seen match, use `INSERT ... ON CONFLICT(fingerprint) DO UPDATE` with CASE expressions:

```sql
notification_count = CASE WHEN rule_match_state.is_active = 0 THEN 0 ELSE rule_match_state.notification_count END,
last_notified_at = CASE WHEN rule_match_state.is_active = 0 THEN NULL ELSE rule_match_state.last_notified_at END,
first_seen_at = CASE WHEN rule_match_state.is_active = 0 THEN excluded.first_seen_at ELSE rule_match_state.first_seen_at END,
is_active = 1,
last_seen_at = excluded.last_seen_at,
last_sync_run_id = excluded.last_sync_run_id
```

After upserts, deactivate rows for evaluated rules where `last_sync_run_id != currentRunId`. Restrict deactivation by source and the exact evaluated rule IDs so deleted, disabled, or other-source rules are not changed accidentally.

- [ ] **Step 4: Run reconciliation tests**

```bash
npm run test:worker -- test/worker/match-reconciliation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit match persistence**

```bash
git add d1/migrations/0006_match_state.sql ts/matching/repository.ts ts/matching/reconcile.ts test/worker/match-reconciliation.test.ts
git commit -m "feat: persist notification match lifecycles"
```

### Task 3: Build Eligibility, User-Level Merging, and the D1 Outbox

**Files:**
- Create: `d1/migrations/0007_outbox.sql`
- Create: `ts/notifications/eligibility.ts`
- Create: `ts/notifications/format.ts`
- Create: `ts/notifications/outbox-repository.ts`
- Create: `ts/notifications/plan-outbox.ts`
- Test: `test/worker/notification-planning.test.ts`

- [ ] **Step 1: Write notification planning tests**

Create these exact cases:

| Case | Fixture | Expected |
| --- | --- | --- |
| Merge rules | One active user, one verified channel, two eligible rule matches | One outbox with two rule groups and both fingerprints. |
| Cooldown | Last success 29 minutes ago | No outbox. |
| Finite limit | Push limit 3 and notification count 3 | No outbox. |
| Unlimited | Push limit -1 and notification count 50 with cooldown elapsed | Eligible outbox. |
| Missing channel | Eligible active match but no verified channel | Match remains active and no outbox is inserted. |
| Separate users | Two active users with one eligible match each | Two outbox rows. |

- [ ] **Step 2: Add outbox migration**

Create `d1/migrations/0007_outbox.sql`:

```sql
CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  sync_run_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  match_fingerprints_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  sending_started_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES notification_channel(id) ON DELETE CASCADE,
  UNIQUE (user_id, channel_id, sync_run_id)
) STRICT;

CREATE INDEX idx_outbox_status_created
  ON notification_outbox(status, created_at);
CREATE INDEX idx_outbox_user_created
  ON notification_outbox(user_id, created_at DESC);
```

- [ ] **Step 3: Implement deterministic eligibility**

`isMatchEligible(state, rule, now)` returns false when:

- User is not active.
- Rule disabled or push limit zero.
- Match inactive.
- Finite notification count reached.
- `lastNotifiedAt + 30 minutes > now`.

It does not inspect network state.

- [ ] **Step 4: Implement notification formatting**

Format one payload per user and channel:

```text
CourtSync 场地提醒

[工作日晚间] 香港科技大学
2026-06-10 18:00–21:00（连续 3 场）
18:00–19:00  LG1C1 / LG1C2
19:00–20:00  LG1C2 / SFC1
20:00–21:00  SFC1
```

Sort rule groups by rule name then ID, matches by date/start, and facilities by catalog order. Include every eligible match in `payload_json` and all unique fingerprints in `match_fingerprints_json`.

- [ ] **Step 5: Insert outbox rows idempotently**

`planOutboxForSync()` loads active users, enabled rules, active eligible states, and enabled verified channels in bounded indexed queries. Group by `(userId, channelId)` and use `INSERT OR IGNORE` against the unique sync-run key. Return only newly inserted outbox IDs.

- [ ] **Step 6: Run planning tests**

```bash
npm run test:worker -- test/worker/notification-planning.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit outbox planning**

```bash
git add d1/migrations/0007_outbox.sql ts/notifications test/worker/notification-planning.test.ts
git commit -m "feat: plan merged notification outbox messages"
```

### Task 4: Add Cloudflare Queue Delivery and Provider Success Accounting

**Files:**
- Modify: `wrangler.jsonc`
- Create: `ts/notifications/queue-consumer.ts`
- Create: `ts/notifications/delivery-service.ts`
- Modify: `ts/main.ts`
- Test: `test/worker/queue-delivery.test.ts`

- [ ] **Step 1: Write queue delivery tests with mocked provider**

Create these exact cases:

| Case | Fixture | Expected |
| --- | --- | --- |
| Provider success | Pending outbox with two fingerprints | Outbox sent and both counts increment once. |
| Transient provider error | HTTP 503 or network error | Counts unchanged, error stored, queue message retried. |
| Permanent invalid key | PushDeer business response indicates invalid key | Outbox failed, counts unchanged, queue message acknowledged. |
| Already sent | Duplicate queue message for sent outbox | Provider not called and message acknowledged. |
| Disabled after planning | User disabled before delivery | Outbox failed with `account_disabled`, provider not called. |
| Duplicate claim | Two delivery calls for one pending outbox | One claim succeeds and provider is called once. |

- [ ] **Step 2: Create notification and DLQ resources**

Run:

```bash
npx wrangler queues create courtsync-notifications
npx wrangler queues create courtsync-notifications-dlq
```

Add to `wrangler.jsonc`:

```jsonc
"queues": {
  "producers": [
    { "binding": "NOTIFICATION_QUEUE", "queue": "courtsync-notifications" }
  ],
  "consumers": [
    {
      "queue": "courtsync-notifications",
      "max_batch_size": 10,
      "max_batch_timeout": 5,
      "max_retries": 3,
      "dead_letter_queue": "courtsync-notifications-dlq"
    }
  ]
}
```

Run `npm run cf-typegen` and verify `Env.NOTIFICATION_QUEUE` exists.

- [ ] **Step 3: Implement atomic outbox claiming**

Claim with one update:

```sql
UPDATE notification_outbox
SET status = 'sending',
    sending_started_at = ?,
    attempt_count = attempt_count + 1
WHERE id = ?
  AND status != 'sent'
  AND (
    status IN ('pending', 'failed') OR
    (status = 'sending' AND sending_started_at < ?)
  )
RETURNING *;
```

Use a ten-minute stale-claim cutoff. If no row returns, acknowledge the queue message without provider delivery.

- [ ] **Step 4: Implement delivery service**

`DeliveryService.deliver(outboxId)`:

1. Claims the outbox.
2. Re-reads active user access and verified enabled channel.
3. Decrypts the current channel config.
4. Sends provider payload.
5. On success, D1-batches:
   - Outbox `status = 'sent'`, `sent_at = now`.
   - Each referenced active match `notification_count = notification_count + 1`, `last_notified_at = now`.
6. On permanent provider error, marks failed and returns `ack`.
7. On transient error, records failure and returns `retry`.

Sanitize errors to provider, HTTP status, and a bounded message; never store response bodies containing secrets.

- [ ] **Step 5: Add queue handler to Worker entrypoint**

```ts
async queue(batch: MessageBatch<{ outboxId: string }>, env: Env): Promise<void> {
  const service = createDeliveryService(env);
  for (const message of batch.messages) {
    const result = await service.deliver(message.body.outboxId);
    if (result === "retry") message.retry();
    else message.ack();
  }
}
```

Do not process queue messages in parallel until D1 claim and provider rate behavior have production evidence.

- [ ] **Step 6: Run queue tests**

```bash
npm run test:worker -- test/worker/queue-delivery.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit queue delivery**

```bash
git add wrangler.jsonc worker-configuration.d.ts ts/main.ts ts/notifications test/worker/queue-delivery.test.ts
git commit -m "feat: deliver notifications through Cloudflare Queues"
```

### Task 5: Integrate Complete Source Outcomes, Health Alerts, and Scheduled Matching

**Files:**
- Create: `d1/migrations/0008_source_health.sql`
- Create: `ts/sync/types.ts`
- Create: `ts/sync/orchestrator.ts`
- Create: `ts/sync/source-health-repository.ts`
- Create: `ts/notifications/admin-alerts.ts`
- Modify: `ts/service/updateTimeSlots.ts`
- Modify: `ts/db/slots.ts`
- Modify: `ts/sync/run.ts`
- Modify: `ts/main.ts`
- Modify: `ts/notifications/pushdeer.ts` or remove after references migrate
- Test: `test/worker/source-outcome.test.ts`
- Test: `test/worker/snapshot-replacement.test.ts`
- Test: `test/worker/scheduled-matching.test.ts`

- [ ] **Step 1: Write source-outcome tests before refactoring collection**

Required outcomes:

```ts
expect(completeUsthing).toMatchObject({ status: "success", completedUnits: 8, failedUnits: 0 });
expect(oneFacilityFailed).toMatchObject({ status: "failed", completedUnits: 7, failedUnits: 1 });
expect(systemClosed).toMatchObject({ status: "closed" });
expect(jiushiWafBlock).toMatchObject({ status: "failed", fatalCode: "waf_blocked" });
expect(jiushiBookingWindowStop).toMatchObject({ status: "success" });
```

Partial facility failure must be `failed`, because reconciling partial data would create false facility-set changes.

- [ ] **Step 2: Define explicit source outcome types**

Create `ts/sync/types.ts`:

```ts
export type SourceSyncStatus = "success" | "failed" | "closed";

export interface SourceSyncResult {
  source: DataSourceKey;
  status: SourceSyncStatus;
  slots: UnifiedTimeSlot[];
  warnings: string[];
  completedUnits: number;
  failedUnits: number;
  fatalCode?: string;
  startDate: string;
  endDate: string;
  generatedAt: Date;
}
```

Refactor provider aggregation to return this result instead of swallowing all errors into an empty array. USThing error code `03` maps to `closed`, not failed. Jiushi booking-window exhaustion after valid days is expected success; WAF denial is failed.

- [ ] **Step 3: Make successful snapshots remove stale in-range rows**

Create `test/worker/snapshot-replacement.test.ts` with these assertions:

1. Seed an old available row inside the target range and a row outside it.
2. Persist a complete successful snapshot that omits the old in-range row.
3. Assert the omitted in-range row and outside-range row are deleted and all returned rows have the current `updated_at`.
4. Simulate an upsert chunk failure and assert stale-row cleanup does not run.
5. Persist a verified successful empty snapshot and assert the entire target range becomes empty.

Refactor `persistSlots()` so it:

1. Upserts every returned row using one shared `updatedAt` value.
2. Stops and throws if any chunk fails.
3. After every upsert succeeds, deletes `slot_date BETWEEN startDate AND endDate AND updated_at <> updatedAt`.
4. Deletes rows outside the retained range.

Only call this function for a `success` source outcome. A persistence failure changes the source result to failed and skips rule matching. This order prevents stale availability from surviving a complete sync and prevents partial writes from causing false deactivation.

- [ ] **Step 4: Add source health migration**

Create `d1/migrations/0008_source_health.sql`:

```sql
CREATE TABLE source_sync_run (
  id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('usthing', 'jiushi')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'closed')),
  slot_count INTEGER NOT NULL,
  warning_summary TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  PRIMARY KEY (id, source)
) STRICT;

CREATE TABLE source_health (
  source TEXT PRIMARY KEY CHECK (source IN ('usthing', 'jiushi')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT,
  last_failure_at TEXT,
  failure_alerted_at TEXT,
  last_failure_summary TEXT,
  updated_at TEXT NOT NULL
) STRICT;
```

- [ ] **Step 5: Write scheduled orchestration test**

Create `test/worker/scheduled-matching.test.ts` and assert:

- One source success and one failure matches/reconciles only the successful source.
- Two eligible rules for one user become one outbox.
- Newly inserted outbox IDs are sent to `NOTIFICATION_QUEUE`.
- A queue send failure leaves the outbox pending.
- A later run re-enqueues old pending outbox records.
- Manual `/api/slots?refresh=1` never creates an outbox.
- A source persistence failure prevents matching and reconciliation for that source.

- [ ] **Step 6: Implement source health transitions and administrator alerts**

On failed scheduled runs:

- Increment consecutive failures.
- At exactly 3 failures, send one alert through `ADMIN_PUSHDEER_KEY`.
- Do not repeat while `failure_alerted_at` is set.

On later success:

- Reset consecutive failures.
- If an alert had been sent, send one recovery alert and clear alert state.

`closed` does not increment failure count and performs no matching.

Use the same PushDeer provider adapter but a config built only from `env.ADMIN_PUSHDEER_KEY`. Never write this key to `notification_channel`.

- [ ] **Step 7: Implement scheduled orchestration**

`runScheduledSync(env, now)`:

1. Creates `syncRunId = crypto.randomUUID()`.
2. Runs both source syncs independently.
3. Records source runs and health transitions.
4. For each successful source, loads enabled active rules, builds one snapshot index, matches all rules, and reconciles states.
5. After all successful sources finish, plans merged outbox rows once for the entire sync run.
6. Sends each new outbox ID to the queue.
7. Loads pending outbox rows older than one minute and re-enqueues them with a bounded limit of 100.
8. Cleans up records older than 30 days in bounded SQL deletes.

The `scheduled` handler passes this promise to `ctx.waitUntil()` and awaits all database writes within the orchestration function.

- [ ] **Step 8: Remove legacy global user pushes**

Remove `parsePushConfig`, `PushDeerService` calls from source sync, `PUSHDEER_KEYS` from `WorkerEnv` compatibility types, and the old `ts/notifications/pushdeer.ts` implementation after all imports use the provider adapter. Source sync must only collect and persist slots.

- [ ] **Step 9: Configure administrator alert secret**

```bash
npx wrangler secret put ADMIN_PUSHDEER_KEY
```

Use a newly rotated key. Do not reuse any key previously committed in `wrangler.toml`.

- [ ] **Step 10: Run full Phase 3 verification**

```bash
npm run test:worker
npm run test:web
npm run typecheck
npm run build
env GOCACHE=/tmp/courtsync-go-cache go test ./...
```

Expected: PASS.

- [ ] **Step 11: Commit scheduled matching and health alerts**

```bash
git add d1/migrations/0008_source_health.sql ts test/worker wrangler.jsonc worker-configuration.d.ts
git commit -m "feat: match rules after scheduled source sync"
```

## Phase 3 Completion Check

Use local D1 fixtures rather than real upstream APIs for deterministic acceptance:

1. Seed two active users and several rules.
2. Seed a cross-court four-slot availability run.
3. Invoke the scheduled orchestrator.
4. Confirm one outbox per user/channel, grouped by rule.
5. Invoke queue delivery with mocked PushDeer success.
6. Confirm counts increment and cooldown blocks the next immediate run.
7. Remove the run, reconcile, restore the identical run, and confirm counts reset.
8. Simulate a source failure and confirm match states do not change.

Commit acceptance fixes separately:

```bash
git add -A
git commit -m "test: complete phase three acceptance"
```
