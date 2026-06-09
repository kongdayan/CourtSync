# Rule Notifications Phase 4: Production Migration, Verification, and Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the feature under browser and performance tests, remove legacy credential paths, migrate Cloudflare resources safely, validate real PushDeer delivery in staging, and deploy with rollback evidence.

**Architecture:** Automated unit, Worker, D1, browser, and benchmark checks gate rollout. Staging uses independent D1, queue, OAuth callback, and PushDeer credentials. Production migration applies additive schemas first, deploys code second, and verifies health before legacy files are removed.

**Tech Stack:** Playwright, Vitest, Wrangler, Cloudflare D1/Queues/Secrets, Chrome screenshots, existing Go test suite.

---

## Phase Acceptance

- Desktop and mobile workflows pass Playwright without overlap or truncation.
- The 500-rule fixture meets the documented local thresholds.
- No plaintext PushDeer keys remain in Git history's current tree or active configuration.
- Google OAuth, personal PushDeer test, scheduled match, queue delivery, disable-user revocation, and administrator alert pass in staging.
- Production migrations and deploy complete with a documented rollback command and post-deploy evidence.

### Task 1: Add Browser Workflow and Responsive Layout Tests

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/dashboard.spec.ts`
- Create: `e2e/rules.spec.ts`
- Create: `e2e/channels.spec.ts`
- Create: `e2e/admin.spec.ts`
- Create: `e2e/fixtures/api-mocks.ts`
- Modify: `package.json`

- [ ] **Step 1: Configure Playwright with desktop and mobile projects**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
```

Use `page.route("**/api/**", ...)` fixtures for authenticated browser UI states. Worker authorization and D1 behavior remain covered by Worker integration tests; do not add a production test-login endpoint.

- [ ] **Step 2: Add an overlap assertion helper**

In `e2e/fixtures/api-mocks.ts`, export:

```ts
export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

export async function expectControlsInsideViewport(page: Page) {
  const failures = await page.locator("button, input, select, [role=checkbox], [role=radio]").evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left < -1 || rect.right > window.innerWidth + 1 ? [node.getAttribute("aria-label") ?? node.textContent ?? node.tagName] : [];
    }),
  );
  expect(failures).toEqual([]);
}
```

- [ ] **Step 3: Test dashboard parity**

`dashboard.spec.ts` verifies:

- Both business source names.
- Desktop table and mobile date sections.
- Date pagination.
- Detailed/compact toggle.
- Activity tooltip.
- Dark mode persistence.
- Snapshot export button starts the export flow.
- No horizontal page overflow at both viewports.

- [ ] **Step 4: Test rule workflows**

`rules.spec.ts` verifies:

- Rule usage and quota-disabled New button.
- Eight HKUST and 35 Jiushi facility choices.
- Source-change confirmation clears old facilities.
- Empty weekdays/facilities/timeslots render 每天/任意场地/全天.
- All 15 timeslots from 08:00-09:00 through 22:00-23:00.
- Natural-language summary updates.
- Push limit zero disables the rule.
- Text remains inside controls on mobile.

- [ ] **Step 5: Test PushDeer and administrator workflows**

`channels.spec.ts` verifies Save is disabled before Test, input edits invalidate a tested token, and only masked destination displays after save.

`admin.spec.ts` verifies pending approval, limit editing, disable confirmation, visible PushDeer state, and immediate table refresh.

- [ ] **Step 6: Run browser tests**

```bash
npx playwright install chromium
npm run test:e2e
```

Expected: all desktop and mobile tests pass.

- [ ] **Step 7: Commit browser tests**

```bash
git add playwright.config.ts e2e package.json package-lock.json
git commit -m "test: cover notification workflows in browser"
```

### Task 2: Add the 500-Rule Performance Benchmark and Observability Assertions

**Files:**
- Create: `scripts/benchmark-matching.ts`
- Create: `test/worker/scheduled-performance.test.ts`
- Modify: `ts/sync/orchestrator.ts`
- Test: `test/worker/structured-logging.test.ts`

- [ ] **Step 1: Write deterministic benchmark fixture generators**

In `scripts/benchmark-matching.ts`, generate:

