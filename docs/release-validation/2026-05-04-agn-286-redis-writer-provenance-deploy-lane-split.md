# AGN-286 - Redis writer provenance and deploy-lane split

Date: 2026-05-04
Owner lane: Release SRE
Issue: AGN-286

## Scope checked
- `.github/workflows/**` lane ownership and run state
- Redis writer provenance in both app/script and Railway worker writers
- `next.config.ts` deploy-sensitive behavior
- Local freshness gate status (`npm run freshness:check`)

## Mandatory preflight evidence
- `npm run freshness:check` at `2026-05-04T11:05:06.802Z`
  - `localhost:3023` reachable (not missing)
  - summary: `green=45 yellow=0 red=0 dead=5 blocking_non_green=4 advisory_non_green=1`
  - blocking DEAD keys: `category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`
  - advisory DEAD key: `model-usage`
  - `Sentry: MISSING`

Conclusion: product is stale/degraded, not a localhost-missing outage.

## Provenance verification

### GHA/script writer
- File: `scripts/_data-store-write.mjs`
- Verified behavior:
  - writes payload to `ss:data:v1:<slug>` and meta to `ss:meta:v1:<slug>`
  - meta includes JSON provenance when present:
    - `writer` auto-derived from `GITHUB_WORKFLOW` as `github-actions:<workflow>`
    - `runId` from `GITHUB_RUN_ID`
    - `commit` from short `GITHUB_SHA`
  - fallback remains bare ISO string for back-compat

### Railway worker writer
- File: `apps/trendingrepo-worker/src/lib/redis.ts`
- Verified behavior:
  - writes same namespaces: `ss:data:v1` / `ss:meta:v1`
  - meta includes JSON provenance with:
    - `writer` derived from `setCurrentFetcherName()` as `worker:<fetcher>`
    - optional `runId`, `commit`
- File: `apps/trendingrepo-worker/src/run.ts`
  - confirms fetcher context sets/clears provenance name around each run

Result: AGN-286 provenance gap is closed in code paths for both lanes.

## Deploy-lane split evidence

### Lane A - GHA collector lane (scripts)
- Example: `.github/workflows/scrape-trending.yml`
  - runs `node scripts/*.mjs` with `REDIS_URL`
  - commits data artifacts back to git via `git-commit-data` action

### Lane B - worker lane (Railway code invoked by workflow)
- Example: `.github/workflows/refresh-mcp-dependents.yml`
  - runs from `apps/trendingrepo-worker`
  - executes `npx tsx src/index.ts npm-dependents`
  - no git data commit step

Interpretation: lanes are code-path split, but both write same Redis namespaces; last writer still wins by design.

## Live workflow state sample
- `gh run list --limit 20` shows several current failures (CI, Collect Twitter Signals, Refresh fast discovery, Source health watch, etc.)
- `gh run list --workflow scrape-trending.yml --limit 5`:
  - latest failed at `2026-05-04T10:35:41Z`
  - previous four runs succeeded
- `gh run list --workflow refresh-mcp-dependents.yml --limit 5`:
  - latest five runs succeeded

## Deploy-sensitive config check
- `next.config.ts` verified:
  - production wraps with Sentry plugin only when `NODE_ENV=production`
  - canonical host redirects (`www.trendingrepo.com`, `starscreener.vercel.app` -> `trendingrepo.com`)
  - output tracing includes `.data/twitter-*.jsonl` and excludes non-runtime folders
  - no Release-SRE-lane config drift detected in this heartbeat

## Rollback readiness
- If provenance metadata causes parser regressions:
  1. Keep payload namespace unchanged (`ss:data:v1:*`).
  2. Revert meta writes to bare ISO timestamp only (both writers), preserving key names.
  3. Re-run one GHA collector and one worker fetcher; confirm freshness metadata recovers.
- If lane contention causes stale key flips:
  1. Disable one conflicting writer path at workflow level (per-key) temporarily.
  2. Force a single writer rerun for the affected key family.
  3. Validate with freshness check + key timestamp comparison.

## Heartbeat outcome
- AGN-286 verification artifacts updated in release-validation docs.
- System remains degraded on freshness blockers and missing Sentry readiness; no deploy action taken in this heartbeat.
