# Rule Notifications Phase 1: Frontend Foundation and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert CourtSync into a React SPA plus private Hono API, add `APP_DB`, and implement Google identity with pending, active, disabled, and administrator access states.

**Architecture:** Existing provider clients and source snapshot databases remain unchanged. `ts/main.ts` becomes a thin multi-handler entrypoint, Hono owns `/api/*`, Cloudflare Static Assets serves React routes, and Better Auth stores identities and 30-day sessions in `APP_DB`.

**Tech Stack:** Vite, React, Tailwind CSS, shadcn/ui, Hono, Better Auth, Cloudflare Workers Static Assets, D1, Zod, Vitest 4.1+, Workers Vitest integration, Testing Library.

---

## Phase Acceptance

- The public availability dashboard renders from React for both sources.
- Google login can complete in local/staging environments with configured credentials.
- First-time normal users become `pending`; `ADMIN_EMAILS` users become active administrators.
- Pending users can view slots and account state but receive 403 from protected feature endpoints.
- Disabled users lose all sessions immediately.
- Existing scheduled source synchronization still works and no user notification behavior changes yet.

### Task 1: Install the Full-Stack Toolchain and Establish Test Runners

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Replace: `wrangler.toml` with `wrangler.jsonc`
- Modify: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `vitest.web.config.ts`
- Create: `test/tsconfig.json`
- Create: `test/setup-app-db.ts`
- Create: `worker-configuration.d.ts` through Wrangler type generation

- [ ] **Step 1: Install runtime and development dependencies**

Run:

```bash
npm install react react-dom react-router-dom @tanstack/react-query hono better-auth zod lucide-react class-variance-authority clsx tailwind-merge
npm install -D vite @vitejs/plugin-react @cloudflare/vite-plugin wrangler@latest typescript vitest@^4.1.0 @cloudflare/vitest-pool-workers @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @types/react @types/react-dom tailwindcss @tailwindcss/vite @playwright/test tsx
```

Expected: `package-lock.json` updates and npm exits 0.

- [ ] **Step 2: Replace package scripts with explicit build and test entrypoints**

Set `package.json` scripts to:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "deploy": "npm run build && wrangler deploy",
    "preview": "vite preview",
    "cf-typegen": "wrangler types --env-interface Env",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "npm run test:worker && npm run test:web",
    "test:worker": "vitest run --config vitest.config.ts",
    "test:web": "vitest run --config vitest.web.config.ts",
    "test:e2e": "playwright test",
    "benchmark:matching": "tsx scripts/benchmark-matching.ts"
  }
}
```

- [ ] **Step 3: Migrate Wrangler configuration without changing existing resource IDs**

Create `wrangler.jsonc` with the current Worker name, `DB`, `JIUSHI_DB`, `hkust_token`, cron, observability, and non-secret source settings. Use this shape and copy the existing IDs exactly from `wrangler.toml`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "courtsync",
  "main": "ts/main.ts",
  "compatibility_date": "2026-06-09",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "triggers": { "crons": ["*/5 0-14 * * *"] },
  "kv_namespaces": [
    {
      "binding": "hkust_token",
      "id": "e73e6d33bad345538d7b6142c6b0c230",
      "preview_id": "bed13acf84de498db5695ac4bfcdf7a2"
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "hkust-badminton-slot-data",
      "database_id": "4cc65080-5400-44de-b74c-661320af9b7e"
    },
    {
      "binding": "JIUSHI_DB",
      "database_name": "jiushi-badminton-slot-data",
      "database_id": "f230462d-bf7f-451b-8c99-ab9e5ea0a73f"
    }
  ],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1,
    "logs": { "enabled": true, "invocation_logs": true }
  },
  "vars": {
    "APP_BASE_URL": "https://sports.hunao.online",
    "DEFAULT_RULE_LIMIT": "2",
    "ADMIN_RULE_LIMIT": "20",
    "USTHING_USERNAME": "yanag@connect.ust.hk",
    "USTHING_USER_TYPE": "01",
    "JIUSHI_VENUE_ID": "27",
    "JIUSHI_MAX_DAYS": "9"
  }
}
```

