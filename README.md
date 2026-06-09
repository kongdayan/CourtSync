# CourtSync

Badminton court availability monitor with rule-based notifications.

## Architecture

- **Frontend**: React SPA (Vite + Tailwind CSS)
- **API**: Hono (private, same-origin only)
- **Auth**: Google OAuth via Better Auth
- **Storage**: Cloudflare D1 (APP_DB, DB, JIUSHI_DB)
- **Delivery**: Cloudflare Queues → PushDeer

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

```bash
npm run deploy
```

## Secrets

Configure via `npx wrangler secret put <NAME>`:
- BETTER_AUTH_SECRET
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
- ADMIN_EMAILS (comma-separated)
- CHANNEL_ENCRYPTION_KEYS (JSON: {active, keys})
- ADMIN_PUSHDEER_KEY (single key for system alerts)
