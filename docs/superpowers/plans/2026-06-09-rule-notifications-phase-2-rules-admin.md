# Rule Notifications Phase 2: Rules, Channels, and Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let active users create source-aware rules up to their assigned allowance, test and store one encrypted personal PushDeer channel, and let administrators manage user state and rule limits.

**Architecture:** Pure Zod schemas define rule and channel contracts. APP_DB repositories enforce ownership and quotas. PushDeer configuration is encrypted with Web Crypto, while the React application uses shadcn/ui forms and only receives masked destinations.

**Tech Stack:** Hono, D1, Zod, Web Crypto AES-GCM/HKDF/HMAC, React Hook Form, shadcn/ui, TanStack Query, Vitest, Testing Library.

---

## Phase Acceptance

- Active users can create, edit, disable, and delete rules up to `rule_limit`.
- Disabled rules still consume allowance.
- Rule fields support empty wildcard selections and source-specific facilities.
- Source switching changes the facility catalog and clears incompatible selections.
- A personal PushDeer key cannot be saved until an actual test succeeds.
- Stored channel configuration is encrypted and API responses expose only a mask.
- Administrators can approve, disable, re-enable, promote, and adjust limits with audit records.

### Task 1: Add Stable Source Catalogs and Rule Validation

**Files:**
- Create: `ts/shared/sources.ts`
- Create: `ts/rules/catalog.ts`
- Create: `ts/rules/schema.ts`
- Create: `ts/rules/masks.ts`
- Modify: `ts/constants/facilities.ts`
- Test: `test/worker/rule-schema.test.ts`

- [ ] **Step 1: Write rule-domain tests first**

Create `test/worker/rule-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compileRuleInput, ruleInputSchema } from "../../ts/rules/schema";

describe("ruleInputSchema", () => {
  it("treats empty multi-select groups as wildcards", () => {
    const input = ruleInputSchema.parse({
      name: "全天任意场地",
      source: "jiushi",
      weekdays: [],
      facilityIds: [],
      timeslots: [],
      minConsecutive: 2,
      pushLimit: 3,
      enabled: true,
    });

    expect(compileRuleInput(input)).toMatchObject({
      weekdayMask: 0,
      timeslotMask: 0,
      facilityIds: [],
    });
  });

  it("rejects facilities from another source", () => {
    expect(() => ruleInputSchema.parse({
      name: "错误场地",
      source: "jiushi",
      weekdays: [1],
      facilityIds: ["LG1C1"],
      timeslots: ["18:00"],
      minConsecutive: 2,
      pushLimit: 1,
      enabled: true,
    })).toThrow(/facility/i);
  });

  it("normalizes push limit zero to disabled", () => {
    const compiled = compileRuleInput(ruleInputSchema.parse({
      name: "关闭",
      source: "usthing",
      weekdays: [],
      facilityIds: [],
      timeslots: [],
      minConsecutive: 1,
      pushLimit: 0,
      enabled: true,
    }));
    expect(compiled.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify the domain modules are absent**

```bash
npm run test:worker -- test/worker/rule-schema.test.ts
```

Expected: FAIL on unresolved imports.

- [ ] **Step 3: Define shared source metadata**

Create `ts/shared/sources.ts`:

```ts
export const SOURCE_DEFINITIONS = {
  usthing: { key: "usthing", name: "香港科技大学" },
  jiushi: { key: "jiushi", name: "上海万体汇羽毛球馆" },
} as const;

export type DataSourceKey = keyof typeof SOURCE_DEFINITIONS;

