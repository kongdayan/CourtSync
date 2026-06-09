# AGENTS.md

## Purpose
CourtSync is a multi-source badminton court availability tracker — Cloudflare Worker (TypeScript) + Go CLI. Currently supports USThing (HKUST) and Jiushi (久事体育), with multi-tenant architecture ready for expansion.

## Key Paths
- `ts/` Cloudflare Worker source (handlers, services, views, D1 helpers).
- `ts/main.ts` Worker entrypoint.
- `ts/sources/usthing.ts` USThing API client — v3/msapi + Azure AD auth with auto-refresh.
- `ts/sources/jiushi.ts` Jiushi API client — auto acw_tc WAF cookie + js_sign.
- `ts/service/` Slot aggregation and business logic.
- `ts/views/` HTML dashboard rendering.
- `ts/constants/` Facility ID → display name mappings.
- `d1/schema.sql` D1 schema for `slot_snapshot`.
- `wrangler.toml` Worker config, cron triggers, and bindings.
- `internal/usthing/usthing.go` Go USThing client — TokenManager with auto-refresh + 401 retry.
- `internal/jiushi/jiushi.go` Go Jiushi client — auto acw_tc acquisition.
- `internal/service/` Go slot aggregation.
- `cmd/main/main.go` Go CLI entrypoint.

## Common Commands
- Install deps: `npm install`
- Local dev: `npx wrangler dev --test-scheduled`
- Deploy: `npx wrangler deploy`
- Go CLI: `go run ./cmd/main/`

## Authentication

### USThing
Azure AD OAuth2 (tenant `c917f3e2-9322-4926-9bb3-daca730413ca`). Dynamic ROPC via `USTHING_USERNAME`/`USTHING_PASSWORD`, or static `USTHING_BEARER`. Token auto-refresh 5min before expiry, 401 triggers forced refresh + retry.

### Jiushi
Alibaba Cloud ESA WAF issues `acw_tc` cookie on first request. `acquireAcwTc()` sends a warmup POST, caches the cookie for 55min. All API calls signed with `js_sign = base64(md5(payload + salt))`. WAF blocks Cloudflare Worker IPs — use `JIUSHI_PROXY_URL` or run Jiushi sync locally.

## API Reference

| Provider | Endpoint | Method | Function (Go/TS) |
| --- | --- | --- | --- |
| USThing | `/v3/msapi/fbs/facilities` | GET | `GetFacilities` / `getFacilities` |
| USThing | `/v3/msapi/fbs/facilityTimeslot` | GET | `GetAvailableTimeSlots` / `getAvailableTimeSlots` |
| USThing | `/v3/msapi/fbs/bookingInfo` | GET | `GetBookingInfo` / `getBookingInfo` |
| USThing | `/v2/fbs/book` | POST | `Booking` / `booking` |
| Jiushi | `/jiushi-core/venue/getVenueGround` | POST | `QueryVenueData` / `queryVenueData` |

## Change Notes
- When adding facility IDs, update both Go and TS constants + service logic.
- Table layouts: keep compact/detailed modes and tooltips synchronized.
- Token/auth warnings must propagate from fetchers to UI.
- `errorCode: "03"` from USThing = system closed (night hours) — not fatal.
- Jiushi WAF blocks (`Denied by http_custom`) break early — don't retry all days.
- v1 endpoints (`/v1/fbs/*`) are dead (404). Do not reintroduce.
