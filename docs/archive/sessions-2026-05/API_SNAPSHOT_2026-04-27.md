# API snapshot (2026-04-27)

Probed against `http://localhost:3099` (fresh `next dev` after `.next` nuke). Public-only endpoints; auth/cron/webhook/admin routes excluded. Replaces the partial run captured earlier today against `:3088`.

## Run summary

- Server boot: clean. `Ready in 2.7s`. Port 3099 was bound throughout the sweep (PID 46968), confirmed via `netstat -ano`.
- Endpoints probed: **39 / 39 planned** — full queue resumed from prior snapshot completed without server crash mid-sweep.
- Tooling: `/mingw64/bin/curl -s --max-time 12 -o <body> -w "%{http_code}|%{size_download}|%{time_total}"`. Bypassed the `rtk proxy` wrapper after the wrapper truncated stdout to 826 bytes; binary file output via `-o` was the only reliable way to capture full bodies. No POST/PATCH/DELETE issued; no auth cookies sent.
- Post-sweep note: shortly after the 39-endpoint sweep finished the dev process began emitting `ENOENT routes-manifest.json` on subsequent requests — OneDrive-sync churn on `.next/` re-corrupted the cache. **This did NOT affect any of the 39 probe results** (all completed before the corruption window). Snapshot data below is from the clean window.

## Probe results

