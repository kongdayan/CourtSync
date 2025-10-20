# FBS HKUST Spider

Fetch, persist, and visualise USThing badminton court availability. This repository now bundles the original Go-based CLI scanner together with the Cloudflare Worker that powers the web dashboard.

- **Live snapshot**: A Cloudflare Worker fetches slot data, stores the latest 14-day window in D1, and renders an HTML table or JSON feed.
- **Cron refresh**: Cloudflare Scheduler triggers the worker every minute between 08:00–22:59 (UTC+8) to keep the snapshot fresh.
- **Push (optional)**: PushDeer notifications can be enabled for new availability.
- **Legacy tooling**: The Go modules in `internal/` continue to support local/CLI workflows and share logic with the TypeScript side.

GitHub: <https://github.com/kongdayan/FBS_HKUST_Spider>

## Directory Map

- `ts/` – Cloudflare Worker implementation (handlers, services, views, D1 helpers).
- `d1/schema.sql` – D1 `slot_snapshot` table definition.
- `wrangler.toml` – Worker configuration, including cron and D1 binding.
- `internal/`, `cmd/`, `templates/` – Legacy Go scanner and HTML output.

## Quick Start

```bash
git clone https://github.com/kongdayan/FBS_HKUST_Spider
cd FBS_HKUST_Spider
npm install

# Local dev with cron simulation and Tailwind-rendered HTML
npx wrangler dev --test-scheduled
```

### Environment

| Variable | Description |
| --- | --- |
| `USTHING_BEARER` | Optional. Inline bearer JWT (mostly for local dev); in production the worker reads key `usthing:bearer` from the `hkust_token` KV namespace. |
| `USTHING_UST_ID` | Optional. Defaults to empty (USThing allows bearer-only). |
| `USTHING_USER_TYPE` | Optional. Default `01`. |
| `USTHING_FACILITY_IDS` | Comma-separated facility IDs (defaults to `2,3,4,5,79,80,100,101`). |
| `PUSHDEER_KEYS` | Optional. Comma-separated PushDeer keys. |
| `TOKEN_ADMIN_SECRET` | Optional. Passphrase required when updating the bearer token via `/admin/token`. |

During local dev you can use `.dev.vars` or export variables before `wrangler dev`. For production, write secrets to the KV namespace:

```bash
wrangler kv:key put --binding=hkust_token usthing:bearer "Bearer <jwt>"
```

You can still set `USTHING_BEARER` for ad-hoc testing; KV takes precedence in production.

## Scheduled Sync

`wrangler.toml` defines:

```toml
[triggers]
crons = ["* 8-22 * * *"]
```

That means Cloudflare Scheduler runs the worker once per minute from 08:00 to 22:59 (UTC+8). Every invocation:

1. Calls USThing for configured facilities and date range (`today` + 14 days).
2. Persists the snapshot into D1 (`slot_snapshot` table).
3. Enqueues optional PushDeer notifications.
4. When hit via HTTP, the worker renders the latest snapshot (without retrying unless `?refresh=1` is passed).

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

You can refresh the JWT without touching Wrangler by visiting `/admin/token` on the worker (e.g. `https://fbs-hkust-spider.example.workers.dev/admin/token`). Provide the `TOKEN_ADMIN_SECRET` value and the full `Bearer ...` string; the worker writes it into the KV key `usthing:bearer`. For CLI/automation, the same update is available via:

```bash
npx wrangler kv:key put --binding=hkust_token usthing:bearer "Bearer <jwt>"
```

Remember to repeat the command with `--preview` (and optionally `--local`) when updating preview/local environments.

## Legacy Go Scanner (Optional)

The original Go-based workflow is still available:

```bash
go run ./cmd/fbs-scan
```

It shares service logic with the worker and can be extended for CLI automation or additional data exports.

## License

MIT © kongdayan