export const HOURLY_TIMESLOTS = Array.from({ length: 15 }, (_, index) => {
  const hour = index + 8;
  return {
    index,
    start: `${String(hour).padStart(2, "0")}:00`,
    end: `${String(hour + 1).padStart(2, "0")}:00`,
  };
});
```

Import `DataSourceKey` from this module in existing TypeScript files and remove the duplicate type from `ts/types.ts`.

- [ ] **Step 4: Define complete source facility catalogs**

Create `ts/rules/catalog.ts` from `ts/constants/facilities.ts`. Store stable IDs and labels:

```ts
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
```

Make `ts/constants/facilities.ts` derive its maps from this catalog so display logic has one source of truth.

- [ ] **Step 5: Implement mask helpers and Zod schema**

`ts/rules/masks.ts` must export:

```ts
export function weekdaysToMask(days: number[]): number;
export function maskToWeekdays(mask: number): number[];
export function timeslotsToMask(starts: string[]): number;
export function maskToTimeslots(mask: number): string[];
```

Use Monday as bit 0 and Sunday as bit 6. Use `HOURLY_TIMESLOTS[index]` as timeslot bit positions. A zero mask remains zero.

`ruleInputSchema` validates:

- Name trimmed length 1 through 80.
- Source in the shared source keys.
- Unique weekdays 1 through 7.
- Unique facility IDs belonging to the chosen source.
- Unique timeslot starts from `HOURLY_TIMESLOTS`.
- `minConsecutive` integer 1 through 12 and no greater than 15.
- `pushLimit` equal to `-1` or integer 0 through 100.
- Boolean enabled.

- [ ] **Step 6: Re-run domain tests**

```bash
npm run test:worker -- test/worker/rule-schema.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit source catalogs and rule schema**

```bash
git add ts/shared ts/rules ts/constants/facilities.ts ts/types.ts test/worker/rule-schema.test.ts
git commit -m "feat: define notification rule domain"
```

### Task 2: Add Rule Storage, Atomic Quotas, and Private Rule Routes

**Files:**
- Create: `d1/migrations/0003_rules.sql`
- Create: `ts/rules/repository.ts`
- Create: `ts/rules/service.ts`
- Create: `ts/http/routes/rules.ts`
- Modify: `ts/http/app.ts`
- Test: `test/worker/rule-repository.test.ts`
- Test: `test/worker/rules-route.test.ts`

- [ ] **Step 1: Write quota and ownership integration tests**

Create `test/worker/rule-repository.test.ts` with a seeded active user whose `rule_limit` is 2. Assert:

```ts
const first = await service.create(userId, validRule("one"));
const second = await service.create(userId, validRule("two"));
await expect(service.create(userId, validRule("three"))).rejects.toMatchObject({
  code: "rule_limit_reached",
});

await service.update(userId, first.id, { enabled: false });
await expect(service.create(userId, validRule("still blocked"))).rejects.toMatchObject({
  code: "rule_limit_reached",
});

await expect(service.update("another-user", second.id, { name: "stolen" }))
  .rejects.toMatchObject({ code: "rule_not_found" });
```

- [ ] **Step 2: Run the test and verify the rules table is missing**

```bash
npm run test:worker -- test/worker/rule-repository.test.ts
```

Expected: FAIL with `no such table: notification_rule`.

- [ ] **Step 3: Add the rule migration**

Create `d1/migrations/0003_rules.sql`:

```sql
CREATE TABLE notification_rule (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK (source IN ('usthing', 'jiushi')),
  weekday_mask INTEGER NOT NULL DEFAULT 0 CHECK (weekday_mask BETWEEN 0 AND 127),
  timeslot_mask INTEGER NOT NULL DEFAULT 0 CHECK (timeslot_mask BETWEEN 0 AND 32767),
  facility_ids_json TEXT NOT NULL DEFAULT '[]',
  min_consecutive INTEGER NOT NULL CHECK (min_consecutive BETWEEN 1 AND 12),
  push_limit INTEGER NOT NULL CHECK (push_limit = -1 OR push_limit BETWEEN 0 AND 100),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_notification_rule_user_updated
  ON notification_rule(user_id, updated_at DESC);

CREATE INDEX idx_notification_rule_source_enabled_user
  ON notification_rule(source, enabled, user_id);
```

- [ ] **Step 4: Implement atomic quota enforcement**

Use one conditional insert:

```sql
INSERT INTO notification_rule (
  id, user_id, name, source, weekday_mask, timeslot_mask,
  facility_ids_json, min_consecutive, push_limit, enabled,
  created_at, updated_at
)
SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
WHERE EXISTS (
  SELECT 1 FROM user_access
  WHERE user_id = ? AND status = 'active'
    AND (SELECT COUNT(*) FROM notification_rule WHERE user_id = ?) < rule_limit
)
RETURNING *;
```

If no row returns, distinguish inactive access from quota exhaustion with one follow-up read. Hard-delete rules so deleted rows stop consuming allowance.

- [ ] **Step 5: Add private CRUD routes**

Register behind `sessionMiddleware` and `activeUserMiddleware`:

```text
GET    /api/rules
POST   /api/rules
GET    /api/rules/:id
PATCH  /api/rules/:id
DELETE /api/rules/:id
GET    /api/rule-options
```

`GET /api/rule-options` returns source definitions, the full facility catalog, weekdays, hourly timeslots, and push-limit options. API responses return arrays rather than raw bit masks.

Use status codes:

- 201 created.
- 204 deleted.
- 400 validation error.
- 403 inactive access.
- 404 missing or non-owned rule.
- 409 quota reached.

- [ ] **Step 6: Add route tests**

Create `test/worker/rules-route.test.ts` and verify pending access is 403, active creation is 201, quota is 409, non-owner is 404, and `pushLimit: 0` returns `enabled: false`.

- [ ] **Step 7: Run rule tests**

```bash
npm run test:worker -- test/worker/rule-repository.test.ts test/worker/rules-route.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit rule persistence and routes**

```bash
git add d1/migrations/0003_rules.sql ts/rules ts/http test/worker/rule-repository.test.ts test/worker/rules-route.test.ts
git commit -m "feat: add quota-aware notification rules"
```

### Task 3: Add Generic Notification Channels and Verified PushDeer Storage

**Files:**
- Create: `d1/migrations/0004_channels.sql`
- Create: `ts/notifications/crypto.ts`
- Create: `ts/notifications/channel-repository.ts`
- Create: `ts/notifications/providers/types.ts`
- Create: `ts/notifications/providers/pushdeer.ts`
- Create: `ts/notifications/verification-token.ts`
- Create: `ts/http/routes/channels.ts`
- Modify: `ts/http/app.ts`
- Test: `test/worker/channel-crypto.test.ts`
- Test: `test/worker/channel-routes.test.ts`

- [ ] **Step 1: Write crypto and token tests first**

Create `test/worker/channel-crypto.test.ts`:

```ts
const testKeyRing = {
  active: "test-v1",
  keys: { "test-v1": new Uint8Array(32).fill(7) },
};

it("round-trips channel config without embedding plaintext in ciphertext", async () => {
  const encrypted = await encryptChannelConfig(testKeyRing, { pushKey: "PDU-secret" });
  expect(encrypted).not.toContain("PDU-secret");
  await expect(decryptChannelConfig(testKeyRing, encrypted))
    .resolves.toEqual({ pushKey: "PDU-secret" });
});

it("binds a verification token to user and key fingerprint", async () => {
  const token = await issueVerificationToken(testKeyRing, {
    userId: "user-1",
    provider: "pushdeer",
    configFingerprint: "abc",
    expiresAt: 1_780_985_600,
  });
  await expect(verifyVerificationToken(testKeyRing, token, {
    userId: "user-1",
    provider: "pushdeer",
    configFingerprint: "different",
    now: 1_780_985_000,
  })).rejects.toThrow(/fingerprint/i);
});
```

- [ ] **Step 2: Run the tests and confirm imports fail**

```bash
npm run test:worker -- test/worker/channel-crypto.test.ts
```

Expected: FAIL on unresolved modules.

- [ ] **Step 3: Add notification-channel migration**

Create `d1/migrations/0004_channels.sql`:

```sql
CREATE TABLE notification_channel (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 32),
  encrypted_config TEXT NOT NULL,
  destination_mask TEXT NOT NULL,
  config_fingerprint TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  UNIQUE (user_id, provider)
) STRICT;

CREATE INDEX idx_notification_channel_user_enabled
  ON notification_channel(user_id, enabled, provider);