Do not copy `PUSHDEER_KEYS` into the new file. Revoke every PushDeer key that appeared in `wrangler.toml`, then delete `wrangler.toml` in this task so plaintext credentials leave the active tree immediately. The legacy scheduled source sync will temporarily run without global PushDeer delivery until the per-user queue pipeline is added in Phase 3.

- [ ] **Step 4: Add Vite and TypeScript configuration**

Create `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare({ configPath: "./wrangler.jsonc" })],
  resolve: {
    alias: {
      "@web": new URL("./src/web", import.meta.url).pathname,
      "@shared": new URL("./ts/shared", import.meta.url).pathname,
    },
  },
});
```

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["./worker-configuration.d.ts", "vite/client"],
    "baseUrl": ".",
    "paths": {
      "@web/*": ["src/web/*"],
      "@shared/*": ["ts/shared/*"]
    }
  },
  "include": ["ts/**/*.ts", "src/**/*.ts", "src/**/*.tsx", "test/**/*.ts", "vite.config.ts", "vitest*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Configure Worker and browser-unit Vitest projects**

Create `vitest.config.ts`:

```ts
import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.resolve("d1/migrations")),
          APP_BASE_URL: "http://example.com",
          DEFAULT_RULE_LIMIT: "2",
          ADMIN_RULE_LIMIT: "20",
          ADMIN_EMAILS: "admin@example.com",
          BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
          GOOGLE_CLIENT_ID: "test-google-client",
          GOOGLE_CLIENT_SECRET: "test-google-secret"
        }
      }
    }))
  ],
  test: {
    include: ["test/worker/**/*.test.ts"],
    setupFiles: ["./test/setup-app-db.ts"],
    sequence: { concurrent: false }
  }
});
```

Create `vitest.web.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["test/web/**/*.test.tsx"],
    setupFiles: ["./test/setup-web.ts"]
  }
});
```

Create `test/setup-app-db.ts`:

```ts
import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";

declare module "cloudflare:workers" {
  interface CloudflareEnvironment {
    TEST_MIGRATIONS: D1Migration[];
  }
}

await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS);
```

Create `test/setup-web.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Create the application D1 resource and generate binding types**

Run:

```bash
npx wrangler d1 create courtsync-app-data
```

Add the exact UUID printed by Wrangler as the third `d1_databases` entry with binding `APP_DB` and database name `courtsync-app-data`. Then run:

```bash
npm run cf-typegen
```

Expected: `worker-configuration.d.ts` contains `DB`, `JIUSHI_DB`, `APP_DB`, `ASSETS`, and configured variables.

- [ ] **Step 7: Verify configuration before feature code**

Run:

```bash
npm run typecheck
```

Expected: any failures are limited to the not-yet-created React entry files or APP_DB migration directory. Create empty `d1/migrations/.gitkeep` only if the migration reader requires the directory to exist; do not suppress unrelated type errors.

- [ ] **Step 8: Commit toolchain setup**

```bash
git add package.json package-lock.json wrangler.jsonc wrangler.toml vite.config.ts tsconfig.json vitest.config.ts vitest.web.config.ts test worker-configuration.d.ts d1/migrations
git commit -m "build: add React Worker test toolchain"
```

### Task 2: Extract Existing Synchronization and Add a Hono Worker Shell

**Files:**
- Create: `ts/sync/run.ts`
- Create: `ts/http/app.ts`
- Create: `ts/http/routes/health.ts`
- Modify: `ts/main.ts`
- Test: `test/worker/health.test.ts`
- Test: `test/worker/sync.test.ts`

- [ ] **Step 1: Write the failing health route test**

Create `test/worker/health.test.ts`:

```ts
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns the service identity without exposing bindings", async () => {
    const response = await exports.default.fetch("http://example.com/api/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "courtsync",
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm the route does not exist**

Run:

```bash
npm run test:worker -- test/worker/health.test.ts
```

Expected: FAIL because the existing Worker returns slot JSON rather than the health payload.

- [ ] **Step 3: Move synchronization exports out of the HTTP entrypoint**

Move `WorkerEnv`, `TimeslotSyncResult`, source config parsing, `runUSThingTimeslotSync`, `runJiushiTimeslotSync`, and `runTimeslotSync` from `ts/main.ts` into `ts/sync/run.ts`. Export:

```ts
export type SourceSyncStatus = "success" | "failed";

export interface TimeslotSyncResult {
  source: DataSourceKey;
  status: SourceSyncStatus;
  slots: UnifiedTimeSlot[];
  warnings: string[];
  startDate: string;
  endDate: string;
  generatedAt: Date;
}

export async function runTimeslotSync(
  source: DataSourceKey,
  env: Env,
  fetchImpl: typeof fetch = fetch,
  startDate?: string,
  endDate?: string,
): Promise<TimeslotSyncResult>;
```

Preserve current source behavior. Do not change PushDeer behavior in this task; Phase 3 removes the legacy global push after the replacement pipeline exists.

- [ ] **Step 4: Add Hono app and health route**

Create `ts/http/routes/health.ts`:

```ts
import { Hono } from "hono";

export const healthRoutes = new Hono<{ Bindings: Env }>().get("/health", (c) =>
  c.json({ ok: true, service: "courtsync" }),
);
```

Create `ts/http/app.ts`:

```ts
import { Hono } from "hono";
import { healthRoutes } from "./routes/health";

export function createApp() {
  return new Hono<{ Bindings: Env }>()
    .basePath("/api")
    .route("/", healthRoutes)
    .notFound((c) => c.json({ error: "not_found" }, 404));
}
```

Replace the `fetch` body in `ts/main.ts` with `createApp().fetch(request, env, ctx)` while retaining the existing scheduled handler, now importing `runTimeslotSync` from `ts/sync/run.ts`.

- [ ] **Step 5: Add a regression test for scheduled source order**

Create `test/worker/sync.test.ts` around an exported orchestration helper:

```ts
import { describe, expect, it, vi } from "vitest";
import { syncConfiguredSources } from "../../ts/sync/run";

describe("syncConfiguredSources", () => {
  it("runs both sources independently and preserves their order", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ source: "usthing", status: "success", slots: [], warnings: [] })
      .mockResolvedValueOnce({ source: "jiushi", status: "success", slots: [], warnings: [] });

    const results = await syncConfiguredSources(run as never);

    expect(run.mock.calls.map(([source]) => source)).toEqual(["usthing", "jiushi"]);
    expect(results.map((result) => result.source)).toEqual(["usthing", "jiushi"]);
  });
});
```

Implement:

```ts
export async function syncConfiguredSources(
  run: (source: DataSourceKey) => Promise<TimeslotSyncResult>,
): Promise<TimeslotSyncResult[]> {
  const results: TimeslotSyncResult[] = [];
  for (const source of ["usthing", "jiushi"] as const) {
    try {
      results.push(await run(source));
    } catch (error) {
      results.push({
        source,
        status: "failed",
        slots: [],
        warnings: [error instanceof Error ? error.message : String(error)],
        startDate: getTodayUTC8(),
        endDate: getDateDaysAhead(14),
        generatedAt: new Date(),
      });
    }
  }
  return results;
}
```

- [ ] **Step 6: Run Worker tests and type checking**

```bash
npm run test:worker -- test/worker/health.test.ts test/worker/sync.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the Worker shell**

```bash
git add ts/main.ts ts/sync ts/http test/worker/health.test.ts test/worker/sync.test.ts
git commit -m "refactor: separate sync from Worker HTTP routes"
```

### Task 3: Create APP_DB Migrations and Access Repositories

**Files:**
- Create: `d1/migrations/0001_better_auth.sql` using Better Auth CLI output
- Create: `d1/migrations/0002_access.sql`
- Create: `ts/app-db/access-repository.ts`
- Create: `ts/app-db/types.ts`
- Test: `test/worker/access-repository.test.ts`

- [ ] **Step 1: Generate and review Better Auth core SQL**

Create `ts/auth/cli-config.ts` that imports `env` from `cloudflare:workers`, configures Better Auth with `env.APP_DB`, Google credentials, and 30-day sessions. Run:

```bash
npx @better-auth/cli generate --config ts/auth/cli-config.ts --output d1/migrations/0001_better_auth.sql
```

Expected: SQL creates Better Auth `user`, `session`, `account`, and `verification` tables and indexes. Review the generated SQL; reject any migration that enables email/password login or stores plaintext secrets.

- [ ] **Step 2: Write the access-repository integration test first**

Create `test/worker/access-repository.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { AccessRepository } from "../../ts/app-db/access-repository";

describe("AccessRepository", () => {
  beforeEach(async () => {
    await env.APP_DB.prepare("DELETE FROM user_access").run();
  });

  it("creates normal users as pending with the default rule limit", async () => {
    const repo = new AccessRepository(env.APP_DB);
    const access = await repo.ensureForLogin({
      userId: "user-1",
      email: "friend@example.com",
      adminEmails: new Set(["admin@example.com"]),
      defaultRuleLimit: 2,
      adminRuleLimit: 20,
      now: "2026-06-09T00:00:00.000Z",
    });

    expect(access).toMatchObject({ role: "user", status: "pending", ruleLimit: 2 });
  });

  it("promotes secret-listed emails to active administrators", async () => {
    const repo = new AccessRepository(env.APP_DB);
    const access = await repo.ensureForLogin({
      userId: "admin-1",
      email: "ADMIN@example.com",
      adminEmails: new Set(["admin@example.com"]),
      defaultRuleLimit: 2,
      adminRuleLimit: 20,
      now: "2026-06-09T00:00:00.000Z",
    });

    expect(access).toMatchObject({ role: "admin", status: "active", ruleLimit: 20 });
  });
});
```

- [ ] **Step 3: Run the test and verify the table is absent**

```bash
npm run test:worker -- test/worker/access-repository.test.ts
```

Expected: FAIL with `no such table: user_access`.

- [ ] **Step 4: Add access migration**

Create `d1/migrations/0002_access.sql`:

```sql
CREATE TABLE user_access (
  user_id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
  rule_limit INTEGER NOT NULL DEFAULT 2 CHECK (rule_limit >= 0 AND rule_limit <= 1000),
  first_login_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  status_changed_at TEXT NOT NULL,
  status_changed_by TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_user_access_status_last_login
  ON user_access(status, last_login_at DESC);

CREATE INDEX idx_user_access_role_status
  ON user_access(role, status);
```

- [ ] **Step 5: Implement typed access repository**

Create `ts/app-db/types.ts`:

```ts
export type UserRole = "user" | "admin";
export type UserStatus = "pending" | "active" | "disabled";

export interface UserAccess {
  userId: string;
  role: UserRole;
  status: UserStatus;
  ruleLimit: number;
  firstLoginAt: string;
  lastLoginAt: string;
  statusChangedAt: string;
  statusChangedBy?: string;
}
```

Implement `AccessRepository.ensureForLogin()` with a transaction-safe `INSERT ... ON CONFLICT DO UPDATE` that updates login time and forces secret-listed emails to `admin/active` without reducing an existing administrator rule limit. Add `getByUserId()` and `disableUserAndDeleteSessions()`; the latter batches the access update and `DELETE FROM session WHERE userId = ?`.

- [ ] **Step 6: Re-run integration tests**

```bash
npm run test:worker -- test/worker/access-repository.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit migrations and repository**

```bash
git add d1/migrations ts/app-db ts/auth/cli-config.ts test/worker/access-repository.test.ts
git commit -m "feat: add application access database"
```

### Task 4: Configure Better Auth and Access Middleware

**Files:**
- Create: `ts/auth/config.ts`
- Create: `ts/auth/admin-emails.ts`
- Create: `ts/http/middleware/session.ts`
- Create: `ts/http/middleware/access.ts`
- Create: `ts/http/middleware/same-origin.ts`
- Create: `ts/http/routes/me.ts`
- Modify: `ts/http/app.ts`
- Test: `test/worker/access-middleware.test.ts`

- [ ] **Step 1: Write middleware behavior tests with an injected session resolver**

Create `test/worker/access-middleware.test.ts` covering these exact outcomes:

```ts
it.each([
  [undefined, 401, "unauthenticated"],
  ["pending", 403, "pending_approval"],
  ["disabled", 403, "account_disabled"],
])("rejects %s access", async (status, expectedStatus, code) => {
  const app = createAccessTestApp(status as never);
  const response = await app.request("/protected");
  expect(response.status).toBe(expectedStatus);
  await expect(response.json()).resolves.toMatchObject({ error: code });
});

it("allows active users", async () => {
  const response = await createAccessTestApp("active").request("/protected");
  expect(response.status).toBe(200);
});

it("rejects cross-origin business mutations", async () => {
  const response = await createAccessTestApp("active").request("/protected", {
    method: "POST",
    headers: {
      Origin: "https://attacker.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  expect(response.status).toBe(403);
});
```

The helper constructs Hono with fake `getSession` and `AccessRepository` implementations; do not call Google in tests.

- [ ] **Step 2: Run the test and verify middleware modules are missing**

```bash
npm run test:worker -- test/worker/access-middleware.test.ts
```

Expected: FAIL on unresolved imports.

- [ ] **Step 3: Implement Better Auth configuration**

Create `ts/auth/config.ts`:

```ts
import { betterAuth } from "better-auth";

export function createAuth(env: Env) {
  return betterAuth({
    appName: "CourtSync",
    baseURL: env.APP_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.APP_DB,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
    },
    advanced: {
      useSecureCookies: env.APP_BASE_URL.startsWith("https://"),
      cookiePrefix: "courtsync",
    },
  });
}

export type CourtSyncAuth = ReturnType<typeof createAuth>;
```

Create `parseAdminEmails(raw)` that trims, lowercases, filters invalid empty entries, and returns `Set<string>`.

- [ ] **Step 4: Implement session and access middleware**

Define Hono variables:

```ts
export interface AuthVariables {
  session: Awaited<ReturnType<CourtSyncAuth["api"]["getSession"]>>;
  access: UserAccess;
}
```

Implement:

- `sessionMiddleware`: calls `createAuth(c.env).api.getSession({ headers: c.req.raw.headers })`; returns 401 if absent; calls `ensureForLogin` to create/update access.
- `activeUserMiddleware`: returns 403 for pending or disabled.
- `adminMiddleware`: requires active access with role `admin`.

Do not cache access state in a cookie or module global.

Implement `sameOriginJsonMiddleware` for business mutations:

```ts
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const sameOriginJsonMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    if (!MUTATING_METHODS.has(c.req.method)) return next();
    const expectedOrigin = new URL(c.env.APP_BASE_URL).origin;
    if (c.req.header("Origin") !== expectedOrigin) {
      return c.json({ error: "cross_origin_request" }, 403);
    }
    if (!(c.req.header("Content-Type") ?? "").toLowerCase().startsWith("application/json")) {
      return c.json({ error: "json_required" }, 415);
    }
    return next();
  },
);
```

Apply this middleware to business route groups, not Better Auth's `/api/auth/*` handler, because the authentication library owns its callback and form content types.

- [ ] **Step 5: Register auth and current-user routes**

In `ts/http/app.ts`:

```ts
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
```

Add `GET /api/me` behind session middleware returning:

```ts
{
  user: { id, email, name, image },
  access: { role, status, ruleLimit }
}
```

No OAuth access token or provider account data may appear in this response.

- [ ] **Step 6: Re-run tests and type checking**

```bash
npm run test:worker -- test/worker/access-middleware.test.ts test/worker/access-repository.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Configure secrets locally and in staging**

Create `.dev.vars` locally with test/development values; it is already ignored. Configure deployed secrets interactively:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put ADMIN_EMAILS
```

Expected: Wrangler confirms each secret without printing its value.

- [ ] **Step 8: Commit authentication**

```bash
git add ts/auth ts/http test/worker/access-middleware.test.ts
git commit -m "feat: add Google authentication and access gates"
```

### Task 5: Build the React Shell, Public Dashboard, and Pending Account State

**Files:**
- Create: `index.html`
- Create: `src/web/main.tsx`
- Create: `src/web/styles.css`
- Create: `src/web/app/router.tsx`
- Create: `src/web/app/providers.tsx`
- Create: `src/web/lib/api.ts`
- Create: `src/web/lib/auth-client.ts`
- Create: `src/web/features/dashboard/DashboardPage.tsx`
- Create: `src/web/features/account/AccountPage.tsx`
- Create: `src/web/features/auth/LoginPage.tsx`
- Create: `src/web/features/auth/RequireAccess.tsx`
- Create: `ts/http/routes/slots.ts`
- Modify: `ts/http/app.ts`
- Test: `test/web/access-routing.test.tsx`
- Test: `test/worker/slots-route.test.ts`

- [ ] **Step 1: Write the internal slots-route test**

Create `test/worker/slots-route.test.ts` with a seeded source snapshot and assert:

```ts
const response = await exports.default.fetch(
  "http://example.com/api/slots?source=usthing",
);
expect(response.status).toBe(200);
await expect(response.json()).resolves.toMatchObject({
  source: "usthing",
  sourceName: "香港科技大学",
  availableSources: [
    { key: "usthing", name: "香港科技大学" },
    { key: "jiushi", name: "上海万体汇羽毛球馆" },
  ],
});
```

- [ ] **Step 2: Run the route test and confirm it fails**

```bash
npm run test:worker -- test/worker/slots-route.test.ts
```

Expected: 404.

- [ ] **Step 3: Add the same-origin slots route**

Extract the current D1-first dashboard loading logic from `ts/main.ts` into `ts/http/routes/slots.ts`. Return JSON only; remove server-rendered HTML from the active request path. Preserve `refresh=1` for administrator diagnostics only by rejecting it unless an administrator session is present.

The response contract is:

```ts
interface SlotsResponse {
  source: DataSourceKey;
  sourceName: string;
  count: number;
  startDate: string;
  endDate: string;
  lastUpdatedAt: string;
  warnings: string[];
  slots: UnifiedTimeSlot[];
  availableSources: Array<{ key: DataSourceKey; name: string }>;
}
```

- [ ] **Step 4: Initialize shadcn/ui and base components**

Run:

```bash
npx shadcn@latest init
npx shadcn@latest add button badge card tabs alert dropdown-menu avatar separator tooltip
```

Choose Vite, TypeScript, CSS variables, and `src/web/components/ui` as the component path. Verify `components.json` aliases resolve through `@web/*`.

- [ ] **Step 5: Write the React access-routing test**

Create `test/web/access-routing.test.tsx` using a memory router and mocked `/api/me` responses. Assert:

```ts
it("shows public dashboard navigation to pending users but hides protected features", async () => {
  renderApp({ status: "pending", role: "user" });
  expect(await screen.findByText("场地空闲")).toBeVisible();
  expect(screen.queryByText("通知规则")).not.toBeInTheDocument();
  expect(screen.queryByText("推送设置")).not.toBeInTheDocument();
  expect(screen.getByText("等待管理员审批")).toBeVisible();
});
```

- [ ] **Step 6: Implement React providers and routes**

Create routes:

```tsx
createBrowserRouter([
  { path: "/", element: <DashboardPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/account", element: <AccountPage /> },
  {
    element: <RequireAccess status="active" />,
    children: [
      { path: "/rules", element: <ComingSoonPage title="通知规则" /> },
      { path: "/settings/notifications", element: <ComingSoonPage title="推送设置" /> },
    ],
  },
]);
```

`LoginPage` calls Better Auth's React client `signIn.social({ provider: "google", callbackURL: "/account" })`. `RequireAccess` always waits for `/api/me`; it does not trust local storage.

- [ ] **Step 7: Implement the public dashboard using current table behavior**

Port the useful behavior from `ts/views/table.ts` into React components:

- Source tabs with business names.
- Date pagination.
- Detailed/compact mode.
- Desktop table and mobile date sections.
- Activity tooltips.
- Dark mode.
- Snapshot export using the existing html2canvas behavior, loaded on demand.

Keep `ts/views/table.ts` until browser acceptance confirms parity; removal happens in Phase 4.

- [ ] **Step 8: Run Phase 1 verification**

```bash
npm run test
npm run typecheck
npm run build
env GOCACHE=/tmp/courtsync-go-cache go test ./...
```

Expected: PASS.

- [ ] **Step 9: Commit the React shell and dashboard**

```bash
git add index.html src ts/http test components.json
git commit -m "feat: add authenticated React application shell"
```

## Phase 1 Completion Check

Run local development:

```bash
npm run dev
```

Verify in the browser:

1. `/` loads the React dashboard.
2. Both business source names appear.
3. `/login` starts Google OAuth when credentials are configured.
4. A non-admin first login lands on pending account state.
5. An `ADMIN_EMAILS` login receives administrator access.
6. Disabling a seeded user removes its sessions and protected access.

Commit any acceptance-only fixes separately:

```bash
git add -A
git commit -m "test: complete phase one acceptance"
```
