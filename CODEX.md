# CourtSync — Project Overview

Multi-source badminton court availability tracker with Cloudflare Worker + Go CLI. Supports USThing (HKUST) and Jiushi (久事体育). Multi-tenant architecture ready for expansion; currently in personal use.

## Directory Responsibilities

| Path | Purpose |
| ---- | ------- |
| `cmd/` | Go CLI entrypoint. |
| `internal/usthing/` | Go USThing API client — v3/msapi, Azure AD TokenManager with auto-refresh + 401 retry. |
| `internal/jiushi/` | Go Jiushi API client — auto acw_tc WAF cookie + js_sign. |
| `internal/service/` | Go slot aggregation and unified data model. |
| `internal/pushdeer/` | PushDeer notification integration. |
| `ts/` | Cloudflare Worker (TypeScript). |
| `ts/sources/` | Upstream API clients (USThing, Jiushi). |
| `ts/service/` | Slot aggregation and conversion. |
| `ts/notifications/` | PushDeer integration. |
| `ts/views/` | HTML dashboard (`table.ts`). |
| `templates/` | Legacy HTML templates. |
| `wrangler.toml` | Worker config. |

## API Architecture

### USThing (v3/msapi — migrated from v1/v2 in app v7.20.0)

| Aspect | Old | New |
| --- | --- | --- |
| Auth | Hardcoded JWT | Azure AD OAuth2 ROPC, auto-refresh |
| Base path | `/v1/fbs/`, `/v2/fbs/` | `/v3/msapi/fbs/` (v2 `/book` retained) |
| Timeslot | `/v1/fbs/facilityTimeslot` | `/v3/msapi/fbs/facilityTimeslot` |
| Facilities | N/A | `/v3/msapi/fbs/facilities` (63 facilities) |
| Bookings | N/A | `/v3/msapi/fbs/bookingInfo` |

Azure AD tenant: `c917f3e2-9322-4926-9bb3-daca730413ca` (HKUST). Token endpoint: `login.microsoftonline.com/{tenant}/oauth2/v2.0/token`.

### Jiushi

| Component | Detail |
| --- | --- |
| Endpoint | `POST jsapp.jussyun.com/jiushi-core/venue/getVenueGround` |
| WAF | Alibaba Cloud ESA. `acw_tc` cookie acquired via warmup request (3600s TTL). |
| Signing | `js_sign = base64(md5(JSON(payload) + salt))` |
| WAF bypass | Cloudflare Worker IPs blocked at edge. Use `JIUSHI_PROXY_URL` or Go CLI locally. |

## Worker Behaviour

- Fetches configured facilities from USThing + Jiushi, aggregates into unified slot model.
- Auth: Azure AD ROPC (USThing), auto acw_tc (Jiushi). Both support 401/403 retry with token refresh.
- Persists 14-day window into D1 (`slot_snapshot`), trims stale rows each cycle.
- Serves dashboard from D1 snapshot (resilient to live fetch failures).
- Handles `errorCode: "03"` (system closed) and WAF blocks gracefully.
- PushDeer notifications when slots become available.

## D1 Schema

```sql
CREATE TABLE IF NOT EXISTS slot_snapshot (
  facility_id   TEXT NOT NULL,
  slot_date     TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  status        TEXT NOT NULL,
  activity_name TEXT,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (facility_id, slot_date, start_time)
);
```

## AI Agent Notes

- Reuse existing functions from `ts/sources/`, `ts/service/`, `ts/views/`, `ts/constants/`.
- Go `TokenManager` is the single auth source — all API calls go through `doWithAuthRetry()`.
- When editing table layouts, keep compact/detailed modes and tooltips synchronized.
- Facility IDs must be updated consistently across Go + TS.
- v1 endpoints (`/v1/fbs/*`) are dead (404). Do not reintroduce.
- `errorCode: "03"` (system closed) is expected at night — not fatal.
- Jiushi WAF blocks from Cloudflare IPs — use `JIUSHI_PROXY_URL` or local runner.

This document should be kept current as providers are added, schemas evolve, or bindings change.
