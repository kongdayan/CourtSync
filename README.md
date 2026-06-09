# FBS HKUST Spider

Fetch, persist, and visualise badminton court availability from both USThing and Jiushi. This repository bundles the original Go-based CLI scanner together with the Cloudflare Worker that powers the web dashboard.

- **Live snapshot**: A Cloudflare Worker fetches slot data from each provider, stores the latest 14-day window in provider-specific D1 databases, and renders an HTML table or JSON feed.
- **Source switcher**: The dashboard supports `?source=usthing` or `?source=jiushi` (with a UI toggle) so you can compare feeds side by side.
- **One-click screenshots**: The Jiushi/USThing views expose a "📸 导出快照" button that captures the full grid (time axis + all slots) into a PNG via html2canvas.
- **Cron refresh**: Cloudflare Scheduler triggers both providers every minute between 08:00–22:59 (UTC+8) to keep the snapshots fresh.
- **Push (optional)**: PushDeer notifications can be enabled for new availability.
- **Legacy tooling**: The Go modules in `internal/` continue to support local/CLI workflows and share logic with the TypeScript side.

GitHub: <https://github.com/kongdayan/FBS_HKUST_Spider>

## Directory Map

- `ts/` – Cloudflare Worker implementation (handlers, services, views, D1 helpers).
- `d1/schema.sql` – D1 `slot_snapshot` table definition.
- `wrangler.toml` – Worker configuration, including cron and D1 binding.
- `internal/`, `cmd/`, `templates/` – Go scanner and HTML output.

## Quick Start

```bash
git clone https://github.com/kongdayan/FBS_HKUST_Spider
cd FBS_HKUST_Spider
npm install

# Local dev with cron simulation and Tailwind-rendered HTML
npx wrangler dev --test-scheduled
```

## Authentication

As of USThing app v7.20.0, the backend uses **Microsoft Azure AD OAuth2** (tenant: `c917f3e2-9322-4926-9bb3-daca730413ca`). This project supports two auth modes:

### Mode 1: Azure AD dynamic token (recommended)

Set your HKUST credentials as environment variables. The code automatically acquires and refreshes tokens via the ROPC (password) grant — no manual token rotation needed.

```bash
# Go (local)
export USTHING_USERNAME="yourname@connect.ust.hk"
export USTHING_PASSWORD="your-password"

# Cloudflare Worker
# wrangler secret put USTHING_PASSWORD
# Set USTHING_USERNAME in wrangler.toml [vars]
```

### Mode 2: Static bearer token (legacy)

Set `USTHING_BEARER` with a pre-obtained JWT. Useful for one-off tests, but tokens expire after ~1 hour.

```bash
export USTHING_BEARER="Bearer eyJ..."
```

### Priority order

1. `USTHING_BEARER` (static, highest priority)
2. `USTHING_USERNAME` + `USTHING_PASSWORD` (dynamic Azure AD)
3. KV namespace `hkust_token` key `usthing:bearer` (Worker only)

## Environment Variables

| Variable | Description |
| --- | --- |
| `USTHING_USERNAME` | **Recommended.** HKUST email for Azure AD dynamic token acquisition. |
| `USTHING_PASSWORD` | **Recommended.** HKUST password for Azure AD. Use `wrangler secret put` in production. |
| `USTHING_BEARER` | Optional. Static bearer JWT (legacy mode; expires ~1h). Overrides dynamic auth if set. |
| `USTHING_UST_ID` | Optional. USThing user ID (auto-resolved from token if empty). |
| `USTHING_USER_TYPE` | Optional. Default `01`. |
| `USTHING_FACILITY_IDS` | Comma-separated facility IDs (defaults to `2,3,4,5,79,80,100,101` — all badminton courts). |
| `PUSHDEER_KEYS` | Optional. Comma-separated PushDeer keys. |
| `TOKEN_ADMIN_SECRET` | Optional. Passphrase required when updating the bearer token via `/admin/token`. |
| `JIUSHI_VENUE_ID` | Required when enabling Jiushi sync. Venue identifier passed to the Jiushi API. |
| `JIUSHI_GROUND_IDS` | Optional. Comma-separated Jiushi ground IDs to persist. |
| `JIUSHI_MAX_DAYS` | Optional. Maximum Jiushi booking days to fetch (default 9). |

