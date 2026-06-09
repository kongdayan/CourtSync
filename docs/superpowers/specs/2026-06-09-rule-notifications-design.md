# CourtSync Rule Notifications Design

## Summary

CourtSync will add authenticated user accounts, configurable court-availability rules, per-user notification channels, and an administrator console.

The first release uses Google login, Cloudflare Workers, three D1 databases, Cloudflare Queues, React, Tailwind CSS, shadcn/ui, Hono, and Better Auth. It keeps the current USThing and Jiushi collection clients, while presenting their business names as:

- `usthing`: 香港科技大学
- `jiushi`: 上海万体汇羽毛球馆

The architecture is sized for fewer than 50 initial users but is designed and tested for at least 500 rules. Rule matching remains synchronous and deterministic after each scheduled data sync. Network notification delivery is isolated behind a queue.

## Goals

- Let anyone authenticate with Google.
- Create first-time non-admin users in a `pending` state.
- Let pending users view the public court dashboard but not configure or receive notifications.
- Let administrators approve, disable, and re-enable users.
- Let administrators adjust each user's rule allowance.
- Give active users a rule editor with source-aware facilities and fixed hourly timeslots.
- Support cross-court consecutive availability.
- Store one verified personal PushDeer channel per user in the first release.
- Keep the channel model extensible to email and webhook delivery.
- Match rules after successful scheduled source synchronization.
- Merge all eligible matches for one user and one sync run into one notification.
- Retry notification delivery without blocking slot synchronization.
- Use a separate administrator PushDeer secret for system health alerts.

## Non-Goals

- Apple login and email-code login are not implemented in the first release. The authentication model and UI must not prevent adding them later.
- Payment processing and automatic subscription upgrades are not included. Administrators manually set rule limits.
- The application does not expose a supported external developer API. JSON endpoints are private, same-origin implementation details for the React application.
- Email and webhook notification delivery are not implemented in the first release.
- A rule cannot span more than one data source.
- Automatic court booking is not part of this feature.
- Jiushi proxy infrastructure is not changed by this feature.

## Product Rules

### User States

Each authenticated user has one access record:

- `pending`: may view the public dashboard and account status only.
- `active`: may manage rules and notification channels and participates in matching.
- `disabled`: may not use protected functionality and does not participate in matching.

An administrator disabling a user deletes all of that user's sessions. The next request is rejected immediately. Rules and notification configuration remain stored so they can be restored if the user is re-enabled.

Email is a core user identity and contact field even though the first release only signs users in through Google. Better Auth account records must allow later association with Google, Apple, and email identities.

### Administrator Initialization

`ADMIN_EMAILS` is a Cloudflare Secret containing a comma-separated set of administrator email addresses.

On login, an email in `ADMIN_EMAILS` is ensured to be `admin` and `active`. Secret-defined administrators cannot be disabled or demoted through the administrator UI, preventing accidental lockout. Their initial rule limit comes from a non-secret configuration value and remains adjustable in the database.

### Rule Allowance

The default active-user rule allowance is 2. Rule count is not hard-coded into the rule table. `user_access.rule_limit` controls the current allowance and can be changed by an administrator.

Rule creation uses a single conditional insert that succeeds only when the user's total non-deleted rule count is below the current limit. Disabled rules still consume allowance, so toggling a rule cannot bypass the quota. This avoids a read-then-write race. Existing rules are retained if an administrator lowers the allowance below the current count, but the user cannot create additional rules until the count is below the new limit.

### Rule Conditions

A rule contains:

- Name.
- Exactly one data source.
- Zero or more weekdays, Monday through Sunday.
- Zero or more source-specific facility IDs.
- Zero or more fixed hourly timeslots from `08:00-09:00` through `22:00-23:00`.
- Minimum consecutive slot count from 1 through 12.
- Push limit.
- Explicit enabled state.

Conditions across groups use AND. Values inside a multi-select group use OR.

Empty groups are wildcards:

- No weekdays means every day.
- No facilities means any facility in the selected data source.
- No timeslots means all 15 daily timeslots.

The first-release push-limit choices are:

- `-1`: repeat indefinitely while the match remains active, subject to cooldown.
- `0`: disabled; the API normalizes the rule to `enabled = false` and does not match it.
- `1`: send at most once for one match fingerprint.
- `3`: send at most three times for one match fingerprint.

