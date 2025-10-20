# Project Overview

This repository currently bundles the original Go-based gym slot scanner together with the TypeScript Worker adaptation used for Cloudflare deployment. The TypeScript implementation lives in `ts/` and is responsible for fetching slot data, rendering an HTML dashboard, and (when enabled) pushing notifications through PushDeer. The Go code under `internal/` mirrors similar functionality for local execution or legacy tooling.

## Directory Responsibilities

| Path | Purpose |
| ---- | ------- |
| `cmd/` | Go entrypoints for the legacy CLI scanner. |
| `internal/` | Go packages (`usthing`, `jiushi`, `service`, `pushdeer`) used by the CLI tool. |
| `ts/` | Cloudflare Worker implementation written in TypeScript. |
| &nbsp;&nbsp;`ts/constants/` | Shared mappings (facility IDs → display names). |
| &nbsp;&nbsp;`ts/sources/` | Upstream API clients (USThing, Alumni, Jiushi). |
| &nbsp;&nbsp;`ts/service/` | Business logic for converting and aggregating slot data. |
| &nbsp;&nbsp;`ts/notifications/` | PushDeer integration for outbound notifications. |
| &nbsp;&nbsp;`ts/views/` | Server-side rendering for the HTML dashboard (`table.ts`). |
| `templates/` | Legacy HTML templates used by the old CLI. |
| `wrangler.toml` | Worker configuration targeting `ts/main.ts`. |

## Current Worker Behaviour

* Fetches all configured facilities (`2,3,4,5,79,80,100,101`) from the USThing API and aggregates results into a unified slot model.
* Persists the latest 14-day window (≈1560 rows) into Cloudflare D1 (`slot_snapshot` table), trimming anything outside the horizon each minute.
* Reads back from D1 when serving HTTP responses so the dashboard/API always reflect the stored snapshot (even if the live fetch fails).
* Renders a dashboard with dark/compact toggles, JWT warnings, facility status grids, and responsive/mobile layouts.
* Emits warnings to the UI and JSON response whenever the Bearer token is missing/expired (401 or JWT errors).
* PushDeer integration is present but disabled unless the worker is supplied with PushDeer keys.

### D1 storage

* Table definition (`d1/schema.sql`):

  ```sql
  CREATE TABLE IF NOT EXISTS slot_snapshot (
    facility_id   TEXT    NOT NULL,
    slot_date     TEXT    NOT NULL,
    start_time    TEXT    NOT NULL,
    end_time      TEXT    NOT NULL,
    status        TEXT    NOT NULL,
    activity_name TEXT,
    updated_at    TEXT    NOT NULL,
    PRIMARY KEY (facility_id, slot_date, start_time)
  );

  CREATE INDEX IF NOT EXISTS idx_slot_snapshot_date
    ON slot_snapshot (slot_date);
  ```

* Configure Wrangler with the D1 binding:

  ```toml
  [[d1_databases]]
  binding = "DB"
  database_name = "slot-data"
  database_id = "<replace-with-your-d1-id>"
  ```

* Persist/load helpers live in `ts/db/slots.ts`.
* When the Worker starts, it fetches fresh data, runs `persistSlots`, and then renders from the D1 snapshot. If persistence or reload fails, a warning is appended so operators know the snapshot may be stale.

## Planned Multi-Worker Split (Future Work)

The single Worker currently handles scanning, rendering, (optional) pushes, and config. To scale cleanly, migrate to four services sharing common modules:

1. **Scanner Worker** (`slot-scanner`)  
   * Trigger: Cron (`*/1 8-21 * * *`).  
   * Writes slot snapshots to D1.  
   * Optionally enqueues pushes.

2. **Web Worker** (`slot-web`)  
   * Trigger: HTTP routes.  
   * Reads the latest snapshot from D1 and serves HTML/JSON.

3. **Push Worker** (`slot-push`)  
   * Trigger: Queue/Durable Object (or cron after scanner).  
   * Reads user prefs from D1/KV, sends PushDeer notifications.

4. **Config Worker** (`slot-config`)  
   * Trigger: Authenticated HTTP API.  
   * Allows users/admins to update preferences (facilities, frequency, PushDeer keys) stored in D1/KV.

### Shared Assets for New Workers

* Extract shared TypeScript utilities (types, facility maps, API clients) into a reusable package (e.g. `/packages/shared`).
* Maintain a common D1 schema (slots table, user_config table, push log) and KV namespace (PushDeer secrets).
* Set up Wrangler configs per worker (`services/scanner/wrangler.toml`, etc.) with appropriate bindings.

## AI Agent Notes

* Prefer reusing existing functions from `ts/service/updateTimeSlots.ts`, `ts/views/table.ts`, and `ts/constants/facilities.ts`.
* When editing table layout or styling, keep compact/detailed modes and tooltips synchronized across desktop and mobile sections.
* Any new facility IDs must be added consistently in `internal/service/updateTimeSLots.go`, `internal/pushdeer/pushdeer.go`, `ts/constants/facilities.ts`, `ts/service/updateTimeSlots.ts`, and `ts/main.ts`.
* Token-related warnings should continue to propagate from data-fetching layers to rendering layers so operators are alerted immediately.
* For build/deploy tasks, remember the rate limits seen in Wrangler logs and throttle repeated `wrangler deploy` attempts.

This document should be kept up-to-date as services are split, schemas evolve, or additional integrations (KV/D1 bindings, queues) are added.
