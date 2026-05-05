# AGN-361 Redis/Worker Runtime Health Evidence Pack (2026-05-04)

## Scope
- Issue: AGN-361
- Heartbeat timestamp (UTC): 2026-05-04T12:09:36.923Z to 2026-05-04T12:09:49.808Z
- Operator: [OPS] Release SRE

## Mandatory preflight result
Command:
- `npm run freshness:check`

Result:
- `localhost:3023` reachable (not missing)
- `health=ok`, `sourceStatus=degraded`
- Summary: `green=44 yellow=1 red=0 dead=5 blocking_non_green=5 advisory_non_green=1`
- Blocking non-green rows: `category-metrics` (DEAD), `mcp-downloads` (DEAD), `star-snapshots` (DEAD), `trending-repos` (DEAD), `producthunt` (YELLOW)
- Additional gate: `Sentry: MISSING`

## Railway worker runtime evidence (live)
Commands:
- `railway status`
- `curl https://trendingrepo-worker-production.up.railway.app/healthz`

Evidence:
- Railway service target: `project=starscreener`, `environment=production`, `service=trendingrepo-worker`
- Worker `/healthz` response:
  - `ok=true`
  - `db=true`
  - `redis=true`
  - `lastCheckAt=2026-05-04T12:09:49.808Z`
  - `lastRunAt=2026-05-04T12:00:17.779Z`

Interpretation:
- Railway runtime and Redis connectivity are currently healthy.
- Current release risk is not a worker process outage; risk is stale/dead freshness rows and failing CI workflow lanes.

## GitHub Actions runtime evidence
Command:
- `gh run list --workflow trendingrepo-worker.yml --limit 5 --json databaseId,status,conclusion,createdAt,updatedAt,headSha,url`

Latest 5 worker workflow runs:
- failure: run `25318106172` (2026-05-04T12:08:30Z, sha `16266082636967df6aa783d5c2dc3c99ede0051f`)
- failure: run `25317228947` (2026-05-04T11:48:09Z, sha `457224a2f130bb2926922fd3d901423e4e277fea`)
- failure: run `25314893068` (2026-05-04T10:51:04Z, sha `e05cc39e4962ac1e36f8caf9b0493bc34f77db6c`)
- failure: run `25312478200` (2026-05-04T09:52:10Z, sha `798e489c4512dd829f663be0d00762a3b3ac3b2b`)
- failure: run `25312472916` (2026-05-04T09:52:03Z, sha `9f5eb8bf492f557b6425f4d199600e64c7d48dea`)

Command:
- `gh run list --workflow scrape-trending.yml --limit 5 --json databaseId,status,conclusion,createdAt,updatedAt,headSha,url`

Latest scrape-trending runs:
- failure: run `25314259155` (2026-05-04T10:35:41Z, sha `1529ae5f90b5e795451f15c8921b7277258894cf`)
- success: run `25309567069` (2026-05-04T08:43:35Z, sha `a244904295deb7b7243f6166c4057bf8187c6afc`)
- success: run `25300648823` (2026-05-04T04:13:09Z, sha `03281ed64eeefafc845df4e5e87f09c792da729c`)
- success: run `25294718845` (2026-05-04T00:06:46Z, sha `244d0ef75ba13200f90d6dd3b144ba74bac10e62`)
- success: run `25293461002` (2026-05-03T23:07:03Z, sha `77f31b772fbbe71c9483116f423df1fe7fdd04e9`)

## Release verification decision
- Worker runtime: UP (db/redis healthy)
- Deploy/data freshness gate: NOT PASSING (`blocking_non_green=5`, `Sentry: MISSING`)
- Production state is degraded due to stale/dead freshness rows, not confirmed worker outage.

## Rollback readiness
If latest deploy is suspected bad, use last known successful scrape-trending SHA as rollback candidate:
- Candidate SHA: `a244904295deb7b7243f6166c4057bf8187c6afc` (run `25309567069`)

Rollback path:
1. In Vercel project, promote/rollback to deployment built from candidate SHA above.
2. Re-run freshness gate: `npm run freshness:check` and verify `blocking_non_green=0`.
3. Verify worker health again: `/healthz` must keep `ok=true db=true redis=true`.
4. Re-check critical cron lane (`scrape-trending.yml`) for a new successful run after rollback.

## Open blocker owners
- Platform engineer: recover blocking sources (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`) and `producthunt` freshness budget.
- CTO/platform: provision Vercel `SENTRY_DSN` and attach canary evidence.

---

## 2026-05-05 heartbeat delta (resume run)

### Freshness gate (local)
Command:
- `npm run freshness:check`

Result:
- Failed immediately: `GET http://localhost:3023/api/health?soft=1 -> HTTP 500 Internal Server Error`
- Interpretation: localhost process is reachable, but freshness health endpoint is currently broken for this run; no source table was produced.

### Railway worker runtime (live)
Command:
- `curl https://trendingrepo-worker-production.up.railway.app/healthz`

Result:
- `ok=true`, `db=true`, `redis=true`
- `lastCheckAt=2026-05-04T18:11:17.965Z`
- `lastRunAt=2026-05-04T18:11:00.002Z`

Interpretation:
- Worker runtime and Redis connectivity remain healthy despite local freshness route failure.

### GitHub Actions live inspection attempt
Commands:
- `gh run list --workflow trendingrepo-worker.yml --limit 5 ...`
- `gh run list --workflow scrape-trending.yml --limit 5 ...`

Result:
- Both commands failed with `HTTP 401: Bad credentials`.

Interpretation:
- Workflow state could not be re-verified live in this heartbeat due GitHub auth failure.

### Updated blockers for AGN-361 closure
- Platform engineer: fix local freshness health endpoint regression (`/api/health?soft=1` currently HTTP 500 in this heartbeat).
- Release/Platform owner: restore `gh` authentication or provide a valid GitHub token path for workflow inspection.