The database accepts `-1` or a bounded non-negative integer so more plans can be introduced without a schema migration. The UI initially exposes only `-1`, `0`, `1`, and `3`. A disabled switch also prevents matching. Re-enabling a rule with push limit 0 requires choosing a non-zero limit.

### Consecutive Availability

Consecutive availability is based on time coverage, not one court remaining available throughout the interval.

For example, these satisfy a minimum of two consecutive slots:

- Court 1 is available from `18:00-19:00`.
- Court 3 is available from `19:00-20:00`.

For each timeslot, the system retains every matching available court. A timeslot is considered available if at least one matching court is available. Adjacent timeslots are consecutive only when the earlier `EndTime` equals the later `StartTime`.

When three or more timeslots form one run, the matcher emits one maximal interval, not overlapping sliding windows. A run from `18:00` through `21:00` is one three-slot match.

### Match Identity and Push Counting

A match fingerprint contains a canonical representation of:

- Rule ID.
- Local date in `Asia/Shanghai`.
- Maximal interval start and end.
- Each timeslot in the interval.
- The sorted set of available facilities for each timeslot.

Any facility-set change creates a new fingerprint and a new push allowance, even when the date and interval are unchanged.

The same fingerprint may be pushed again only after a fixed 30-minute cooldown. Finite push limits count successful notification deliveries only. Queue failures do not consume the limit.

If an upstream source fails, its current match states are unchanged. The run is treated as unknown: no pushes, resets, activations, or deactivations occur for that source. Matching resumes after the next successful synchronization.

## Architecture

### Runtime Components

1. **React application**
   - Built with Vite, Tailwind CSS, shadcn/ui, and Lucide icons.
   - Served by Cloudflare Workers Static Assets.
   - Provides the public dashboard, login, account state, rules, channel settings, and administrator pages.

2. **Worker API**
   - Uses Hono for routing and middleware.
   - Uses Better Auth for identity and database sessions.
   - Enforces access state and resource ownership.
   - Implements private same-origin endpoints for the React application.
   - Keeps scheduled and queue handlers in the same Worker deployment unless bundle or operational constraints later justify a split.

3. **Existing source clients and snapshot databases**
   - `DB` continues to store 香港科技大学 snapshots.
   - `JIUSHI_DB` continues to store 上海万体汇羽毛球馆 snapshots.
   - Existing source clients remain responsible for authentication, WAF handling, normalization, and warnings.

4. **Application database**
   - A new `APP_DB` D1 database stores authentication tables, access records, rules, channels, match state, outbox records, source health, and audit records.

5. **Notification queue**
   - A Cloudflare Queue receives messages containing only an outbox ID.
   - A queue consumer loads the current user and channel state before delivery.
   - Failed messages retry up to three times and then enter a dead-letter queue.

### Scheduled Flow

Each five-minute scheduled invocation creates one `sync_run` ID and performs these steps:

1. Synchronize each configured source independently.
2. Persist successful snapshots to the source's existing D1 database. Upsert every returned row with the current sync timestamp, then delete rows inside the successful date range whose timestamp is not current so stale availability cannot survive a complete sync.
3. Record source success or failure in `APP_DB`.
4. Load all active users and enabled rules for successful sources in one indexed query.
5. Load the required snapshot ranges and build in-memory indexes by source, date, and start time.
6. Match rules without network calls.
7. Persist match-state changes and eligible outbox records using D1 batches.
8. After the database write succeeds, enqueue each new outbox ID.
9. Re-enqueue old pending outbox records that were committed but not successfully queued during a previous invocation.

Manual browser refreshes may update or read snapshots but do not send notifications. Notifications are produced only by scheduled processing or an explicit administrator-only diagnostic action.

### Notification Flow

The queue consumer:

1. Loads the outbox record by ID.
2. Returns successfully if it is already `sent`, making duplicate queue delivery idempotent at the database level.
3. Re-checks that the user is active and the channel is enabled and verified.
4. Decrypts the channel configuration only for the duration of the request.
5. Calls the provider adapter.
6. On provider success, marks the outbox sent and increments all included match counters in one D1 batch.
7. On transient failure, records the attempt and retries.
8. On final failure, leaves match counters unchanged, marks the outbox failed, and sends the message to the dead-letter queue.