Provision two D1 databases using the schema in `d1/schema.sql`: one bound to `DB` (USThing) and one to `JIUSHI_DB` (Jiushi).

During local dev you can use `.dev.vars` or export variables before `wrangler dev`. For production with the static-token mode, write secrets to KV:

```bash
wrangler kv:key put --binding=hkust_token usthing:bearer "Bearer <jwt>"
```

## API Endpoints

The USThing backend was **upgraded from v1/v2 to v3** in app version 7.20.0. Old v1 endpoints return 404.

| Function | Endpoint | Method | Notes |
| --- | --- | --- | --- |
| List facilities | `/v3/msapi/fbs/facilities` | GET | Returns 63+ facilities with names and locations. |
| Query timeslots | `/v3/msapi/fbs/facilityTimeslot` | GET | Params: `ustID`, `userType`, `facilityID`, `startDate`, `endDate`. Returns `errorCode: "03"` when system is closed (night hours). |
| View bookings | `/v3/msapi/fbs/bookingInfo` | GET | Params: `ustID`, `userType`. Lists current bookings with `bookingRef`. |
| Create/cancel booking | `/v2/fbs/book` | POST | Params: `ustID`, `userType`, `facilityID`, `timeslotDate`, `startTime`, `endTime`, `cancelInd` (`N`=book, `Y`=cancel). |

The gateway (`ms.api.usthing.xyz`) proxies to `w5.ab.ust.hk`. System is closed daily from ~22:00 to ~08:00 HKT.

## Scheduled Sync

`wrangler.toml` defines:

```toml
[triggers]
crons = ["* 8-22 * * *"]
```

That means Cloudflare Scheduler runs the worker once per minute from 08:00 to 22:59 (UTC+8). Every invocation:

1. Calls USThing for configured facilities and Jiushi for the configured venue.
2. Persists each provider snapshot into its own D1 binding (`DB` for USThing, `JIUSHI_DB` for Jiushi).
3. Enqueues optional PushDeer notifications (USThing only at the moment).
4. When hit via HTTP, the worker renders the latest snapshot (use `?source=` to select a provider, `?refresh=1` to force re-sync).

## Deployment

You can deploy manually:

```bash
npx wrangler deploy
```

Or automate via GitHub Actions:

```yaml
name: Deploy Worker
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

Create a Cloudflare API token with *Edit Workers* permissions and add it plus your account ID as repo secrets (`CF_API_TOKEN`, `CF_ACCOUNT_ID`).

## Managing the Bearer Token

You can refresh a static JWT without touching Wrangler by visiting `/admin/token` on the worker (e.g. `https://fbs-hkust-spider.example.workers.dev/admin/token`). Provide the `TOKEN_ADMIN_SECRET` value and the full `Bearer ...` string; the worker writes it into the KV key `usthing:bearer`.

With the recommended Azure AD dynamic auth mode, no manual token management is needed — tokens are auto-refreshed ~5 minutes before expiry.

## Go CLI (Local)

```bash
# Set credentials
export USTHING_USERNAME="yourname@connect.ust.hk"
export USTHING_PASSWORD="your-password"
export USTHING_UST_ID="20789731"         # optional, auto-resolved

# Run the scanner
go run ./cmd/main/

# Or build a binary
go build -o fbs-scanner ./cmd/main/
./fbs-scanner
```

The Go code shares the same service logic as the Worker:
- `internal/usthing/` – USThing API client with `TokenManager` for auto-refreshing Azure AD tokens.
- `internal/service/` – Slot aggregation and unified data model.
- `internal/pushdeer/` – PushDeer notification integration.
- `internal/webui/` – WebSocket server for live dashboard.

## License

MIT © kongdayan
