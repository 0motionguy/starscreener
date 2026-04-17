# StarScreener Ingestion — Operator Guide

This document covers how StarScreener pulls data from GitHub and the operator
surfaces for driving that process (manual triggers, cron, seeding, rate-limit
management).

## 1. Overview

The pipeline has three phases:

1. **Ingest** — fetch repo + latest release + contributor count from GitHub
   for a list of `owner/repo` identifiers. Normalizes into our `Repo` shape
   and snapshots point-in-time metrics for delta computation.
2. **Recompute** — re-derive deltas, scores, categories, reasons, and rank
   across the whole store in one consistent pass.
3. **Persist** — flush every store to `.data/*.jsonl` so a server restart
   resumes state in place.

The entry points are:

- `POST /api/pipeline/ingest` — ad-hoc batch (1–50 repos) without auth.
- `POST /api/pipeline/recompute` — recompute derived state on demand.
- `GET/POST /api/cron/ingest?tier=hot|warm|cold` — cron-triggered batch
  for a scheduler tier (auth required).
- `GET/POST /api/cron/seed` — one-shot seed from `ALL_SEED_REPOS`
  (auth required).

## 2. Create a GitHub token

1. Go to <https://github.com/settings/tokens>.
2. "Generate new token" → classic.
3. Scope: `public_repo` is sufficient — we only read public metadata.
4. Copy the token value.

Rate limits:

- Authenticated: **5,000 requests / hour / token**.
- Unauthenticated: 60 requests / hour / IP — **not enough** for real use.

## 3. Local setup

Create `.env.local` in the project root:

```
GITHUB_TOKEN=ghp_...
CRON_SECRET=<openssl rand -hex 32>
STARSCREENER_PERSIST=true
```

When `GITHUB_TOKEN` is **not** set, every endpoint transparently falls back
to `MockGitHubAdapter` — the code never throws, it just serves fixture data.

## 4. One-shot seed from the curated list

`src/lib/seed-repos.ts` contains ~300 curated real repositories across 10
categories. To populate a fresh deploy:

```bash
# local dev (dev port is 3008; adjust if your dev server picks a
# different port — Next.js logs it on boot).
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3008/api/cron/seed

# production
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://your-host.vercel.app/api/cron/seed
```

The endpoint processes repos in chunks of 25 with a 300ms delay between
chunks. Response:

```json
{
  "ok": true,
  "total": 317,
  "okCount": 310,
  "failed": 7,
  "rateLimitRemaining": 4683,
  "chunks": 13,
  "durationMs": 31240,
  "source": "github",
  "stoppedEarly": false
}
```

If the rate limit is exhausted mid-batch, `stoppedEarly: true` — re-run the
endpoint after the reset window. Ingest is idempotent (same repo can be
re-ingested safely; snapshots append but derived state is recomputed from
the current snapshot set).

## 5. Rate-limit math

Each repo costs ~3 GitHub API calls:

1. `GET /repos/{full_name}`
2. `GET /repos/{full_name}/releases/latest`
3. `GET /repos/{full_name}/contributors?per_page=1`

With a 5,000 req/hr budget: **~1,666 repos per hour** maximum. Our curated
seed is ~300 repos, so a full cold seed uses ~900 calls — one-shot seeding
fits comfortably.

The scheduler's per-tier caps reflect this:

| Tier | Interval  | maxPerHour |
| ---- | --------- | ---------- |
| hot  | 60 min    | 50         |
| warm | 360 min   | 20         |
| cold | 1440 min  | 5          |

At worst-case all three tiers firing every hour: `50 + 20 + 5 = 75` repos ×
3 calls = 225 calls/hour. ~1/22 of the budget.

## 6. Manual cron triggers

