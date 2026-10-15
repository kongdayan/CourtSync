> **Final standalone snapshot (2026-10-15).** Maintenance is paused. This repository preserves the independent implementation and its existing integrations. The deployment command is disabled to keep this historical snapshot from replacing the active service.

# AGENTS.md

## Purpose
CourtSync is a multi-source badminton court availability tracker — Cloudflare Worker (TypeScript) + Go CLI. Currently supports USThing (HKUST) and Jiushi (久事体育), with multi-tenant architecture ready for expansion.

## Key Paths
- `ts/` Cloudflare Worker source (handlers, services, views, D1 helpers).
- `ts/main.ts` Worker entrypoint.
- `ts/sources/usthing.ts` USThing API client — v3/msapi + Azure AD auth with auto-refresh.
- `ts/sources/jiushi.ts` Jiushi API client — auto acw_tc WAF cookie + js_sign.
- `ts/service/` Slot aggregation and business logic.
- `src/web/features/dashboard/` React seven-day availability planner.
- `ts/cache/` Public KV snapshots; `ts/http/routes/slots.ts` five-minute response cache.
- `ts/views/` Legacy HTML rendering helpers.
- `ts/constants/` Facility ID → display name mappings.
- `d1/schema.sql` D1 schema for `slot_snapshot`.
- `wrangler.jsonc` Worker config, cron triggers, and bindings (sole wrangler config; `wrangler.toml` was removed).
- `internal/usthing/usthing.go` Go USThing client — TokenManager with auto-refresh + 401 retry.
- `internal/jiushi/jiushi.go` Go Jiushi client — auto acw_tc acquisition.
- `internal/service/` Go slot aggregation.
- `cmd/main/main.go` Go CLI entrypoint.

## Common Commands
- Install deps: `npm install`
- Local dev: `npx wrangler dev --test-scheduled`
- Deployment is disabled for this final standalone snapshot. `npm run deploy` exits before building or uploading.
- Go CLI: `go run ./cmd/main/`

## Authentication

### USThing
Azure AD OAuth2 (tenant `c917f3e2-9322-4926-9bb3-daca730413ca`). Dynamic ROPC via `USTHING_USERNAME`/`USTHING_PASSWORD`, or static `USTHING_BEARER`. Token auto-refresh 5min before expiry, 401 triggers forced refresh + retry.

### Jiushi
Alibaba Cloud ESA WAF issues `acw_tc` cookie on first request. `acquireAcwTc()` sends a warmup POST, caches the cookie for 55min. All API calls signed with `js_sign = base64(md5(payload + salt))`. WAF blocks Cloudflare Worker IPs — use `JIUSHI_PROXY_URL` or run Jiushi sync locally.

Production uses the `JIUSHI_PROXY` Workers VPC service binding over the named
`courtsync-jiushi-aliyun` Cloudflare Tunnel. The Aliyun proxy listens on
`127.0.0.1:18765`; the `courtsync-cloudflared` container connects it to Cloudflare
and restarts automatically. The binding uses `http://jiushi-proxy.internal` as its
request URL; traffic between Cloudflare and Aliyun is encrypted by the tunnel.
Keep `JIUSHI_PROXY_TOKEN` synchronized with the server's bearer token. When this
binding is absent, the client falls back to `JIUSHI_PROXY_URL` or direct Jiushi
requests. The internal URL is only usable through the VPC binding, including
local Worker development with `remote: true`.

An Aliyun fallback timer, `courtsync-jiushi-sync.timer`, runs hourly from 08:00
through 22:00 Asia/Shanghai, at :05 (five minutes after the primary Cron). It calls `POST /api/internal/sync/jiushi` using the
independent `JIUSHI_SYNC_TRIGGER_SECRET`; the endpoint only updates Jiushi
snapshots. Its script lives at `/opt/courtsync-proxy/trigger-sync.py`, with the
root-only token file `/etc/cloudflared/courtsync-sync-trigger.token`. The tunnel
container is managed by `/opt/courtsync-proxy/compose.yml`. Check the service
journal for the sync result. The fallback skips upstream and D1 work if a healthy
Jiushi snapshot was published within the past ten minutes. Keep the original
Cloudflare hourly Cron configured as well.