Cloudflare Queues are at-least-once. Database checks prevent normal duplicate processing, but PushDeer has no application-supplied idempotency key. A process failure after PushDeer accepts a message but before D1 records success can rarely cause a duplicate device notification. This limitation must be documented and monitored.

## Data Model

### Better Auth Tables

Better Auth owns the standard `user`, `session`, `account`, and `verification` tables.

Important requirements:

- `user.email` is unique and required.
- Sessions expire after 30 days.
- OAuth tokens are encrypted if Better Auth stores them.
- Long-lived cookie session caching is disabled so access-state changes are observed on the next protected request.
- Production migrations are generated and checked into the repository; no public runtime migration endpoint exists.

The first release enables only Google. Apple and email-code login later reuse the existing user and account model.

### `user_access`

| Column | Purpose |
| --- | --- |
| `user_id` | Primary key and foreign key to Better Auth user. |
| `role` | `user` or `admin`. |
| `status` | `pending`, `active`, or `disabled`. |
| `rule_limit` | Maximum rules allowed for the user. Default 2 for normal users. |
| `first_login_at` | First successful identity login. |
| `last_login_at` | Most recent successful identity login. |
| `status_changed_at` | Last access-state change. |
| `status_changed_by` | Administrator user ID when applicable. |

Indexes support status, role, and recent-login administrator views.

### `notification_rule`

| Column | Purpose |
| --- | --- |
| `id` | UUID primary key. |
| `user_id` | Rule owner. |
| `name` | User-visible name. |
| `source` | Stable key: `usthing` or `jiushi`. |
| `weekday_mask` | Seven-bit mask; 0 means all days. |
| `timeslot_mask` | Fifteen-bit mask for 08:00-23:00; 0 means all slots. |
| `facility_ids_json` | Sorted JSON array; empty means any source facility. |
| `min_consecutive` | Integer 1 through 12. |
| `push_limit` | `-1` or bounded non-negative integer. |
| `enabled` | Explicit rule switch. |
| `created_at` / `updated_at` | Audit timestamps. |

Indexes:

- `(user_id, updated_at)` for ownership and UI listing.
- `(source, enabled, user_id)` for scheduled matching.

The API validates facility IDs against the selected source's catalog and stores arrays in canonical sorted order.

### `notification_channel`

| Column | Purpose |
| --- | --- |
| `id` | UUID primary key. |
| `user_id` | Channel owner. |
| `provider` | `pushdeer` initially; future `email` and `webhook`. |
| `encrypted_config` | Versioned AES-GCM encrypted JSON. |
| `destination_mask` | Safe UI representation such as `PDU***8SB`. |
| `config_fingerprint` | HMAC fingerprint for verification and replacement checks. |
| `verified_at` | Last successful provider test. |
| `enabled` | Channel switch. |
| `last_error` | Sanitized last provider error. |
| `created_at` / `updated_at` | Audit timestamps. |

The first release enforces one row per `(user_id, provider)`, which means one personal PushDeer key per user. The table shape permits multiple provider types later.

`CHANNEL_ENCRYPTION_KEYS` is a Cloudflare Secret containing a small versioned key ring with an active key ID and base64-encoded 256-bit keys. The ciphertext records its key ID. The Worker derives separate encryption and fingerprint subkeys with HKDF. Every encrypted value uses a fresh cryptographically random AES-GCM IV. Rotation adds a new active key while retaining old keys for decryption, re-encrypts stored channels, then removes retired keys. Complete keys never appear in API responses or logs.

### `rule_match_state`

| Column | Purpose |
| --- | --- |
| `fingerprint` | SHA-256 of the canonical match payload; primary key. |
| `rule_id` / `user_id` / `source` | Ownership and query fields. |
| `slot_date` | Local `Asia/Shanghai` date. |
| `start_time` / `end_time` | Maximal interval. |
| `availability_json` | Canonical timeslot-to-facility mapping. |
| `is_active` | Whether the exact fingerprint exists in the latest successful source sync. |
| `notification_count` | Successful deliveries for this fingerprint. |
| `last_notified_at` | Cooldown reference. |
| `first_seen_at` / `last_seen_at` | Lifecycle timestamps. |

Indexes:

