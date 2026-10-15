> **Final standalone snapshot (2026-10-15).** Maintenance is paused. This repository preserves the independent implementation and its existing integrations. The deployment command is disabled to keep this historical snapshot from replacing the active service.

# CourtSync

Badminton court availability monitor with rule-based notifications.

## Architecture

- **Frontend**: React SPA, seven-day planner with court details and continuous-duration filters (Vite + Tailwind CSS)
- **API**: Hono (public availability snapshots; authenticated, same-origin account features)
- **Auth**: Google OAuth via Better Auth
- **Storage**: Cloudflare D1 (APP_DB, DB, JIUSHI_DB), published KV snapshots and five-minute edge responses
- **Delivery**: Cloudflare Queues → PushDeer

Historical deployment URL: <https://sports.anserlabs.com/> · GitHub: <https://github.com/kongdayan/CourtSync>

Availability, refresh behavior, quotas and verification: [场地总览与容量说明](docs/availability-and-capacity.md).

## User States

- **pending**: New user waiting for admin approval
- **active**: Can create rules and receive notifications
- **disabled**: Cannot access protected features

## Local Development

```bash
npm install
npm run cf-typegen
npm run dev
```

## Testing

```bash
npm run typecheck
npm run test:worker
npm run test:web
npm run test:e2e
npm run benchmark:matching
```

## Deployment

This final standalone snapshot is retained for reference and local reproduction.
`npm run deploy` exits before building or uploading. The existing bindings remain
as historical configuration; this repository no longer publishes updates.

## Secrets

Configure via `npx wrangler secret put <NAME>`:
- BETTER_AUTH_SECRET
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
- ADMIN_EMAILS (comma-separated)
- CHANNEL_ENCRYPTION_KEYS (JSON: {active, keys})
- ADMIN_PUSHDEER_KEY (single key for system alerts)