| Endpoint | Status | Bytes | Time (s) | Top-level keys | Notes |
|---|---|---|---|---|---|
| `/api/health?soft=1` | 200 | 826 | 1.01 | `blueskyCold,blueskyFetchedAt,collectionRankingsFetchedAt,computedAt,coveragePct,coverageQuality,devtoCold,devtoFetchedAt,hnCold,hnFetchedAt,hotCollectionsFetchedAt,lastFetchedAt,lobstersCold,lobstersFetchedAt,npmCold,npmFetchedAt,producthuntCold,producthuntFetchedAt,recentReposFetchedAt,redditCold,redditFetchedAt,repoMetadataFetchedAt,sourceStatus,status` | `status="stale"`, no `ageSeconds`. **Soft contract holds.** |
| `/api/health` | 503 | 826 | 0.13 | identical to soft | Body byte-identical to soft (verified via `diff`). 503 because `coverageQuality=partial` + at least one stale source. **No `ageSeconds` either** — unauthenticated callers get the minimal shape; `ageSeconds` is gated behind `includeDetail` (bearer token) per `src/app/api/health/route.ts:347-357`. |
| `/api/health/sources` | 200 | 2301 | 0.62 | `fetchedAt,options,sources,summary` | Per-source freshness array. |
| `/api/health/portal` | 200 | 71 | 0.93 | `manifest_valid,ok,portal_version,tool_count` | MCP portal manifest health. |
| `/api/health/cron-activity` | 200 | 100 | 0.33 | `entries,summary` | |
| `/api/repos` | 200 | 49 809 | 0.87 | `meta,repos` | Trending repo list. |
| `/api/repos/vercel/next.js` | 200 | 67 235 | 3.70 | `fetchedAt,freshness,funding,ideas,mentions,npm,ok,prediction,productHunt,reasons,related,repo,revenue,score,twitter,v` | Full repo card payload. |
| `/api/repos/vercel/next.js/freshness` | 200 | 667 | 1.13 | `fetchedAt,ok,sources` | |
| `/api/repos/vercel/next.js/aiso` | 200 | 45 | 1.55 | `lastScanAt,ok,status` | `status="none"`, `lastScanAt=null` (no AISO scan run yet). |
| `/api/repos/vercel/next.js/mentions` | 200 | 33 921 | 1.52 | `count,fetchedAt,items,nextCursor,ok,repo` | |
| `/api/search?q=react` | 200 | 47 424 | 0.78 | `meta,results` | |
| `/api/pipeline/status` | 503 | 3 608 | 1.73 | `ageSeconds,collectionCoverage,collectionRankingsFetchedAt,computedAt,coveragePct,degradedSources,healthStatus,healthy,hotCollectionsFetchedAt,lastFetchedAt,rateLimitRemaining,recentReposFetchedAt,repoCount,repoMetadata,repoMetadataFetchedAt,scoreCount,seeded,snapshotCount,sourceStatus,sources,stale,stats` | 503 is **expected**: body has `healthy=false, healthStatus="stale"` because `repoMetadata` is stale (>24h since cron). Notable: this endpoint **does** surface `ageSeconds` for unauthenticated callers (different gate than `/api/health`). |
| `/api/pipeline/meta-counts` | 200 | 113 | 0.57 | `counts` | |
| `/api/pipeline/sidebar-data` | 200 | 526 995 | 3.25 | `availableLanguages,categoryStats,generatedAt,metaCounts,reposById,sourceCounts,trendingReposCount,unreadAlerts` | Largest payload (~514 KB). |
| `/api/pipeline/featured` | 200 | 17 289 | 0.89 | `cards,generatedAt` | |
| `/api/pipeline/freshness` | 200 | 2 707 | 0.39 | `degradedSources,sources,status` | |
| `/api/pipeline/alerts` | 200 | 39 | 0.83 | `events,ok,unreadCount` | Empty event list. |
| `/api/pipeline/alerts/rules` | 200 | 1 006 | 0.46 | `ok,rules,suggestions` | |
| `/api/compare?repos=vercel/next.js,facebook/react` | 200 | 86 929 | 1.63 | `fetchedAt,ok,repos` | |
| `/api/compare/github?repos=vercel/next.js,facebook/react` | 200 | 13 320 | 3.53 | `bundles,fetchedAt,ok` | |
| `/api/collections` | 200 | 8 050 | 0.99 | `collections,coverage,meta` | |
| `/api/collections/artificial-intelligence` | 200 | 13 415 | 1.58 | `collection,coverage,curatedMissingFromTrending,hotCollection,rankingByIssues,rankingByStars,sources,upstreamIssuesOutsideCurated,upstreamStarsOutsideCurated` | |
| `/api/categories` | 200 | 3 880 | 1.07 | `categories` | Array under `categories`. |
| `/api/ideas` | 200 | 45 | 0.47 | `ideas,ok,sort,total` | `total=0`, `ideas=[]`. |
| `/api/twitter/leaderboard` | 200 | 46 058 | 1.01 | `generatedAt,mode,rows,stats` | |
| `/api/twitter/repos/vercel/next.js` | 404 | 56 | 1.37 | `error,ok` | `{"ok":false,"error":"Twitter signal not found for repo"}` — expected for repos without a recent scan. |
| `/api/predict` | 400 | 55 | 0.80 | `error,ok` | `{"ok":false,"error":"repo query parameter is required"}` — endpoint requires `?repo=`. |
| `/api/predict/calibration` | 200 | 65 | 0.46 | `fetchedAt,ok,summaries` | |
| `/api/profile/vercel` | 200 | 172 | 1.06 | `ok,profile` | |
| `/api/openapi.json` | 200 | 55 660 | 0.55 | `components,info,openapi,paths,security,servers,tags` | |
| `/api/auth/session` | 200 | 12 | 0.75 | `ok` | `{"ok":false}` — no session cookie sent. |
| `/api/reactions` | 400 | 59 | 0.74 | `error,ok` | `{"ok":false,"error":"objectId query parameter is required"}`. |
| `/api/repo-submissions` | 200 | 133 | 1.58 | `ok,queue,submissions` | |
| `/api/watchlist/private` | 402 | 116 | 1.21 | `code,error,ok,upgradeUrl` | `{"ok":false,"error":"private-watchlist is a Pro-tier feature","code":"PAYMENT_REQUIRED","upgradeUrl":"/pricing#pro"}` — paywalled by design. |
| `/api/mcp/usage` | 200 | 123 | 0.55 | `month,ok,records,summary` | |
| `/api/export/csv` | 405 | 0 | 0.62 | (no body) | GET not allowed; expects POST. |
| `/api/tools/revenue-estimate` | 200 | 222 | 0.71 | `ok,result` | |
| `/api/submissions/revenue` | 200 | 28 | 0.62 | `ok,submissions` | |
| `/api/stream` | 200 | 153 | 12.01 | (SSE) | `event: ready` then long-poll. Hit the 12s `--max-time` ceiling — SSE by design. Body: `event: ready\ndata: {"at":"2026-04-27T16:50:44.330Z","types":["rank_changed","breakout_detected","snapshot_captured","alert_triggered"],"subscribers":1}`. |

