# API snapshot (2026-04-27)

Probed against `http://localhost:3088` (dev). Public-only endpoints; auth/cron/webhook/admin routes excluded.

## Run summary

This run **terminated early** because the target dev server became unreachable mid-probe. See "Server reachability" below for full evidence and timeline.

## Server reachability

| Time (probe order) | Endpoint | Status | Notes |
|---|---|---|---|
| t0 (initial precheck) | `/api/health?soft=1` | 200 | Server responded once. |
| t0 + ~5s | `/api/categories` (raw curl, sample) | 200 | Body returned (`categories` array, 3880 bytes total); used to discover `ai-agents` slug. |
| t0 + ~7s | `/api/collections` (rtk proxy curl, sample) | 200 | Body returned; used to discover `artificial-intelligence` slug. |
| t0 + ~30s | full sweep (39 endpoints) | **500** for all | Body: `Internal Server Error` (21 bytes, plain text). |
| t0 + ~3min | `/api/health?soft=1` re-probe | **000** (no connection) | Connect timeout. |
| `netstat -ano` | port `3088` | **NOT LISTENING** | Only `3023` and unrelated ports are listening. |

The dev server on `:3088` died during probing. No `LISTEN` socket exists on `3088` anymore. Per the task's hard rule — "DO NOT spin retries on a hung server — exit early" — the sweep was halted and no further endpoints were exercised.

The only Next dev server currently bound is on `:3023`, which the task explicitly identifies as hung from another session and forbids using. Per task hard rules, no fallback to `:3023` was attempted.

## Endpoints attempted (before server died)

39 endpoints were enumerated and queued. All 39 returned `500 Internal Server Error` with body `Internal Server Error` (21 bytes) once the sweep ran. The 500 wave is consistent with the dev server crashing mid-flight (Next.js returns this generic plaintext when the underlying handler throws unhandled / the Node process is terminating). It is **not** a per-route observation — it is a server-state observation.

The endpoints in the queue (kept here so the next run can resume without re-discovery):

```
/api/health?soft=1
/api/health
/api/health/sources
/api/health/portal
/api/health/cron-activity
/api/repos
/api/repos/vercel/next.js
/api/repos/vercel/next.js/freshness
/api/repos/vercel/next.js/aiso
/api/repos/vercel/next.js/mentions
/api/search?q=react
/api/pipeline/status
/api/pipeline/meta-counts
/api/pipeline/sidebar-data
/api/pipeline/featured
/api/pipeline/freshness
/api/pipeline/alerts
/api/pipeline/alerts/rules
/api/compare?repos=vercel/next.js,facebook/react
/api/compare/github?repos=vercel/next.js,facebook/react
/api/collections
/api/collections/artificial-intelligence
/api/categories
/api/ideas
/api/twitter/leaderboard
/api/twitter/repos/vercel/next.js
/api/predict
/api/predict/calibration
/api/profile/vercel
/api/openapi.json
/api/auth/session
/api/reactions
/api/repo-submissions
/api/watchlist/private
/api/mcp/usage
/api/export/csv
/api/tools/revenue-estimate
/api/submissions/revenue
/api/stream
```

## Observed shapes (the two endpoints that did return JSON before the crash)

| Endpoint | Status | Bytes | Time (s) | Top-level keys | Notes |
|---|---|---|---|---|---|
| /api/categories | 200 | ~3880 | <0.5 | `categories` | Array of `{id, name, shortName, description, icon, color, repoCount, avgMomentum, topMoverId}`. |
| /api/collections | 200 | >600 (truncated sample) | <0.5 | `meta, coverage, collections` | `meta` includes `collectionsCount`, `trendingFetchedAt`, `hotCollectionsFetchedAt`, `collectionRankingsFetchedAt`, `rankingPeriod`. `collections[*]` includes `id, slug, name, curatedRepoCount, liveRepoCount, hotRank, hotRepoCount, hotTopRepo, starsRankingCount, issuesRankingCount, topStarsRepo`. |

## Failures

All 39 sweep endpoints: status `500`, body `Internal Server Error` (21 bytes plaintext). This is a **server-process failure**, not an application-layer failure — the dev server stopped serving entirely shortly after, evidenced by `netstat` showing port `3088` no longer listening.

No 4xx-class responses were observed (because the run ended in the 500 wave then full unavailability before any auth-gated route returned a 401/403 expectation).

## FreshBadge contract

**INDETERMINATE.** The check requires comparing `/api/health?soft=1` (must omit `ageSeconds`) against `/api/health` (must include `ageSeconds`). The initial precheck on `/api/health?soft=1` returned 200, but the body was discarded by the precheck script (`-o /dev/null`). The follow-up sweep returned 500 plaintext for both endpoints — useless for shape comparison. Re-run after restarting the dev server on `:3088` to record the verdict.

## Coverage gaps (intentionally skipped per task rules)

| Path prefix | Reason skipped |
|---|---|
| `/api/admin/*` | Cookie-gated admin session — would 401. |
| `/api/cron/*` | Require `CRON_SECRET` header. |
| `/api/webhooks/*` | Require external POST signatures (Stripe, etc.). |
| `/api/internal/*` | Auth-gated internal surface. |
| `/api/mcp/*` | Specific POST bodies required (note: `/api/mcp/usage` was attempted as it appears to be a GET surface but never resolved due to server crash). |
| `/api/checkout/stripe` | Would create real Stripe sessions. |

## Coverage gaps (unintentional, due to server state)

Every endpoint in the "queued" list above. The sweep needs to be re-run against a healthy `:3088` dev server. To resume:

1. Kill the hung `:3023` dev server (`netstat -ano | grep 3023` → `taskkill /F /PID <pid>`).
2. Start a fresh dev server on `3088`: `npm run dev -- -p 3088`.
3. Confirm `/api/health?soft=1` returns 200 with non-trivial JSON before re-running the sweep.

## Hard rules adhered to

- No `/api/` route code modified.
- No POST/DELETE issued — GET-only.
- No cookies, secrets, or admin tokens included.
- No retries against the hung server — exited early once `netstat` confirmed `:3088` was no longer bound.
