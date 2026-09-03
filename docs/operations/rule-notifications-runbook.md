# CourtSync Operations Runbook

## Applying Migrations

### Staging
```bash
npx wrangler d1 migrations apply courtsync-app-data-staging --env staging --remote
```

### Production
```bash
npx wrangler d1 export courtsync-app-data --remote --output /tmp/backup.sql
npx wrangler d1 migrations apply courtsync-app-data --remote
```

## Deployment

### Staging
```bash
npm run build
npx wrangler deploy --env staging
```

### Production
```bash
npm run build
npx wrangler deploy
```

## Rollback

```bash
npx wrangler deployments list
npx wrangler rollback
```

## Inspecting Queues

```bash
npx wrangler queues list
```

## Replaying Failed Outbox

1. Identify the outbox ID from logs or database query.
2. Set status back to pending:
```bash
npx wrangler d1 execute courtsync-app-data --command "UPDATE notification_outbox SET status = 'pending', last_error = NULL WHERE id = '<OUTBOX_ID>'" --remote
```
3. The next scheduled sync run will re-enqueue it automatically.

## Pausing All Notifications

```bash
npx wrangler queues consumer remove courtsync-notifications
```

To resume:
```bash
npx wrangler queues consumer add courtsync-notifications
```

## Rotating Secrets

### Google OAuth
1. Create new credentials in Google Cloud Console.
2. Update authorized redirect URIs.
3. Set new secrets:
```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

### Channel Encryption Keys
Generate a new key ring:
```bash
node -e 'const c=require("crypto");process.stdout.write(JSON.stringify({active:"v2",keys:{v2:c.randomBytes(32).toString("base64")}}))' | npx wrangler secret put CHANNEL_ENCRYPTION_KEYS
```
Old keys remain in the key ring for decryption. Update the active key ID.

### PushDeer Keys
```bash
npx wrangler secret put ADMIN_PUSHDEER_KEY
```

### Better Auth Secret
```bash
npx wrangler secret put BETTER_AUTH_SECRET
```
Note: Changing this invalidates all existing sessions.

## Monitoring

Check structured log events in Cloudflare dashboard:
- `scheduled_sync_complete` — per-run summary
- Queue DLQ depth and retry counts
- Source health consecutive failures