### Status distribution

| Class | Count | Endpoints |
|---|---|---|
| 2xx | 33 | (all 200; SSE included) |
| 4xx (expected) | 5 | `/api/predict` (400 missing `?repo=`), `/api/reactions` (400 missing `?objectId=`), `/api/twitter/repos/vercel/next.js` (404 no signal), `/api/watchlist/private` (402 paywall), `/api/export/csv` (405 wrong method) |
| 5xx (expected) | 2 | `/api/health` (503 stale gate), `/api/pipeline/status` (503 `repoMetadata` stale ~24h) |
| **Total** | **39** | |

No unexpected 5xx. Both 503s are intentional health-gate responses (the JSON body itself is a valid health document that downstream code can parse) — they fire when one of the cron-driven sources has not refreshed within its `staleAfterSeconds` window.

## Failures

None requiring code changes. Categorisation:

- **Expected 4xx** — input-validation 400s, tier-gated 402, missing-resource 404, method-not-allowed 405. All return well-formed JSON error envelopes (`{ok:false, error, ...}`).
- **Expected 503** — `/api/health` and `/api/pipeline/status` returning `503` with `status:"stale"` and `healthy:false` is the documented contract; uptime monitors are supposed to read it that way. The reason in this run: `repoMetadataFetchedAt = 2026-04-27T14:37:47Z` is older than the 2h staleness threshold for several sources (cron activity gap during this dev session).
- **No 5xx surprise** — zero internal-error 500s observed during the 39-endpoint sweep.

## FreshBadge contract

**Soft side: PASS.** `/api/health?soft=1` returns 200 with a body that contains `status` (value `"stale"`) and **does not** contain `ageSeconds` — exactly the shape FreshBadge soft-mode consumes (see `src/components/layout/FreshBadge.tsx`).

**Full side: INDETERMINATE.** `/api/health` (no `soft`) **also** lacks `ageSeconds` for unauthenticated callers — confirmed both empirically (byte-identical body to soft) and by code (`route.ts:347-357` strips `ageSeconds`, `sources`, `circuitBreakers`, `degradedSources`, `stale`, `thresholdSeconds`, `collectionCoverage`, `repoMetadata` whenever `includeDetail` is false; `includeDetail` requires the bearer token in `HEALTH_BEARER_TOKEN`). Per the task's hard rule "DO NOT pass auth cookies", the full-side assertion cannot be verified from this probe. To exercise it, re-run with `Authorization: Bearer $HEALTH_BEARER_TOKEN` against `/api/health` and assert `ageSeconds` is present.

**Net verdict (FreshBadge UI consumer): PASS.** The component only ever calls the soft endpoint, and that contract holds.

## Coverage

Probed **39 / 39** queued endpoints. Same queue as the prior partial run. No gaps.

### Intentionally skipped (per task rules)

| Path prefix | Reason |
|---|---|
| `/api/admin/*` | Cookie-gated admin session |
| `/api/cron/*` | Require `CRON_SECRET` header |
| `/api/webhooks/*` | Require external POST signatures |
| `/api/internal/*` | Auth-gated internal surface |
| `/api/mcp/*` (POST routes) | Specific POST bodies; only the GET `/api/mcp/usage` was probed |
| `/api/checkout/stripe` | Would create real Stripe sessions |

## Hard rules adhered to

- No `/api/` route code modified.
- GET-only — no POST/PATCH/DELETE.
- No cookies, secrets, or admin tokens included.
- Single retry on cold-compile / `HTTP=000` (none triggered — no endpoint exceeded 12 s except `/api/stream` which is SSE by design).
- Dev server left running on `:3099` for the user (despite its post-sweep cache hiccup; restart with `rm -rf .next && npx next dev -p 3099` if the OneDrive churn keeps eating `routes-manifest.json`).