```

- [ ] **Step 4: Implement versioned encryption and HMAC fingerprints**

`crypto.ts` must:

1. Parse `CHANNEL_ENCRYPTION_KEYS` as `{ active: string, keys: Record<string, string> }` and reject an absent active key, duplicate/unsafe key IDs, or decoded keys that are not exactly 32 bytes.
2. Use HKDF-SHA-256 with fixed context strings `courtsync/channel/encryption/v1` and `courtsync/channel/fingerprint/v1` to derive separate AES-GCM and HMAC keys for each key ID.
3. Generate a fresh 12-byte IV with `crypto.getRandomValues`.
4. Store `v1.<keyId>.<base64url(iv)>.<base64url(ciphertext)>` so old records remain decryptable during key rotation.
5. Use canonical JSON with sorted object keys before encryption and fingerprinting.

`fingerprintChannelConfig()` returns a base64url HMAC-SHA-256 digest. Never use raw SHA-256 for secret material.

`decryptChannelConfig()` returns both `keyId` and parsed config. When `ChannelRepository` reads a record encrypted under a non-active key, it re-encrypts the same config with the active key and updates the fingerprint in the same request. Add a test with `old-v1` and `new-v2` keys proving the first read upgrades the stored ciphertext and the second read uses `new-v2`.

- [ ] **Step 5: Implement PushDeer provider test**

Define:

```ts
export interface NotificationProvider<TConfig, TPayload> {
  send(config: TConfig, payload: TPayload, fetchImpl?: typeof fetch): Promise<void>;
}
```

`PushDeerProvider.send()` sends URL-encoded form data to `https://api2.pushdeer.com/message/push`, not a query string, and checks HTTP success plus JSON `code === 0`. The test message must read:

```text
CourtSync 测试通知
推送配置验证成功。此消息由用户主动触发，无需处理。
```

Do not log the push key or full response body.

- [ ] **Step 6: Implement 10-minute verification tokens**

The token payload contains `userId`, `provider`, `configFingerprint`, and `expiresAt`. Encode tokens as `v1.<keyId>.<base64url(payload)>.<base64url(signature)>`. Verification selects the key by ID, uses a constant-time byte comparison, and rejects expired, malformed, unknown-key, wrong-user, wrong-provider, and wrong-fingerprint tokens.

- [ ] **Step 7: Write and implement channel route tests**

Create `test/worker/channel-routes.test.ts` with a mocked PushDeer fetch:

```ts
it("requires a successful test token before saving", async () => {
  const saveWithoutTest = await activeRequest("/api/channels/pushdeer", {
    method: "PUT",
    json: { pushKey: "PDU-secret", verificationToken: "invalid" },
  });
  expect(saveWithoutTest.status).toBe(400);

  const tested = await activeRequest("/api/channels/pushdeer/test", {
    method: "POST",
    json: { pushKey: "PDU-secret" },
  });
  const { verificationToken } = await tested.json();

  const saved = await activeRequest("/api/channels/pushdeer", {
    method: "PUT",
    json: { pushKey: "PDU-secret", verificationToken },
  });
  expect(saved.status).toBe(200);
  expect(await saved.text()).not.toContain("PDU-secret");
});
```

Routes:

```text
GET    /api/channels
POST   /api/channels/pushdeer/test
PUT    /api/channels/pushdeer
PATCH  /api/channels/pushdeer
DELETE /api/channels/pushdeer
```

- [ ] **Step 8: Run channel tests**

```bash
npm run test:worker -- test/worker/channel-crypto.test.ts test/worker/channel-routes.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Configure the encryption secret**

Generate a versioned 32-byte key ring locally without storing it on disk:

```bash
node -e 'const c=require("node:crypto");process.stdout.write(JSON.stringify({active:"v1",keys:{v1:c.randomBytes(32).toString("base64")}}))' \
  | npx wrangler secret put CHANNEL_ENCRYPTION_KEYS
