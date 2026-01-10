# AGENTS.md

## Purpose
This repo bundles a Cloudflare Worker (TypeScript) and a legacy Go CLI for scanning HKUST badminton court availability, persisting snapshots, and rendering a dashboard.

## Key Paths
- `ts/` Cloudflare Worker source (handlers, services, views, D1 helpers).
- `ts/main.ts` Worker entrypoint.
- `ts/service/` Slot aggregation and business logic.
- `ts/views/` HTML rendering for the dashboard.
- `ts/constants/` Facility and display mappings.
- `d1/schema.sql` D1 schema for `slot_snapshot`.
- `wrangler.toml` Worker config, cron triggers, and bindings.
- `internal/` and `cmd/` Legacy Go scanner.

## Common Commands
- Install deps: `npm install`
- Local dev (with cron simulation): `npx wrangler dev --test-scheduled`
- Deploy: `npx wrangler deploy`
- Legacy CLI: `go run ./cmd/fbs-scan`

## Environment and Data
- USThing and Jiushi are both supported. The dashboard can switch via `?source=usthing` or `?source=jiushi`.
- D1 bindings: `DB` (USThing) and `JIUSHI_DB` (Jiushi).
- Runtime secrets: bearer token from KV key `usthing:bearer` in `hkust_token`, or `USTHING_BEARER` for local dev.
- See `README.md` for full env variable list and deployment steps.

## Change Notes for Agents
- When adding or removing facility IDs, update both Go and TypeScript maps and service logic (`internal/`, `ts/constants/`, `ts/service/`).
- Keep table layouts consistent between compact/detailed modes and desktop/mobile rendering.
- Preserve token warning propagation from fetchers to UI so operators see auth issues quickly.