## Public availability caching

- Successful source syncs publish a versioned snapshot to the `SLOTS_CACHE` KV binding.
- `GET /api/slots?source=jiushi&days=7` reads the public snapshot only; it never reads D1 or triggers upstream collection. Allowed ranges are 7 (default) or 14 days. The legacy default source remains `usthing`; the homepage defaults to Jiushi and remembers its source.
- A named Cache API cache stores responses for 300 seconds per Cloudflare location. KV shares source snapshots globally; it is eventually consistent. Cache keys include source, UTC+8 start date and range, and exclude cookies/tracking parameters.
- Browser responses use the remaining cache lifetime, `Age` and `ETag`/304. Errors are never cached. A cache miss cannot fall back to a D1 table scan.
- Failed collection preserves the last good snapshot and marks it stale. A missing snapshot returns 503. KV entries expire 48 hours after the latest publication attempt. Data older than two hours is marked stale.
- `lastSyncedAt` records source observation time, including unchanged successful collections. D1 `updated_at` still records only changed rows. Do not infer collection health from D1 row timestamps.
- The dashboard displays seven dates without pagination, polls every five minutes while visible, and only rechecks stale queries on focus/reconnect. Duration/filter changes run locally.
- Continue conditional UPSERTs and the rolling date window in D1; unchanged rows must not be rewritten. Compression reduces bytes, not D1 row billing.

## API Reference

| Provider | Endpoint | Method | Function (Go/TS) |
| --- | --- | --- | --- |
| USThing | `/v3/msapi/fbs/facilities` | GET | `GetFacilities` / `getFacilities` |
| USThing | `/v3/msapi/fbs/facilityTimeslot` | GET | `GetAvailableTimeSlots` / `getAvailableTimeSlots` |
| USThing | `/v3/msapi/fbs/bookingInfo` | GET | `GetBookingInfo` / `getBookingInfo` |
| USThing | `/v2/fbs/book` | POST | `Booking` / `booking` |
| Jiushi | `/jiushi-core/venue/getVenueGround` | POST | `QueryVenueData` / `queryVenueData` |

## Homepage requirements

- Preserve the promotion section and the original X `@Kook91513056` / GitHub `@kongdayan` links when redesigning the page.
- Login and reminder entry points are temporarily hidden on the homepage; keep the account and notification routes intact. The homepage does not need a session query.
- Support Chinese and English, day and night themes, and remember the user's choices. Localize visible text, weekdays, source/court names and accessibility labels.
- Duration filtering supports 1–6 continuous hours on the same court. Do not count availability from different courts as a continuous run.
- The download action saves the currently rendered schedule as PNG, with its filters, details, language, theme and attribution. Load image rendering only on demand; no server upload or database query.
- Mobile details are an opt-in floating panel with at least 32px plus safe-area clearance below; they must never shrink the seven-day board. Keep back-to-filters and back-to-overview controls visible while the body scrolls. Desktop details are collapsible. Keep labeled mobile filters compact.
- The time finder filters every opening in the next seven days by earliest start, latest finish, duration and selected weekdays. Require the full continuous run to fit inside the time window, honor the selected court, and preserve filters when returning from court details. Filtering is local and must not request upstream or D1.
- Keep `build.cssTarget` compatible with older WeChat WebView CSS; verify production media queries use supported min/max-width syntax and test WebKit mobile.
- Clearly distinguish hourly source collection from five-minute page snapshot checks.

## Change Notes
- Preserve this final standalone snapshot without further feature development or deployment.
- When adding facility IDs, update both Go and TS constants + service logic.
- Table layouts: keep numeric/court-label modes, tooltips, keyboard controls and selected-slot details synchronized.
- Token/auth warnings must propagate from fetchers to UI.
- `errorCode: "03"` from USThing = system closed (night hours) — not fatal.
- Jiushi WAF blocks (`Denied by http_custom`) break early — don't retry all days.
- v1 endpoints (`/v1/fbs/*`) are dead (404). Do not reintroduce.