```ts
const users = Array.from({ length: 50 }, (_, userIndex) => `user-${userIndex}`);
const rules = users.flatMap((userId, userIndex) =>
  Array.from({ length: 10 }, (_, ruleIndex) => compiledRuleFixture({
    id: `${userId}-rule-${ruleIndex}`,
    userId,
    source: ruleIndex % 2 === 0 ? "usthing" : "jiushi",
    weekdayMask: ruleIndex % 3 === 0 ? 0 : 0b0010101,
    timeslotMask: ruleIndex % 4 === 0 ? 0 : 0b001111100000000,
    facilityIds: ruleIndex % 5 === 0 ? [] : [String(113 + (userIndex + ruleIndex) % 35)],
    minConsecutive: 1 + (ruleIndex % 4),
    pushLimit: ruleIndex % 2 === 0 ? 3 : -1,
  })),
);
```

Generate 14 dates, 15 hourly slots, and all 35 Jiushi facilities with a deterministic availability pattern. Warm up 5 iterations, measure 30, sort durations, and calculate p95.

- [ ] **Step 2: Fail the benchmark when pure matching exceeds 50 ms p95**

The script prints JSON:

```json
{"rules":500,"dates":14,"slotsPerDay":15,"facilities":35,"iterations":30,"p95Ms":0}
```

Exit 1 if `p95Ms >= 50`. Do not hide a threshold failure with warnings.

- [ ] **Step 3: Add local D1 orchestration performance test**

`scheduled-performance.test.ts` seeds the same 500 rules and representative snapshots into local D1, runs rule loading, matching, reconciliation, and outbox planning 10 times after one warmup, and asserts p95 below 500 ms. Replace queue and provider network calls with deterministic fakes.

- [ ] **Step 4: Add structured summary logging**

At the end of each scheduled run log one JSON object:

```ts
console.log(JSON.stringify({
  event: "scheduled_sync_complete",
  syncRunId,
  sourceResults,
  ruleCount,
  matchCount,
  outboxCount,
  durationMs,
}));
```

Do not include user emails, push destinations, rule names, facility selections, or upstream response bodies.

- [ ] **Step 5: Test the structured log shape**

Spy on `console.log`, run a fixture sync, parse the final JSON line, and assert only the approved keys are present.

- [ ] **Step 6: Run benchmarks and tests**

```bash
npm run benchmark:matching
npm run test:worker -- test/worker/scheduled-performance.test.ts test/worker/structured-logging.test.ts
```

Expected: benchmark exits 0 and both tests pass.

- [ ] **Step 7: Commit performance coverage**

```bash
git add scripts/benchmark-matching.ts test/worker/scheduled-performance.test.ts test/worker/structured-logging.test.ts ts/sync/orchestrator.ts
git commit -m "test: enforce notification matching performance"
```

### Task 3: Remove Legacy Credential and Server-Rendered Paths

**Files:**
- Verify absent: `wrangler.toml`
- Delete: `ts/views/table.ts` after React parity tests pass
- Modify: `ts/main.ts`
- Modify: `ts/sync/run.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CODEX.md`
- Test: `test/worker/no-legacy-routes.test.ts`

- [ ] **Step 1: Verify revoked legacy PushDeer keys and configure the new administrator key**

Confirm every key that appeared in the deleted `wrangler.toml` was revoked during Phase 1. Create a new administrator-only key and upload it if Phase 3 has not already configured production:

```bash
npx wrangler secret put ADMIN_PUSHDEER_KEY
```

Do not set `PUSHDEER_KEYS` again.

- [ ] **Step 2: Write legacy-route regression tests**

Create `test/worker/no-legacy-routes.test.ts`:

```ts
it("does not expose the bearer token administration page", async () => {
  const response = await exports.default.fetch("http://example.com/admin/token");
  expect(response.status).toBe(404);
});

it("does not return server-rendered dashboard HTML from the Worker API", async () => {
  const response = await exports.default.fetch("http://example.com/api/slots?format=html");
  expect(response.headers.get("content-type")).toContain("application/json");
});
```

- [ ] **Step 3: Remove legacy token and server-rendered UI code**

