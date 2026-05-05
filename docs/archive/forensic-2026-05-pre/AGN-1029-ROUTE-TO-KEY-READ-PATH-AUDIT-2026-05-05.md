# AGN-1029 Route-to-key Read-path Audit (2026-05-05)

## Scope
- Issue: `AGN-1029` (`[Sprint 1 audit] Data Pipeline route-to-key read-path audit`)
- Agent scope: Data Pipeline (freshness + data-store read-path truth)
- Workspace: `C:\Users\mirko\OneDrive\Desktop\STARSCREENER`

## Mandatory opening + freshness proof
- Re-read completed: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` (2026-05-05 heartbeat):
  - Exit: `1`
  - Error: `freshness-check: GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
  - Classification: localhost:3023 is reachable (not missing), but product is stale/degraded.

## Verification commands
- `node --test src/lib/pipeline/__tests__/api-data-store-consumers.test.ts`
- `rg -n "refresh[A-Za-z0-9]+FromStore|getDerivedRepos\\(|getDerivedRepoByFullName\\(|getTwitter(?:RepoPanel|Leaderboard|TrendingRepoLeaderboard|OverviewStats|AdminReview|ScanCandidates)\\(" src/app/api src/lib`
- `Get-Content src/lib/pipeline/__tests__/api-data-store-consumers.test.ts`
- `rg -n "refreshTrendingFromStore|refreshHackernewsTrendingFromStore|refreshBlueskyTrendingFromStore|refreshDevtoTrendingFromStore|refreshLobstersTrendingFromStore|refreshDevtoMentionsFromStore|refreshLobstersMentionsFromStore|refreshTwitterSignalsFromStore|getDerivedRepos\\(|getTwitterTrendingRepoLeaderboard|getTwitterLeaderboard|getTwitterOverviewStats" src/app/page.tsx src/app/signals/page.tsx src/app/lobsters/page.tsx src/app/devto/page.tsx src/app/twitter/page.tsx`
- `rg -n "read<" src/lib/trending.ts src/lib/hackernews-trending.ts src/lib/bluesky-trending.ts src/lib/devto-trending.ts src/lib/lobsters-trending.ts src/lib/devto.ts src/lib/lobsters.ts src/lib/twitter/signal-data.ts`
- `rg -n "readFileSync\\(|fs\\.readFile|promises\\.readFile" src/app/page.tsx src/app/signals/page.tsx src/app/lobsters/page.tsx src/app/devto/page.tsx src/app/twitter/page.tsx src/lib/trending.ts src/lib/hackernews-trending.ts src/lib/bluesky-trending.ts src/lib/devto-trending.ts src/lib/lobsters-trending.ts src/lib/twitter/signal-data.ts`
- `rg -n "getAllRedditPosts\\(|refreshRedditAllPostsFromStore\\(|refreshRedditMentionsFromStore\\(" src/lib/reddit-data.ts src/lib/reddit-all-data.ts src/app/signals/page.tsx`

## Route-to-key map (requested routes)

### `/` (home)
- Route read path:
  - `src/app/page.tsx:704` calls `getDerivedRepos()` with no route-level `refreshXxxFromStore()` preload.
- Underlying keys read by `getDerivedRepos()`:
  - via `src/lib/trending.ts:206-207`: `trending`, `deltas` (when `refreshTrendingFromStore()` is called elsewhere)
  - `getDerivedRepos()` itself is sync/in-memory assembly (`src/lib/derived-repos.ts:101`) over imported bundled datasets + cached versions.
- Classification:
  - **Bypass risk (medium)** at route-level freshness preload for this page path.

### `/signals`
- Route refresh calls:
  - `src/app/signals/page.tsx:190-196` calls:
    - `refreshTrendingFromStore()` -> keys `trending`, `deltas`
    - `refreshHackernewsTrendingFromStore()` -> key `hackernews-trending`
    - `refreshBlueskyTrendingFromStore()` -> key `bluesky-trending`
    - `refreshDevtoTrendingFromStore()` -> key `devto-trending`
    - `refreshTwitterSignalsFromStore()` -> key `twitter-repo-signals`
    - plus RSS refreshes (non-owned for this issue)
- Route getter calls:
  - `src/app/signals/page.tsx:203` uses `getAllRedditPosts()` without a paired reddit refresh call in this route.
- Classification:
  - **Bypass risk (medium)** for reddit freshness preload on this route.

### `/lobsters`
- Route refresh calls:
  - `src/app/lobsters/page.tsx:75-76`
    - `refreshLobstersTrendingFromStore()` -> key `lobsters-trending`
    - `refreshLobstersMentionsFromStore()` -> key `lobsters-mentions`
