# CourtSync

Multi-source badminton court availability tracker with web dashboard, push notifications, and optional auto-booking. Supports USThing (HKUST) and Jiushi (久事体育) providers, with a multi-tenant architecture ready for expansion — currently in personal use.

- **Live dashboard**: Cloudflare Worker fetches slot data, stores 14-day snapshots in D1, and renders an HTML table or JSON feed.
- **Source switcher**: Toggle between `?source=usthing` and `?source=jiushi` to compare courts across venues.
- **One-click screenshots**: Export the full court grid into a PNG via html2canvas.
- **Cron refresh**: Cloudflare Scheduler triggers every minute during venue operating hours (08:00–22:59 HKT).
- **PushDeer notifications**: Optional push alerts when courts become available.
- **Go CLI**: Local runner for ad-hoc scans or environments where Cloudflare Workers are blocked by venue WAFs.

Live: <https://sport.badminton.hunao.online/> · GitHub: <https://github.com/kongdayan/CourtSync>

## Directory Map

- `ts/` — Cloudflare Worker (handlers, API clients, views, D1 helpers).
- `d1/schema.sql` — D1 `slot_snapshot` table definition.
- `wrangler.toml` — Worker config, cron triggers, and bindings.
- `internal/`, `cmd/` — Go CLI scanner and API clients.

## Quick Start

```bash
git clone https://github.com/kongdayan/CourtSync.git
cd CourtSync
npm install

# Local dev with cron simulation
npx wrangler dev --test-scheduled
```

## Authentication

### USThing (HKUST)

As of app v7.20.0, uses **Azure AD OAuth2**. Two modes:

**Mode 1: Dynamic (recommended)** — auto-refreshes tokens via ROPC grant.

```bash
export USTHING_USERNAME="yourname@connect.ust.hk"
export USTHING_PASSWORD="your-password"
```

**Mode 2: Static (legacy)** — pre-obtained JWT, expires ~1h.

```bash
export USTHING_BEARER="Bearer eyJ..."
```

Priority: `USTHING_BEARER` > Azure AD credentials > KV `usthing:bearer` (Worker only).

### Jiushi (久事体育)

Fully automated: the client acquires Alibaba Cloud ESA WAF cookies (`acw_tc`) via a warmup request, then signs each API call with `js_sign`. No manual token management needed.

**Note for Cloudflare Workers**: Jiushi's WAF blocks Cloudflare IP ranges. For Worker deployment, either:
- Set `JIUSHI_PROXY_URL` to route through a non-Cloudflare proxy, or
- Run Jiushi sync from the Go CLI on a residential IP.

## Environment Variables

| Variable | Description |
| --- | --- |
| `USTHING_USERNAME` | HKUST email for Azure AD dynamic auth. |
| `USTHING_PASSWORD` | HKUST password. Use `wrangler secret put` in production. |
| `USTHING_BEARER` | Static JWT (legacy mode). Overrides dynamic auth if set. |
| `USTHING_UST_ID` | User ID (auto-resolved from token if empty). |
| `USTHING_USER_TYPE` | Default `01`. |
| `USTHING_FACILITY_IDS` | Comma-separated facility IDs (default: badminton courts). |
| `PUSHDEER_KEYS` | Comma-separated PushDeer keys for notifications. |
| `TOKEN_ADMIN_SECRET` | Passphrase for `/admin/token` updates. |
| `JIUSHI_VENUE_ID` | Jiushi venue ID (e.g. `27`). |
| `JIUSHI_GROUND_IDS` | Comma-separated ground IDs to filter. |
| `JIUSHI_MAX_DAYS` | Max days to fetch (default 9). |
| `JIUSHI_PROXY_URL` | Proxy for bypassing Jiushi WAF from Cloudflare Workers. |

## API Endpoints

### USThing (v3/msapi)

| Endpoint | Method | Description |
| --- | --- | --- |
| `/v3/msapi/fbs/facilities` | GET | List all facilities (63+ with names/locations). |
| `/v3/msapi/fbs/facilityTimeslot` | GET | Query timeslots. Params: `ustID`, `userType`, `facilityID`, `startDate`, `endDate`. |
| `/v3/msapi/fbs/bookingInfo` | GET | List current bookings. |
| `/v2/fbs/book` | POST | Create/cancel booking. Params: `cancelInd` (`N`=book, `Y`=cancel). |

System returns `errorCode: "03"` when closed (night hours ~22:00–08:00 HKT).

### Jiushi (WeChat Mini Program API)

| Endpoint | Method | Description |
| --- | --- | --- |
| `/jiushi-core/venue/getVenueGround` | POST | Query venue courts. Body: `venueId`, `bookTime` (ms). |

Requires `acw_tc` WAF cookie + `js_sign` header. Both handled automatically.

## Deployment

```bash
npx wrangler deploy
```

Or via GitHub Actions — see `.github/workflows/release.yml`.

## Go CLI

```bash
export USTHING_USERNAME="yourname@connect.ust.hk"
export USTHING_PASSWORD="your-password"
go run ./cmd/main/
```

## License

MIT © Wenyan Kong
