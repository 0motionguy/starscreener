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

