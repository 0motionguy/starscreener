# Deploying StarScreener to Vercel

## Prerequisites

- Vercel account
- GitHub personal access token (classic, `public_repo` scope)
- (Optional for Hobby tier, required for Pro+) Vercel Cron enabled

## Step-by-step

1. Push repo to GitHub.
2. Import project into Vercel.
3. Set environment variables in Vercel dashboard:
   - `GITHUB_TOKEN` — your PAT
   - `CRON_SECRET` — generate with `openssl rand -hex 32`
   - `NEXT_PUBLIC_APP_URL` — your deployed URL (e.g., `https://starscreener.vercel.app`)
4. Deploy.
5. Trigger initial seed (one-shot):
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://your-url.vercel.app/api/cron/seed
   ```
6. Cron jobs (defined in `vercel.json`) will now run:
   - Hot tier: every hour
   - Warm tier: every 6 hours
   - Cold tier: daily

## Environment variables

| Var | Required | Purpose |
|-----|----------|---------|
| `GITHUB_TOKEN` | Recommended | Real GitHub ingestion. Falls back to mock data without it. |
| `CRON_SECRET` | Recommended | Authorizes `/api/cron/*` endpoints. |
| `NEXT_PUBLIC_APP_URL` | Optional | Used for canonical URLs and OG metadata. |
| `STARSCREENER_PERSIST` | Optional | `"false"` disables JSONL persistence. |
| `STARSCREENER_DATA_DIR` | Optional | Override default `.data/` directory. |

See `.env.example` for the full list.

## Vercel tiers

- **Hobby**: 1 cron job max, daily frequency only. You'll need to pick one tier (probably `cold` = daily) and manually trigger `hot`/`warm`.
- **Pro**: unlimited crons, any frequency.

## Function timeouts

`vercel.json` sets explicit `maxDuration` for long-running routes:

- `/api/pipeline/recompute` → 60s
- `/api/cron/ingest` → 300s
- `/api/cron/seed` → 300s

The default (10s) is fine for every other route.

## Troubleshooting

### Cron not running
Check Vercel → Project → Cron Jobs tab. Verify `vercel.json` is committed and deployed.

### 401 on /api/cron/*
Check `CRON_SECRET` matches between env and the `Authorization: Bearer <secret>` header.

### Rate limit exceeded
Normal — each tier respects GitHub's 5000/hour. Batch size is capped via scheduler policy. Cold tier has the lowest cap (5 repos/hour).

### Data disappears after redeploy
Vercel functions are stateless — in-memory state resets on cold start. JSONL persistence is written to `/tmp` on Vercel which is ephemeral. For durable storage, wire up a database (see [DATABASE.md](./DATABASE.md)).

## Alternative deployment targets

- **Railway**: uncomment `output: "standalone"` in `next.config.ts`, deploy Docker
- **Fly.io**: same, with a `fly.toml`
- **Self-hosted**: `npm run build && npm start`

## Post-deploy smoke tests

```bash
# 1. Health check
curl https://your-url.vercel.app/api/pipeline/status

# 2. Top movers
curl "https://your-url.vercel.app/api/repos?window=24h&sort=momentum"

# 3. Trigger manual ingest (auth required)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://your-url.vercel.app/api/cron/ingest?tier=hot"
```
