# Rule Notifications Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver authenticated rule-based court notifications in four independently testable phases without rewriting the existing USThing and Jiushi clients.

**Architecture:** A React SPA and private Hono API run in the existing Cloudflare Worker. Better Auth and application state use a new `APP_DB`; existing source snapshots remain in `DB` and `JIUSHI_DB`; scheduled matching creates D1 outbox rows and Cloudflare Queue messages for asynchronous notification delivery.

**Tech Stack:** Cloudflare Workers, D1, Queues, Vite, React, Tailwind CSS, shadcn/ui, Hono, Better Auth, Zod, Vitest 4.1+, Cloudflare Workers Vitest integration, Testing Library, Playwright, Go 1.22.

---

## Phase Order

1. [Phase 1: Frontend Foundation and Authentication](./2026-06-09-rule-notifications-phase-1-foundation-auth.md)
2. [Phase 2: Rules, Notification Channels, and Administration](./2026-06-09-rule-notifications-phase-2-rules-admin.md)
3. [Phase 3: Matching, Outbox, and Queue Delivery](./2026-06-09-rule-notifications-phase-3-matching-delivery.md)
4. [Phase 4: Production Migration, Verification, and Rollout](./2026-06-09-rule-notifications-phase-4-rollout.md)

Each phase must finish with all existing Go tests passing and a clean TypeScript build. Do not start a later phase while an earlier phase has failing acceptance tests.

## Locked File Structure

```text
src/web/                         React SPA
  app/                           router, providers, route guards
  components/ui/                 shadcn/ui generated primitives
  features/dashboard/            public availability UI
  features/rules/                rule list/editor
  features/channels/             PushDeer settings
  features/admin/                administrator user management
  lib/                           API client, auth client, shared UI helpers

ts/main.ts                       Worker fetch/scheduled/queue composition only
ts/http/app.ts                   Hono app and private API registration
ts/http/middleware/              session, access, admin, same-origin middleware
ts/auth/                         Better Auth config and access provisioning
ts/app-db/                       APP_DB migrations and repositories
ts/rules/                        rule schema, catalog, service, routes
ts/notifications/                channels, crypto, providers, outbox, queue
ts/matching/                     pure matcher and reconciliation
ts/sync/                         extracted existing source synchronization
ts/sources/                      existing provider clients, retained
ts/db/                           existing source snapshot repository, retained

d1/migrations/                   ordered APP_DB SQL migrations
test/worker/                     Worker-runtime unit and D1 integration tests
test/web/                        jsdom React tests
e2e/                             Playwright browser tests
scripts/                         benchmark and operational verification scripts
```

## Cross-Phase Invariants

- Business source keys remain `usthing` and `jiushi`; UI labels are 香港科技大学 and 上海万体汇羽毛球馆.
- No supported external API is introduced. `/api/*` remains same-origin and session-oriented.
- Secrets never appear in source, Wrangler configuration, logs, fixtures, screenshots, or test snapshots.
- Manual browser refresh never emits user notifications.
- Source synchronization failure never resets match state.
- Notification counts increment only after provider success.
- Disabled rules consume `rule_limit`; deleted rules do not.
- All date and weekday calculations use `Asia/Shanghai`.

## Required Final Verification

```bash
npm ci
npm run cf-typegen
npm run typecheck
npm run test
npm run test:worker
npm run test:web
npm run test:e2e
npm run benchmark:matching
npm run build
env GOCACHE=/tmp/courtsync-go-cache go test ./...
env GOCACHE=/tmp/courtsync-go-cache go vet ./...
git diff --check
```

Expected: every command exits 0, the benchmark reports the thresholds from Phase 4, and `git status --short` contains only intentional implementation changes.