- Classification:
  - **Compliant** for route-level preload.

### `/devto`
- Route refresh calls:
  - `src/app/devto/page.tsx:75-76`
    - `refreshDevtoTrendingFromStore()` -> key `devto-trending`
    - `refreshDevtoMentionsFromStore()` -> key `devto-mentions`
- Classification:
  - **Compliant** for route-level preload.

### `/twitter`
- Route refresh calls:
  - `src/app/twitter/page.tsx:320`
    - `refreshTwitterSignalsFromStore()` -> key `twitter-repo-signals`
- Route getter calls after preload:
  - `src/app/twitter/page.tsx:323-326`
    - `getTwitterTrendingRepoLeaderboard()`, `getTwitterLeaderboard()`, `getTwitterOverviewStats()`
- Classification:
  - **Compliant** for route-level preload.

## Direct file/in-memory bypass inventory

1. `src/lib/twitter/signal-data.ts:47`
- `readFileSync(TWITTER_SIGNALS_PATH, "utf8")` from `.data/twitter-repo-signals.jsonl`.
- Notes: fallback path exists intentionally, but this is a direct file read path (not data-store).

2. `src/app/page.tsx:704` + `src/lib/derived-repos.ts:101`
- Home route reads `getDerivedRepos()` without explicit route-level `refreshXxxFromStore()` call.
- Notes: derived cache can serve bundled/in-memory state unless refreshed in-process by another path.

3. `src/app/signals/page.tsx:203` + `src/lib/reddit-data.ts:213`
- Signals route reads reddit posts via sync getter `getAllRedditPosts()` while this route does not call `refreshRedditMentionsFromStore()` or `refreshRedditAllPostsFromStore()`.
- Notes: creates stale-window risk for reddit panel relative to other refreshed panels on `/signals`.

## Minimal fix list with risk levels

1. Add explicit home preload triplet before `getDerivedRepos()` on `/`:
- `refreshTrendingFromStore()`, `refreshRecentReposFromStore()`, `refreshRepoMetadataFromStore()`.
- Risk level: **medium** (freshness correctness; low functional regression risk if done in existing preload pattern).

2. Add reddit preload in `/signals` before `getAllRedditPosts()`:
- Prefer `refreshRedditAllPostsFromStore()` (and optionally `refreshRedditMentionsFromStore()` if both feeds are needed by downstream joins).
- Risk level: **medium** (consistency across panels; small latency increase).

3. Keep twitter fallback file-read path but gate and log source path:
- Preserve current graceful fallback, but add explicit instrumentation/source label in telemetry for `redis|file|memory`.
- Risk level: **low** (observability improvement, no behavior change required).

## Route-to-key guardrail status (live)
Guard test result:
- `API data-store consumer compliance` = **FAIL**
- `Twitter page preloads twitter signals from data-store` = **PASS**

Violation count from test output:
- **58 missing refresh preloads** in API routes using sync getters.

Highest-frequency violation groups:
1. `derived-repos` getters used without full preload triplet:
   - required: `refreshTrendingFromStore()`, `refreshRecentReposFromStore()`, `refreshRepoMetadataFromStore()`
2. `twitter-signals` getters used without:
   - required: `refreshTwitterSignalsFromStore()`

Representative violating routes from live test output:
- `src/app/api/collections/route.ts`
- `src/app/api/collections/[slug]/route.ts`
- `src/app/api/compare/route.ts`
- `src/app/api/cron/predictions/route.ts`
- `src/app/api/cron/twitter-daily/route.ts`
- `src/app/api/export/csv/route.ts`
- `src/app/api/pipeline/featured/route.ts`
- `src/app/api/pipeline/ingest/route.ts`
- `src/app/api/repos/[owner]/[name]/mentions/route.ts`
- `src/app/api/repos/[owner]/[name]/route.ts`

Twitter-specific misses called out by the test:
- `src/app/api/repos/[owner]/[name]/mentions/route.ts` missing `refreshTwitterSignalsFromStore()`
- `src/app/api/repos/[owner]/[name]/route.ts` missing `refreshTwitterSignalsFromStore()`

## Data Pipeline finding
- Read-path policy exists and is codified in `src/lib/pipeline/__tests__/api-data-store-consumers.test.ts`, but enforcement currently fails in 58 API route cases.
- This is measurable, current drift between route-level getters and mandatory data-store refresh preload calls.

## Suggested execution split (for implementation heartbeat)
- Add refresh preload triplets to failing `derived-repos` API routes.
- Add `refreshTwitterSignalsFromStore()` preload where twitter getters are used.
- Re-run `node --test src/lib/pipeline/__tests__/api-data-store-consumers.test.ts` until PASS.
