# AGN-222: Freshness Gate Infra Dependency Map (localhost/prod)

Timestamp: 2026-05-04T17:28+08:00
Operator: Release SRE

## Mandatory opener evidence
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Command: `npm run freshness:check`
- Result: localhost is reachable, but freshness is failing due to blocking DEAD sources.

## Freshness gate result (local)
Command:
```powershell
npm run freshness:check
```

Observed:
- target: `http://localhost:3023`
- `health=ok sourceStatus=degraded`
- summary: `green=46 yellow=0 red=0 dead=4 blocking_non_green=4 advisory_non_green=0`
- blocking DEAD sources:
  - `category-metrics`
  - `mcp-downloads`
  - `star-snapshots`
  - `trending-repos`

Interpretation:
- `localhost:3023` is **not missing** in this heartbeat.
- Product is **stale/degraded** due to freshness-state dependency failures.

## Production probe split (stale deploy vs code failure)
Command:
```powershell
npm run freshness:check -- --prod --timeout-ms 30000
```

Observed:
- `GET https://trendingrepo.com/api/cron/freshness/state` -> `HTTP 401 unauthorized`

Interpretation:
- Production freshness endpoint is reachable and auth-protected.
- From this shell, prod freshness-state cannot be fully evaluated without cron auth context.
- This is an auth-context limitation, not proof of runtime crash.

## Infra dependency map (for current DEAD rows)
Source specs are defined in `src/app/api/cron/freshness/state/route.ts`.

1. `category-metrics`
- Keys: `category-metrics-snapshot:{24h,7d,30d,hourly-history}`
- Producer path: `scripts/snapshot-category-metrics.mjs`
- Workflow wiring: `.github/workflows/scrape-trending.yml` (snapshot step after core scrape)
- Failure mode for freshness: any required key missing/stale marks source non-green.

2. `star-snapshots`
- Keys: `star-snapshot:{24h,7d,30d,hourly-history}`
- Producer path: `scripts/snapshot-stars.mjs`
- Workflow wiring: `.github/workflows/scrape-trending.yml` (snapshot step)
- Failure mode for freshness: missing one or more required keys marks DEAD.

3. `mcp-downloads`
- Keys: `mcp-downloads`, `mcp-downloads-pypi`
- Producer paths: worker fetchers via `apps/trendingrepo-worker`
- Workflow wiring:
  - `.github/workflows/refresh-npm-downloads.yml`
  - `.github/workflows/refresh-pypi-downloads.yml`
- Failure mode for freshness: both keys must be present/fresh enough for GREEN.

4. `trending-repos`
- Key set in freshness route: `trending` + `trending-lite` and `_meta/trending`
- Primary producer: `scripts/scrape-trending.mjs` via `.github/workflows/scrape-trending.yml`
- Freshness behavior: route uses the oldest required timestamp in the source group; one stale/missing sibling can downgrade entire source.

## Live workflow sample (current heartbeat)
From `gh run list --limit 20`:
- `Audit - source freshness`: `success` (2026-05-04T09:16:19Z)
- `Refresh fast discovery`: `success` (2026-05-04T08:43:35Z)
- `Refresh collection rankings`: `success` (2026-05-04T08:42:06Z)
- `Refresh dev.to signals`: `success` (2026-05-04T08:36:36Z)
- `Refresh npm downloads`: `success` (2026-05-04T08:43:28Z)
- `Refresh pypi downloads`: `success` (2026-05-04T09:04:08Z)
- `CI`: currently `in_progress`

## Deploy-sensitive config check
`next.config.ts` review confirms:
- Canonical host redirect to `https://trendingrepo.com`
- Sentry wrapper enabled only in production build path
- Output tracing includes `.data/twitter-*.jsonl`
- No direct change required for AGN-222; issue is freshness dependency state, not Next deploy config drift.

## Rollback readiness
If a fresh deploy regresses freshness behavior:
1. Promote previous known-good Vercel deployment.
2. Re-run local gate:
   - `npm run freshness:check`
3. Re-run prod gate from auth-enabled environment:
   - `npm run freshness:check -- --prod --timeout-ms 30000`
4. If rollback does not clear non-green rows, treat as cron/data producer drift (not deploy regression), and hand off to workflow owners for the failing key group.

## Actionable next owner split
- Platform/collector owners:
  - `scrape-trending.yml` snapshot stages (`category-metrics`, `star-snapshots`, `trending-lite` path)
  - `refresh-npm-downloads.yml` + `refresh-pypi-downloads.yml` (`mcp-downloads` pair)
- CTO/platform:
  - provide authenticated prod freshness-check context in SRE shell if production parity evidence is required from CLI.