- `(rule_id, slot_date, is_active)`.
- `(user_id, is_active, last_seen_at)`.
- `(source, is_active, last_seen_at)`.

### `notification_outbox`

| Column | Purpose |
| --- | --- |
| `id` | UUID primary key and queue payload. |
| `user_id` / `channel_id` | Delivery target. |
| `sync_run_id` | Scheduled run that created the message. |
| `payload_json` | Notification grouped by rule. |
| `match_fingerprints_json` | Match states incremented after success. |
| `status` | `pending`, `sending`, `sent`, or `failed`. |
| `attempt_count` | Provider attempts. |
| `last_error` | Sanitized provider error. |
| `created_at` / `sent_at` | Lifecycle timestamps. |

A unique key on `(user_id, channel_id, sync_run_id)` prevents duplicate user notifications for one channel and sync run.

### Operational Tables

`source_sync_run` stores run ID, source, start/end time, result, slot count, warning summary, and duration.

`source_health` stores consecutive failures, last success, last failure, last alert, and whether a recovery alert is due.

`admin_audit_log` stores actor, action, target user, before/after summaries, request metadata, and timestamp for approvals, disabling, role changes, and rule-limit changes.

Operational and inactive match/outbox records are retained for 30 days, then removed by scheduled cleanup.

## Matching Algorithm

### Compiled Rule

At load time, each rule becomes:

- Weekday bit mask.
- Timeslot bit mask.
- Facility `Set<string>`.
- Minimum run length.
- Push policy.

Empty masks and sets remain explicit wildcards; they are not expanded into large arrays in storage.

### Snapshot Index

For each successful source, build:

```text
source -> date -> startTime -> {
  endTime,
  availableFacilityIds: Set<string>
}
```

Only slots whose normalized status is `Available` enter the facility set.

### Rule Evaluation

For each applicable date:

1. Convert the date to weekday in `Asia/Shanghai`.
2. Reject it if a non-zero weekday mask does not contain that day.
3. Iterate the 15 ordered hourly positions.
4. Treat an unselected position as a continuity break when the timeslot mask is non-zero.
5. Intersect the snapshot facilities with the rule facilities when the rule set is non-empty.
6. Mark the position available when the resulting set is non-empty.
7. Scan linearly for maximal adjacent runs whose actual end and start times touch.
8. Emit runs whose length is at least `min_consecutive`.

For each emitted run, sort all facility IDs per timeslot, build canonical JSON, and hash it into the fingerprint.

Complexity is approximately `rules x dates x 15 x set-intersection-cost`. At the initial scale this is small. A stress fixture of 500 rules, 14 dates, 15 timeslots, and 35 Jiushi courts must remain comfortably within the scheduled Worker CPU budget.

### State Reconciliation

For a successfully synchronized source:

- Upsert all fingerprints seen in the current run as active.
- Mark previously active fingerprints for evaluated rules inactive when they were not seen.
- A new fingerprint starts at notification count zero.
- Fingerprints that remained active retain their count and notification timestamp.
- A previously inactive fingerprint that reappears is a new match event: reset its notification count to zero, clear its last notification timestamp, and set a new first-seen timestamp.

For a failed source, perform no reconciliation.

### Notification Eligibility

A match is eligible when all of the following are true:

- User status is active.
- Rule is enabled and push limit is not zero.
- A verified, enabled channel exists.
- The match is new or at least 30 minutes have elapsed since its last successful notification.
- Push limit is `-1` or `notification_count < push_limit`.

All eligible matches across all successful sources in the same scheduled run are grouped by user and channel into one outbox payload. The payload is grouped by rule and lists every available facility for every timeslot.

## Authentication and Authorization

### Google Login

Better Auth implements Google's authorization-code flow. The application requests only OpenID identity scopes needed for login and profile information.

First login behavior:

- Create or update the Better Auth user.
- Store the verified email, name, and image.
- Ensure `user_access` exists.
- If the normalized email is in `ADMIN_EMAILS`, assign active administrator access.
- Otherwise assign pending user access.
- Update login timestamps.

### Sessions