```

Expected: Wrangler confirms secret upload. Do not write the generated value to `.dev.vars` for shared environments; each developer uses an independent local key.

- [ ] **Step 10: Commit generic channels and PushDeer**

```bash
git add d1/migrations/0004_channels.sql ts/notifications ts/http test/worker/channel-crypto.test.ts test/worker/channel-routes.test.ts
git commit -m "feat: add verified encrypted notification channels"
```

### Task 4: Add Administrator User Management and Audit Logging

**Files:**
- Create: `d1/migrations/0005_admin_audit.sql`
- Create: `ts/app-db/admin-repository.ts`
- Create: `ts/http/routes/admin-users.ts`
- Modify: `ts/http/app.ts`
- Test: `test/worker/admin-users.test.ts`

- [ ] **Step 1: Write administrator behavior tests**

Create these fixtures and exact assertions:

| Case | Fixture | Assertion |
| --- | --- | --- |
| Approve pending user | Pending target and active admin actor | Target becomes active and one `approve_user` audit row contains before/after JSON. |
| Disable user | Active target with two Better Auth sessions | Target becomes disabled and `SELECT COUNT(*) FROM session WHERE userId = ?` returns 0. |
| Protect secret administrator | Target email appears in `ADMIN_EMAILS` | PATCH returns 409 and the access row is unchanged. |
| Lower rule limit | Target has three rules and limit 5 | Limit becomes 2, all three rules remain, and future creation returns quota reached. |
| Reject non-admin | Active user actor | Route returns 403 and no audit row is inserted. |

- [ ] **Step 2: Add audit migration**

Create `d1/migrations/0005_admin_audit.sql`:

```sql
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 64),
  target_user_id TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES user(id),
  FOREIGN KEY (target_user_id) REFERENCES user(id)
) STRICT;

CREATE INDEX idx_admin_audit_target_created
  ON admin_audit_log(target_user_id, created_at DESC);
```

- [ ] **Step 3: Implement administrator list query**

Return one row per user with:

```ts
interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  image?: string;
  role: UserRole;
  status: UserStatus;
  ruleLimit: number;
  ruleCount: number;
  pushDeerConfigured: boolean;
  pushDeerVerified: boolean;
  pushDeerEnabled: boolean;
  firstLoginAt: string;
  lastLoginAt: string;
}
```

Use correlated aggregate subqueries or grouped joins with indexes; do not issue one query per user.

- [ ] **Step 4: Implement administrator routes**

Behind `adminMiddleware`:

```text
GET   /api/admin/users?status=&search=&cursor=
PATCH /api/admin/users/:id/access
GET   /api/admin/audit?targetUserId=&cursor=
```

The PATCH body supports `status`, `role`, and `ruleLimit`. Validate `ruleLimit` 0 through 1000. Batch access update, session deletion when disabling, and audit insertion so they succeed or fail together.

- [ ] **Step 5: Run administrator tests**

```bash
npm run test:worker -- test/worker/admin-users.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit administrator services**

```bash
git add d1/migrations/0005_admin_audit.sql ts/app-db/admin-repository.ts ts/http/routes/admin-users.ts ts/http/app.ts test/worker/admin-users.test.ts
git commit -m "feat: add audited administrator user management"
```

### Task 5: Build Rule, PushDeer, and Administrator React Features

**Files:**
- Create: `src/web/features/rules/RulesPage.tsx`
- Create: `src/web/features/rules/RuleEditorPage.tsx`
- Create: `src/web/features/rules/RuleForm.tsx`
- Create: `src/web/features/rules/RuleSummary.tsx`
- Create: `src/web/features/channels/PushDeerSettingsPage.tsx`
- Create: `src/web/features/admin/AdminUsersPage.tsx`
- Create: `src/web/features/admin/UserAccessDialog.tsx`
- Modify: `src/web/app/router.tsx`
- Modify: `src/web/app/providers.tsx`
- Modify: `src/web/lib/api.ts`
- Test: `test/web/rule-form.test.tsx`
- Test: `test/web/pushdeer-settings.test.tsx`
- Test: `test/web/admin-users.test.tsx`

