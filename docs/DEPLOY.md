# Deploying StarScreener

StarScreener runs on two environments in parallel:

| Deploy    | URL                                            | Role                                      |
|-----------|------------------------------------------------|-------------------------------------------|
| Vercel    | https://starscreener.vercel.app                | Primary UI + REST API + daily cron        |
| Railway   | https://starscreener-production.up.railway.app | Full platform including persistent SSE    |

**Why two?** SSE (`/api/stream`) needs a long-lived Node process. Vercel serverless
functions time out after 10-60s, so SSE works only on Railway. The Vercel UI can
be configured (via `NEXT_PUBLIC_STREAM_URL` or a client override) to point its
SSE client at the Railway host if live updates are needed.

---

## Environment variables (both deploys)

| Var                       | Required | Vercel value                 | Railway value   |
|---------------------------|----------|------------------------------|-----------------|
| `GITHUB_TOKEN`            | Yes      | PAT (public_repo scope)      | Same PAT        |
| `CRON_SECRET`             | Yes      | Shared random 24-byte token  | Same token      |
| `STARSCREENER_PERSIST`    | Yes      | `true`                       | `true`          |
| `STARSCREENER_DATA_DIR`   | Yes      | `/tmp/.data`                 | `/data`         |
| `NEXT_PUBLIC_APP_URL`     | Yes      | Vercel URL                   | Vercel URL      |
| `NODE_ENV`                | Yes      | `production` (auto)          | `production`    |

Generate `CRON_SECRET` once:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

`GITHUB_TOKEN` must be a GitHub PAT (classic) with at minimum `public_repo` scope.
Without it, the ingestion layer falls back to mock data.

---

## Vercel deploy

Project: `starscreener` (scope: `kermits-projects-6330acd4`).

```bash
# one-time link
vercel link --yes --project starscreener

# non-secret vars (already set in the project)
vercel env add STARSCREENER_PERSIST  production   # = true
vercel env add STARSCREENER_DATA_DIR production   # = /tmp/.data
vercel env add NEXT_PUBLIC_APP_URL   production   # = https://starscreener.vercel.app
vercel env add CRON_SECRET           production   # <paste token>

# secret — paste manually:
vercel env add GITHUB_TOKEN          production   # <paste PAT>

# deploy
vercel --prod --yes
```

**Hobby plan constraint:** only one daily cron is allowed. `vercel.json` ships
with `/api/cron/ingest?tier=cold` daily. To run hourly/warm/backfill crons you
must upgrade to Pro and re-add:

```json
{ "path": "/api/cron/ingest?tier=hot",     "schedule": "0 * * * *" },
{ "path": "/api/cron/ingest?tier=warm",    "schedule": "0 */6 * * *" },
{ "path": "/api/cron/backfill-top?n=20",   "schedule": "30 2 * * *" }
```

**Seed on first deploy:**

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://starscreener.vercel.app/api/cron/seed
```

The seed takes ~6 minutes. Vercel Hobby tier function timeout is 60s and this
route is capped at 300s in `vercel.json` (Pro tier). On Hobby, run seed in
chunks using `?categories=ai-ml,devtools,...`.

---

## Railway deploy

Project: `starscreener`, service: `starscreener`
(https://railway.com/project/344c730a-90a9-4591-bea2-de0d2e374566).

```bash
railway login                # one-time, opens browser
railway link                 # select 'starscreener' project + service
railway variables --set "STARSCREENER_PERSIST=true"
MSYS_NO_PATHCONV=1 railway variables --set "STARSCREENER_DATA_DIR=/data"
railway variables --set "NODE_ENV=production"
railway variables --set "CRON_SECRET=<paste token>"
railway variables --set "NEXT_PUBLIC_APP_URL=https://starscreener.vercel.app"
railway variables --set "GITHUB_TOKEN=<paste PAT>"

# attach a persistent volume (via dashboard):
# Service → Settings → Volumes → Add → mount path: /data
# Without a volume /data is ephemeral and wiped on redeploy.

railway up --service starscreener --ci
railway domain               # already provisioned: starscreener-production.up.railway.app
```

Nixpacks auto-detects Next.js; `npm run build && npm start` runs unmodified.
`output: "standalone"` in `next.config.ts` is not required.

### Smoke tests

```bash
curl -o /dev/null -w "%{http_code}\n" https://starscreener-production.up.railway.app/
curl -N https://starscreener-production.up.railway.app/api/stream   # Ctrl-C after 5s
```

The SSE response should open with:

```
event: ready
data: {"at":"...","types":[...],"subscribers":1}
```

---

## Secrets to paste manually

Secrets are NEVER committed. Paste these once in each dashboard:

### Vercel (https://vercel.com/kermits-projects-6330acd4/starscreener/settings/environment-variables)
- `GITHUB_TOKEN` — GitHub PAT
- `CRON_SECRET` — already set via CLI. Rotate via dashboard if leaked.

### Railway (project → starscreener service → Variables)
- `GITHUB_TOKEN` — same GitHub PAT
- `CRON_SECRET` — already set

Both deploys must share the same `CRON_SECRET` so authenticated cron requests
work against either host.

---

## Troubleshooting

| Symptom                          | Likely cause                                      |
|----------------------------------|---------------------------------------------------|
| `401` on `/api/cron/*`           | `CRON_SECRET` missing / mismatched                |
| Empty `repoCount` on categories  | Initial seed never ran                            |
| SSE connection closes immediately| Hitting the Vercel deploy, not Railway            |
| Seed times out on Vercel         | Hobby 60s limit — use `?categories=` chunking     |
| Data disappears after redeploy   | No persistent volume on Railway / `/tmp` on Vercel|

See `INGESTION.md`, `API.md`, `DATABASE.md` for subsystem details.