- Session lifetime is 30 days.
- Cookies are same-origin, HttpOnly, Secure, and SameSite Lax or stricter where compatible with the OAuth callback.
- Every protected business request loads the session and then loads `user_access` from `APP_DB`.
- Disabled users' sessions are deleted during the administrator action.
- Pending and disabled checks are repeated by scheduled matching and queue delivery; session state is never treated as authorization for background work.

### Internal API Boundary

The React application uses private same-origin endpoints such as:

- Authentication callback and session endpoints.
- Current user and access state.
- Facility catalog and slot dashboard data.
- Rule CRUD.
- PushDeer test, save, disable, and delete.
- Administrator user listing and access changes.

These endpoints are implementation details, not a supported external API:

- No API keys or third-party access tokens are issued.
- No external API documentation is published.
- CORS is not enabled for other origins.
- Mutating requests require same-origin validation, JSON content type, session authorization, ownership checks, and Zod validation.
- Browser pages remain the supported interface.

## UI Design

### Navigation

- 场地空闲
- 通知规则
- 推送设置
- 用户管理, visible only to administrators

Pending users see the public dashboard and an account-status view. Active-only navigation is hidden and protected routes also enforce access server-side.

### Rule List

The list displays:

- Rule name and enabled state.
- Business data-source name.
- Selected facility summary or 任意场地.
- Weekday summary or 每天.
- Timeslot summary or 全天.
- Minimum consecutive count.
- Push policy.
- Current rule usage versus `rule_limit`.

Rules use a list plus independent editor page, not multiple large forms on one page.

### Rule Editor

Use shadcn/ui form primitives and compact operational styling:

- Source is a two-option single-select using business names.
- Facility choices change immediately with the selected source.
- 香港科技大学 shows its 8 configured courts.
- 上海万体汇羽毛球馆 shows all 35 configured courts.
- Weekdays, facilities, and timeslots are multi-select controls.
- Empty selections show clear wildcard labels: 每天, 任意场地, or 全天.
- Timeslots display all 15 one-hour positions from 08:00 through 23:00.
- The editor displays a live natural-language rule summary.
- Source changes clear incompatible facility selections after a confirmation if selections exist.
- Client validation mirrors server validation but never replaces it.

### Notification Settings

The first-release PushDeer settings page:

1. Accepts one personal PushDeer key.
2. Sends a clearly labeled test notification.
3. On provider success, returns a signed verification token valid for 10 minutes and bound to the user and key fingerprint.
4. Saves the raw key only when the token is valid and the submitted key has the same fingerprint.
5. Encrypts the key before storing it.
6. Displays only the masked destination afterward.

Changing the key requires a new successful test. Automated tests mock PushDeer. A real device test occurs only during explicit user testing or deployment acceptance.

### Administrator Console

The user table displays:

- Email.
- Name and avatar.
- First and most recent login.
- Pending, active, or disabled state.
- Role.
- Rule count and rule limit.
- Whether PushDeer is configured, verified, and enabled.

Administrators can filter by state, approve users, disable or re-enable users, change role where allowed, and adjust rule limits. Destructive or access-changing actions require confirmation and produce audit records.

## Secrets and Configuration

Cloudflare Secrets:

- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ADMIN_EMAILS`
- `CHANNEL_ENCRYPTION_KEYS`
- `ADMIN_PUSHDEER_KEY`
- Existing sensitive USThing and Jiushi credentials and proxy tokens

Non-secret configuration:

- Default user rule limit, 2.
- Initial administrator rule limit.
- Cooldown, 30 minutes.
- Match and outbox retention, 30 days.
- Business display names.

The current plaintext `PUSHDEER_KEYS` value in `wrangler.toml` must be removed and the exposed keys rotated. User PushDeer keys never appear in Wrangler configuration.

## Error Handling and System Alerts

### Source Failures

- Preserve the last successful snapshot.
- Do not evaluate or reconcile rules for that source.
- Record structured source, status, warning class, and duration fields.
- Alert `ADMIN_PUSHDEER_KEY` after three consecutive failed scheduled runs.
- Avoid repeated alerts while the same failure remains active.
- Send one recovery alert after the next successful sync if a failure alert was previously sent.

### Rule Failures

One malformed stored rule is logged and skipped. It does not stop other users or rules. API validation prevents new malformed records.

### Notification Failures

- Retry transient provider and network errors up to three times with backoff.
- Do not retry permanent invalid-key responses indefinitely.
- Move exhausted messages to the DLQ.
- Preserve a sanitized error in the outbox and channel records.
- Do not increment notification counters.
- A DLQ consumer or scheduled health check sends an administrator system alert.

## Testing Strategy

### Unit Tests

- Weekday and timeslot mask compilation.
- Empty filters as wildcards.
- Facility filtering and canonical sorting.
- Cross-facility consecutive runs.
- Actual end/start adjacency checks.
- Maximal run extraction without sliding-window duplicates.
- Fingerprint stability and facility-set change behavior.
- Push cooldown and finite/infinite limit eligibility.
- Notification grouping and text formatting.
- Encryption, decryption, masking, and verification-token binding.

### D1 Integration Tests

- Better Auth schema and session persistence.
- First-login pending creation and administrator seeding.
- Conditional rule creation under concurrent attempts.
- Rule ownership and source facility validation.
- Match-state reconciliation for successful versus failed sources.
- Outbox idempotency and successful counter updates.
- Disabled user session deletion.
- Administrator audit records.

### Worker Tests

- Pending, active, disabled, and administrator middleware.
- Same-origin restrictions and rejected cross-origin mutation attempts.
- PushDeer test-before-save flow using a mocked provider.
- Queue retries, permanent failures, and DLQ behavior.
- Source failure threshold and recovery alerts.
- Manual refresh does not send user notifications.

### Browser Tests

- Google login callback is manually validated in staging; automated browser tests use an authenticated test-session fixture.
- Pending users can view slots but cannot access rule or channel pages.
- Facility options switch between 8 and 35 entries when the source changes.
- Empty weekday, facility, and timeslot selections display wildcard summaries.
- All 15 timeslots are rendered and selectable.
- Rule-limit UI and server rejection remain consistent.
- Administrator approval and disable flows update the UI immediately.
- Responsive desktop and mobile layouts do not overlap or truncate controls.

### Performance Test

Generate:

- 50 users.
- 10 rules per user, 500 total.
- 14 days.
- 15 timeslots per day.
- 35 facilities for Jiushi.

Local goals:

- Pure matching p95 below 50 ms.
- Rule loading, matching, and state persistence p95 below 500 ms in the local D1 test environment.

Production structured logs record rule count, evaluated dates, matches, outbox count, CPU duration, and wall duration so these assumptions can be verified after deployment.

## Delivery Plan

### Phase 1: Frontend Foundation and Identity

- Introduce Vite React, Tailwind CSS, shadcn/ui, and Worker Static Assets.
- Introduce Hono routing.
- Create `APP_DB` and Better Auth migrations.
- Implement Google login, 30-day sessions, user states, administrator seeding, and route guards.
- Move the public dashboard into React while retaining existing source behavior.

### Phase 2: Rules, Channels, and Administration

- Add business facility catalogs and the rule editor.
- Add dynamic rule limits and administrator user management.
- Add generic notification-channel storage.
- Implement encrypted PushDeer test-before-save configuration.

### Phase 3: Matching and Delivery

- Add rule compilation and cross-facility consecutive matching.
- Add match-state reconciliation and canonical fingerprints.
- Add outbox creation and per-user notification merging.
- Add Cloudflare Queue, consumer, retries, and DLQ.

### Phase 4: Migration and Production Readiness

- Remove and rotate plaintext PushDeer keys.
- Configure administrator system alerts.
- Add retention cleanup and structured observability.
- Run the 500-rule performance test.
- Validate one real personal PushDeer test and one administrator alert in staging.
- Deploy after all TypeScript, Go, Worker, D1, and browser tests pass.

## Success Criteria

- A new Google user is created as pending and can only view the public dashboard.
- An administrator can approve the user and assign a rule limit.
- The active user can test and save a personal PushDeer key and create rules up to the assigned limit.
- A rule supports wildcards, source-specific facilities, 15 hourly timeslots, and cross-facility consecutive intervals.
- Facility-set changes create a new match and a new push allowance.
- One scheduled run produces at most one notification per user and channel, grouped by rule.
- Source failures preserve prior state and do not create false reset notifications.
- Disabling a user immediately invalidates sessions and stops background processing.
- Push failures retry asynchronously and do not block or roll back slot synchronization.
- The 500-rule fixture remains within the defined local performance goals.