Remove:

- `/admin/token` and `TOKEN_ADMIN_SECRET` handling.
- KV bearer update form.
- `renderSlotsTable` imports and Worker HTML responses.
- `PUSHDEER_KEYS` parsing.
- `ts/views/table.ts` after screenshot/UI parity tests pass.

Keep `templates/index.html` because the Go WebSocket CLI still serves it. Keep `hkust_token` KV fallback only if static-token operational recovery still requires it; document that it is not user authentication.

- [ ] **Step 4: Verify the obsolete Wrangler TOML remains absent**

Run `test ! -e wrangler.toml` and confirm `wrangler.jsonc` contains every required binding, trigger, observability setting, and non-secret variable.

- [ ] **Step 5: Scan the active tree for secrets and dead endpoints**

Run:

```bash
rg -n "PDU[0-9A-Za-z]+|PUSHDEER_KEYS|TOKEN_ADMIN_SECRET|/admin/token|renderSlotsTable" . \
  -g '!package-lock.json' -g '!docs/superpowers/**'
```

Expected: no plaintext PushDeer key, no global user-key variable, no token admin route, and no removed renderer reference.

- [ ] **Step 6: Update operational documentation**

README and agent docs must describe:

- React SPA and private API.
- Google login and user states.
- APP_DB and Queue bindings.
- Secret names without values.
- Local D1 migration commands.
- User PushDeer versus administrator alert key.
- Matching only on scheduled successful syncs.
- No supported external API.

- [ ] **Step 7: Run regression tests**

```bash
npm run test:worker -- test/worker/no-legacy-routes.test.ts
npm run build
git diff --check
```

Expected: PASS.

- [ ] **Step 8: Commit legacy cleanup**

```bash
git add -A
git commit -m "chore: remove legacy notification credentials and UI"
```

### Task 4: Provision Staging and Validate Real Integrations

**Files:**
- Modify: `wrangler.jsonc`
- Create: `docs/operations/rule-notifications-runbook.md`
- Create: `ts/http/routes/admin-diagnostics.ts`
- Modify: `ts/http/app.ts`
- Test: `test/worker/admin-diagnostics.test.ts`

- [ ] **Step 1: Create isolated staging resources**

Run and record the returned resource identifiers directly in the `env.staging` section of `wrangler.jsonc`:

```bash
npx wrangler d1 create courtsync-app-data-staging
npx wrangler queues create courtsync-notifications-staging
npx wrangler queues create courtsync-notifications-staging-dlq
```

Use staging source snapshot databases or local/mock upstream configuration that cannot alter production bookings.

- [ ] **Step 2: Add staging secrets**

```bash
npx wrangler secret put BETTER_AUTH_SECRET --env staging
npx wrangler secret put GOOGLE_CLIENT_ID --env staging
npx wrangler secret put GOOGLE_CLIENT_SECRET --env staging
npx wrangler secret put ADMIN_EMAILS --env staging
npx wrangler secret put CHANNEL_ENCRYPTION_KEYS --env staging
npx wrangler secret put ADMIN_PUSHDEER_KEY --env staging
```

Set Google OAuth authorized redirect URI to the Better Auth callback on the staging hostname and production URI separately.

- [ ] **Step 3: Add an administrator-only diagnostic action**

Add `POST /api/admin/diagnostics/admin-pushdeer`. It requires active administrator access and sends:

```text
CourtSync 管理员告警测试
系统告警通道配置正常。此消息由管理员主动触发。
```

Return only `{ ok: true }` or a sanitized provider error. Audit the action as `test_admin_alert`; the Phase 2 audit schema accepts bounded action strings, so no schema change is required.

- [ ] **Step 4: Write diagnostic authorization tests**

Assert non-admin is 403, missing secret is 503, provider failure is sanitized, and successful administrator test creates an audit record.

- [ ] **Step 5: Apply staging migrations and deploy**

```bash
npx wrangler d1 migrations apply courtsync-app-data-staging --env staging --remote
npm run build
npx wrangler deploy --env staging
```

Expected: all migrations apply once and deployment prints the staging URL.