To manually trigger a tier refresh (useful for debugging):

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3008/api/cron/ingest?tier=hot"
```

Response:

```json
{
  "ok": true,
  "tier": "hot",
  "processed": 42,
  "okCount": 40,
  "failed": 2,
  "rateLimitRemaining": 4641,
  "durationMs": 8520,
  "source": "github"
}
```

If the adapter reports `rateLimitRemaining <= 0` during the batch, the
endpoint returns `{ ok: false, reason: "rate-limited" }` and aborts.
Retry after the reset window.

## 7. Vercel Cron schedule

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/ingest?tier=hot", "schedule": "0 * * * *" },
    { "path": "/api/cron/ingest?tier=warm", "schedule": "0 */6 * * *" },
    { "path": "/api/cron/ingest?tier=cold", "schedule": "0 0 * * *" }
  ]
}
```

### Vercel tier caveat

| Vercel plan | Cron support                                   |
| ----------- | ---------------------------------------------- |
| Hobby       | **Daily only** — hot/warm crons won't fire     |
| Pro         | Full — all three schedules above work          |
| Enterprise  | Full + more expressive schedules available     |

On Hobby, the `cold` cron still runs daily. For more frequent refreshes on
Hobby you'd need an external trigger (GitHub Actions on a schedule calling
our endpoint with the bearer token, for example).

Vercel automatically injects the `CRON_SECRET` when you configure it in
the project's environment variables — the GET requests from Vercel Cron
arrive with the bearer token pre-set, so the endpoint authenticates the
same way a manual `curl` does.

## 8. Troubleshooting

### "unauthorized" (401)

- `CRON_SECRET` env var is unset, or the Authorization header is missing /
  doesn't match. Verify:
  ```bash
  echo $CRON_SECRET
  curl -v -H "Authorization: Bearer $CRON_SECRET" \
    "http://localhost:3008/api/cron/ingest?tier=hot"
  ```

### "rate-limited"

- The GitHub token's hourly budget is exhausted. Check:
  ```bash
  curl -H "Authorization: Bearer $GITHUB_TOKEN" \
    https://api.github.com/rate_limit
  ```
- The reset timestamp tells you when to retry. Consider raising the token
  scope to `repo` (private repos) only if you actually need them — same
  5000/hr budget.

### Everything returns from the mock adapter

- `GITHUB_TOKEN` is not set, or is invalid. The pipeline falls back to
  `MockGitHubAdapter` whenever `process.env.GITHUB_TOKEN` is empty/missing.
- Check the response `source` field: `"mock"` confirms fallback.

### Network errors / 5xx from GitHub

- The adapter retries up to 2 times with exponential backoff (1s, 2s) on
  429 and 5xx responses. If all retries fail it logs and returns `null` —
  that repo appears in `batch.results` with `ok: false`. Individual
  failures don't abort the batch.

### Token scope issues

- `public_repo` is sufficient for all metadata we read. If you see `403`
  responses despite a valid token, verify the scope in
  <https://github.com/settings/tokens>. The CSV-only `read:user` scope is
  NOT enough.

### Stale data after seeding

- `POST /api/pipeline/recompute` forces a full re-score without a new
  GitHub fetch. Use this when you've manually edited persisted JSONL files
  or want to see the effect of a scoring weight change.

## 9. Relevant source files

- `src/lib/seed-repos.ts` — curated ~300 repo list by category.
- `src/lib/pipeline/pipeline.ts` — facade (`pipeline.ingestBatch`, `pipeline.recomputeAll`).
- `src/lib/pipeline/adapters/github-adapter.ts` — real REST adapter with
  rate-limit + retry.
- `src/lib/pipeline/adapters/mock-github-adapter.ts` — fixture adapter.
- `src/lib/pipeline/ingestion/ingest.ts` — orchestrator + `createGitHubAdapter`.
- `src/lib/pipeline/ingestion/scheduler.ts` — tier assignment + refresh plans.
- `src/app/api/cron/ingest/route.ts` — tier-driven cron endpoint.
- `src/app/api/cron/seed/route.ts` — one-shot seeder.
- `vercel.json` — cron schedules.