- [ ] **Step 1: Install form and remaining shadcn components**

```bash
npm install react-hook-form @hookform/resolvers
npx shadcn@latest add form input label select switch checkbox toggle-group dialog alert-dialog table skeleton toast scroll-area
```

- [ ] **Step 2: Write source-switch and wildcard form tests**

`test/web/rule-form.test.tsx` must verify:

```ts
it("switches from 8 HKUST courts to 35 Jiushi courts and clears incompatible selections", async () => {
  const user = userEvent.setup();
  render(<RuleForm initialSource="usthing" />);
  expect(screen.getAllByRole("checkbox", { name: /LG1|SF/ })).toHaveLength(8);
  await user.click(screen.getByRole("checkbox", { name: "LG1C1" }));
  await user.click(screen.getByRole("radio", { name: "上海万体汇羽毛球馆" }));
  await user.click(screen.getByRole("button", { name: "确认切换" }));
  expect(screen.getAllByRole("checkbox", { name: /羽毛球/ })).toHaveLength(35);
  expect(screen.queryByText("LG1C1")).not.toBeInTheDocument();
});

it("shows wildcard summaries when groups are empty", () => {
  render(<RuleSummary value={emptyRule} />);
  expect(screen.getByText(/每天/)).toBeVisible();
  expect(screen.getByText(/任意场地/)).toBeVisible();
  expect(screen.getByText(/全天/)).toBeVisible();
});
```

- [ ] **Step 3: Implement the list plus independent editor layout**

`RulesPage` displays usage as `已使用 {count} / {ruleLimit}` and disables the new-rule command when at quota. `RuleEditorPage` contains:

- Name input.
- Business-name source cards.
- Weekday multi-select with OR label.
- Source-aware facility grid with OR label and empty wildcard text.
- All 15 hourly timeslots with OR label and empty wildcard text.
- Minimum consecutive select 1 through 12.
- Push-limit select `-1`, `0`, `1`, `3`.
- Enabled switch.
- Live natural-language summary.

Use icon-only edit and overflow actions with tooltips. Keep cards at 8px radius or less.

- [ ] **Step 4: Implement PushDeer settings with test-before-save state**

The page state machine is:

```text
empty -> testing -> tested(token, fingerprint) -> saving -> saved(mask)
```

Editing the input after a successful test discards the verification token. The Save button remains disabled until the current input has a valid test token. Display only `destinationMask` after save.

- [ ] **Step 5: Implement administrator user table**

Include filters for pending, active, disabled, email/name search, avatar, login times, status, role, rule count/limit, and PushDeer state. Access-changing actions use `AlertDialog`, send one PATCH, invalidate the users query, and display the server result.

- [ ] **Step 6: Add routes and active/admin navigation**

Replace the temporary Phase 1 routes with:

```tsx
{ path: "/rules", element: <RulesPage /> },
{ path: "/rules/new", element: <RuleEditorPage /> },
{ path: "/rules/:ruleId", element: <RuleEditorPage /> },
{ path: "/settings/notifications", element: <PushDeerSettingsPage /> },
```

Nest `/admin/users` beneath an admin-only route guard.

- [ ] **Step 7: Run frontend and phase tests**

```bash
npm run test:web -- test/web/rule-form.test.tsx test/web/pushdeer-settings.test.tsx test/web/admin-users.test.tsx
npm run test:worker
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit Phase 2 UI**

```bash
git add src test/web
git commit -m "feat: add rules channels and admin interfaces"
```

## Phase 2 Completion Check

Run `npm run dev` and verify with two seeded users:

1. Pending user cannot load rule, channel, or admin routes.
2. Active user sees its current rule usage.
3. Rule source switching changes 8 to 35 facilities.
4. Empty selections save and render as wildcards.
5. A failed PushDeer test cannot be saved.
6. A successful PushDeer test saves only encrypted configuration.
7. Administrator approval changes access immediately.
8. Administrator disable removes sessions immediately.

Commit acceptance fixes separately:

```bash
git add -A
git commit -m "test: complete phase two acceptance"
```