- [ ] **Step 6: Perform staging acceptance in this order**

1. Google login as a new normal account; verify pending.
2. Google login as `ADMIN_EMAILS`; approve the normal account and set a higher rule limit.
3. Save one rule with wildcards and one source-specific rule.
4. Test and save a personal PushDeer key; verify one real device message.
5. Seed or wait for a matching snapshot; invoke scheduled staging sync.
6. Verify one merged notification and correct match count.
7. Disable the user and verify existing browser session loses protected access.
8. Trigger administrator diagnostic PushDeer and verify one system alert.
9. Simulate three staging source failures and one recovery using mocked/staging source controls; verify one failure and one recovery alert.

- [ ] **Step 7: Write the operations runbook**

Document exact commands for:

- Applying migrations.
- Deploying staging and production.
- Inspecting queue and DLQ status.
- Replaying a failed outbox by setting it pending and re-enqueuing through an admin-only operational script.
- Disabling all user notifications by pausing the queue consumer.
- Rotating Google, encryption, personal, and administrator PushDeer secrets.
- Rolling back to the previous Worker deployment.

- [ ] **Step 8: Commit staging and runbook work**

```bash
git add wrangler.jsonc ts/http d1/migrations docs/operations test/worker/admin-diagnostics.test.ts
git commit -m "ops: add staging verification and notification runbook"
```

### Task 5: Apply Production Migrations and Complete Deployment Verification

**Files:**
- Modify: `README.md` with final deployed behavior if staging revealed differences
- Modify: `.github/workflows/release.yml`
- Create: `.github/workflows/worker-checks.yml`

- [ ] **Step 1: Add CI gates before production deployment**

Create `.github/workflows/worker-checks.yml` that runs on pull requests and pushes to `main`:

```yaml
name: Worker Checks
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run cf-typegen
      - run: npm run typecheck
      - run: npm run test
      - run: npm run test:e2e
      - run: npm run benchmark:matching
      - run: npm run build
      - run: go test ./...
      - run: go vet ./...
```

Keep the existing tag release job for Go binaries.

- [ ] **Step 2: Run the complete local verification suite**

```bash
npm ci
npm run cf-typegen
npm run typecheck
npm run test
npm run test:e2e
npm run benchmark:matching
npm run build
env GOCACHE=/tmp/courtsync-go-cache go test ./...
env GOCACHE=/tmp/courtsync-go-cache go vet ./...
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Back up and migrate production APP_DB**

Before migration:

```bash
npx wrangler d1 export courtsync-app-data --remote --output /tmp/courtsync-app-pre-notifications.sql
```

Then:

```bash
npx wrangler d1 migrations list courtsync-app-data --remote
npx wrangler d1 migrations apply courtsync-app-data --remote
```

Expected: the backup file exists and all pending migrations apply once.

- [ ] **Step 4: Deploy production and retain the previous deployment ID**

```bash
npx wrangler deployments list
npm run deploy
npx wrangler deployments list
```

Record the previous deployment ID from the first list command in the release notes. If rollback is needed immediately after this deployment, run Wrangler's previous-deployment rollback:

```bash
npx wrangler rollback
```

Confirm the interactive summary names the deployment recorded before this release before accepting the rollback.

- [ ] **Step 5: Perform production smoke verification**

Verify:

1. Public dashboard loads both sources.
2. Existing source snapshots and scheduled refresh remain current.
3. Google login creates correct pending/admin states.
4. Administrator user table loads without N+1 request behavior.
5. One test user can save a verified personal PushDeer key.
6. One controlled rule match sends one merged notification.
7. Queue has no unexpected retries and DLQ is empty.
8. Logs contain structured summaries without personal or secret data.

- [ ] **Step 6: Commit final production documentation changes**

```bash
git add README.md .github docs/operations
git commit -m "ci: gate and document notification rollout"
```

## Phase 4 Completion Check

Run:

```bash
git status --short --branch
git log --oneline -12
```

Expected:

- Worktree is clean.
- Phase commits are visible in order.
- No plaintext user or administrator PushDeer key exists in the current tree.
- Staging and production smoke evidence is recorded in the operations runbook or release notes.
