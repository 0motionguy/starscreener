---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-183 Release SRE heartbeat - Railway worker and Redis operational drift check

Date: 2026-05-04
Issue: AGN-183
Owner: [OPS] Release SRE

## Mandatory opener evidence

- Read completed: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` executed at `2026-05-04T08:28:09.969Z`.
- Local target state: `localhost:3023` reachable.
- Result: `green=50 yellow=0 red=0 dead=0 blocking_non_green=0`.
- Important nuance: health still reports `stale`/`degraded` because `Sentry: MISSING`.

## Live ops evidence

### Railway worker

- `railway status`:
  - Project: `starscreener`
  - Environment: `production`
  - Service: `trendingrepo-worker`
- `railway domain`:
  - `https://trendingrepo-worker-production.up.railway.app`
- `GET /healthz`:
  - `{"ok":true,"db":true,"redis":true,"lastCheckAt":"2026-05-04T08:28:41.632Z","lastRunAt":"2026-05-04T08:27:00.264Z"}`

Interpretation: worker runtime, DB, and Redis connectivity are healthy at check time.

### Redis operational check

- `npm run verify:data-store` failed locally due to missing credentials in the shell:
  - `No Redis credentials in env.`
  - Requires `REDIS_URL` or (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`).
- Worker `healthz` confirms production Redis connectivity is currently healthy.

Interpretation: no production Redis outage signal from worker health; local direct Redis verification is blocked by missing local secret injection.

### Cron/workflow live state

From `gh run list --limit 20 --json workflowName,status,conclusion,createdAt,...`:

- Success examples:
  - `Collect Twitter Signals` success at `2026-05-04T08:12:30Z`
  - `Source health watch` success at `2026-05-04T08:04:25Z`
  - `Uptime monitor (every 5 minutes)` success at `2026-05-04T08:14:13Z`
  - `trendingrepo-worker` success at `2026-05-04T07:55:35Z`
- Failure still present:
  - `Cron - freshness check` failure at `2026-05-04T07:45:27Z`

Interpretation: cron fleet is mostly active with recent successes, but freshness cron still needs follow-up.

### Production endpoint signal

- `GET https://trendingrepo.com/api/health?soft=1` returned:
  - `status=stale`
  - `sourceStatus=degraded`
  - with recent source timestamps.
- `GET https://trendingrepo.com/api/cron/freshness/state?format=json` returned `401 Unauthorized`.

Interpretation: this is stale/degraded platform signal, not a hard runtime crash. Freshness-state endpoint access requires auth/secret context.

## Deploy-state and rollback readiness

### Vercel deploy-state visibility

- `vercel ls --yes` failed in this shell with:
  - `You specified VERCEL_PROJECT_ID but you forgot to specify VERCEL_ORG_ID.`

Impact: direct Vercel deployment-state verification from this heartbeat shell is blocked by missing local Vercel org context.

### Rollback path (documented)

1. Identify last known-good GitHub SHA from recent successful CI/workflow runs.
2. In Vercel, promote/redeploy that commit for production (`trendingrepo.com`).
3. Re-run post-rollback checks:
   - `GET /api/health?soft=1`
   - `GET worker /healthz`
   - `gh run list` for `Cron - freshness check`, `Collect Twitter Signals`, and `Source health watch`.
4. If freshness remains degraded after rollback, treat as data/cron drift rather than deploy regression and hand off to collector owners.

This separates stale-data/cron drift from code-deploy regressions.

## Drift delta (resume heartbeat)

Resume check time: `2026-05-04T15:38Z`

### New observed drift vs previous heartbeat

- `npm run freshness:check` now fails locally:
  - `green=47 yellow=3 red=0 dead=0 blocking_non_green=3`
  - blocking yellow sources: `npm`, `producthunt`, `trending-repos`.
- Production `GET /api/health?soft=1` now returns:
  - `status=ok`
  - `sourceStatus=degraded`
  - warning indicates cached health snapshot and failed dependency refresh attempts.
- Railway worker remains healthy:
  - `ok=true db=true redis=true` at `2026-05-04T15:37:56.505Z`.
- Access drift increased:
  - Vercel CLI still blocked (`VERCEL_ORG_ID` missing).
  - GitHub CLI now blocked (`gh run list` returns `401 Bad credentials`).

### Reconciliation against docs/ENGINE.md assumptions

- ENGINE assumes high-cadence cron observability and active GitHub Actions verification; current shell cannot prove this live because GitHub auth is invalid.
- ENGINE positions Redis-backed fallback behavior as resilience; current production health confirms degraded-but-serving mode (cached snapshot), consistent with fallback design.
- ENGINE expects deploy-state/operator visibility; current Vercel org-context gap violates that assumption for this operator shell.

### Actionable follow-up tasks (owner + done condition)

1. Platform/CTO: restore operator Vercel context by setting `VERCEL_ORG_ID` (matching `VERCEL_PROJECT_ID`) in the run environment.
   - Done when `vercel ls --yes` succeeds and latest production deployment state is attached to AGN-183 evidence.
2. Platform/CTO: rotate or re-auth GitHub CLI token for this runtime.
   - Done when `gh run list --limit 20` succeeds and latest `Cron - freshness check` run conclusions are attached to AGN-183 evidence.
3. Data pipeline owner: triage freshness regression on `trending-repos`, `producthunt`, and `npm`.
   - Done when `npm run freshness:check` returns `blocking_non_green=0` with timestamped evidence.
4. Release SRE: verify stale-vs-code-failure classification after steps 1-3.
   - Done when AGN-183 includes side-by-side evidence for app health, worker health, cron state, and deploy state in one heartbeat.

## Re-queue retry result (comment-driven)

Trigger comment: `Re-queue: bumped concurrency to 5, retry now`

### Resolved access checks (with command-scope env correction)

- GitHub Actions visibility restored by clearing invalid env token for the command scope:
  - `gh run list --limit 20 --json ...` succeeded.
  - Current evidence shows mixed health: recent successes and multiple failures (for example `Audit - source freshness` failed at `2026-05-04T16:00:57Z`).
- Vercel deploy visibility restored by aligning env with `.vercel/project.json` for command scope:
  - Set `VERCEL_PROJECT_ID=prj_ycY0bM38UMyAl9jPcAgrmQGUc4tQ`
  - Set `VERCEL_ORG_ID=team_NrVhqhXUDEYB9YOWaqkBIQ4w`
  - `vercel ls --yes` succeeded; production has recent `Ready` deploys plus several prior `Error` deploys.

### Railway/Redis operational evidence

- Worker health remains good:
  - `{"ok":true,"db":true,"redis":true,"lastRunAt":"2026-05-04T16:00:03.356Z"}`
- Redis round-trip verification now passes locally:
  - `npm run verify:data-store` succeeded end-to-end (write, read, metadata, cleanup).

### Freshness and stale/degraded distinction

- Mandatory local freshness check now reports localhost missing:
  - `npm run freshness:check` -> `ECONNREFUSED` for `http://localhost:3023`.
- Production health endpoint remains serving:
  - `/api/health?soft=1` -> `status=ok`, `sourceStatus=degraded`, warning on scanner quality.

Interpretation: this heartbeat confirms platform is serving in production with degraded source quality while local preflight is currently unavailable due missing local server process.
