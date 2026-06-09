# AGENTS.md

## Purpose
This repo bundles a Cloudflare Worker (TypeScript) and a Go CLI for scanning HKUST badminton court availability, persisting snapshots, and rendering a dashboard.

## Key Paths
- `ts/` Cloudflare Worker source (handlers, services, views, D1 helpers).
- `ts/main.ts` Worker entrypoint.
- `ts/sources/usthing.ts` USThing API client — v3/msapi endpoints + Azure AD auth.
- `ts/service/` Slot aggregation and business logic.
- `ts/views/` HTML rendering for the dashboard.
- `ts/constants/` Facility and display mappings.
- `d1/schema.sql` D1 schema for `slot_snapshot`.
- `wrangler.toml` Worker config, cron triggers, and bindings.
- `internal/usthing/usthing.go` Go API client — TokenManager for auto-refreshing Azure AD tokens.
- `internal/service/` Go slot aggregation.
- `cmd/main/main.go` Go CLI entrypoint.

## Common Commands
- Install deps: `npm install`
- Local dev (with cron simulation): `npx wrangler dev --test-scheduled`
- Deploy: `npx wrangler deploy`
- Go CLI: `go run ./cmd/main/`
- Go build: `go build -o fbs-scanner ./cmd/main/`

## Authentication

USThing app v7.20.0 migrated to **Azure AD OAuth2** (tenant `c917f3e2-9322-4926-9bb3-daca730413ca`). Both Go and TS code support two modes:

1. **Dynamic (recommended)**: Set `USTHING_USERNAME` + `USTHING_PASSWORD`. The `TokenManager` (Go) or `acquireToken()` (TS) handles ROPC grant + auto-refresh.
2. **Static (legacy)**: Set `USTHING_BEARER` with a pre-obtained JWT. Tokens expire ~1h.

Priority: `USTHING_BEARER` > Azure AD credentials > KV `usthing:bearer` (Worker only).

## USThing API Reference (v3)

| Endpoint | Method | Go function | TS function |
| --- | --- | --- | --- |
| `/v3/msapi/fbs/facilities` | GET | `GetFacilities()` | `getFacilities()` |
| `/v3/msapi/fbs/facilityTimeslot` | GET | `GetAvailableTimeSlots()` | `getAvailableTimeSlots()` |
| `/v3/msapi/fbs/bookingInfo` | GET | `GetBookingInfo()` | `getBookingInfo()` |
| `/v2/fbs/book` | POST | `Booking()` | `booking()` |

Old v1 endpoints (`/v1/fbs/...`) are **deprecated and return 404**. The v2 booking endpoint is still active.

System returns `errorCode: "03"` / `"The system is closed!"` during night hours (~22:00–08:00 HKT).

## Environment and Data
- USThing and Jiushi are both supported. The dashboard can switch via `?source=usthing` or `?source=jiushi`.
- D1 bindings: `DB` (USThing) and `JIUSHI_DB` (Jiushi).
- **New**: `USTHING_USERNAME` and `USTHING_PASSWORD` for dynamic Azure AD auth. Password should use `wrangler secret put` in production.
- See `README.md` for full env variable list and deployment steps.

## Change Notes for Agents
- When adding or removing facility IDs, update both Go and TypeScript maps and service logic (`internal/`, `ts/constants/`, `ts/service/`).
- Keep table layouts consistent between compact/detailed modes and desktop/mobile rendering.
- Preserve token warning propagation from fetchers to UI so operators see auth issues quickly.
- The `TokenManager` in Go is thread-safe and caches tokens with a 5-minute expiry buffer. The TS `acquireToken()` uses an in-memory cache with the same buffer.
- When the API returns `errorCode: "03"` (system closed), both clients surface it as an error — callers should handle it gracefully (e.g., skip the sync cycle, don't alert).
