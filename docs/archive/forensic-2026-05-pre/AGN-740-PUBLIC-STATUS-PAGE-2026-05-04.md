# AGN-740 Public status page - Release SRE heartbeat evidence (2026-05-04)

## Scope
- Issue: AGN-740 `[GAP-AUDIT-26] Public status page`
- Role lane: Release SRE (deploy/ops safety surfaces)
- Mandatory opening completed before this evidence run.

## Freshness gate result (local preflight)
- Command: `npm run freshness:check`
- Timestamp: 2026-05-04T15:47:49.951Z
- Localhost reachability: `http://localhost:3023` reachable (NOT missing)
- Result: `FAIL` (`status=stale`, `sourceStatus=degraded`, `blocking_non_green=5`, `Sentry: MISSING`)
- Blocking non-green rows: `bluesky (RED)`, `npm (YELLOW)`, `producthunt (YELLOW)`, `trending-repos (YELLOW)`, `twitter (YELLOW)`.

## Live production ops evidence

### Vercel app health
- Probe: `GET https://trendingrepo.com/api/health?soft=1`
- HTTP: `200 OK`
- Payload status: `status=stale`, `sourceStatus=degraded`
- Warning: `refresh degraded: 6/6 dependency refreshes failed; serving cached health snapshot`

### Public source breaker surface
- Probe: `GET https://trendingrepo.com/api/health/sources`
- HTTP: `200 OK`
- Summary: `total=9`, `closed=9`, `open=0`, `halfOpen=0`

### Worker-facing status surface
- Probe: `GET https://trendingrepo.com/api/worker/health`
- HTTP: `200 OK`
- Summary: `total=36`, `green=34`, `amber=2`, `red=0`, `missing=0`
- Amber slugs: `bluesky-mentions`, `bluesky-trending`

### Railway worker liveness
- Probe: `GET https://trendingrepo-worker-production.up.railway.app/healthz`
- HTTP: `200 OK`
- Payload: `ok=true`, `db=true`, `redis=true`, `lastRunAt=2026-05-04T15:45:00.153Z`

## Gap verification for AGN-740
- Route scan (`src/app`): no public `/status` page route is present.
- Existing visibility is API-first (`/api/health`, `/api/worker/health`, `/api/health/sources`) not a dedicated public status page.
- This confirms GAP-AUDIT-26 remains open from release-ops perspective.

## Blockers encountered in this heartbeat
1. GitHub Actions live run inspection blocked:
   - Command: `gh run list --limit 20 --json workflowName,status,conclusion,createdAt,updatedAt,url`
   - Error: `HTTP 401: Bad credentials`
   - Impact: cannot validate cron/workflow state live through GitHub API in this session.
2. Public status page implementation ownership split:
   - A true `/status` page requires product surface implementation outside Release SRE-owned files.

## Unblock owner + action
- CTO/platform:
  - Restore valid GitHub auth token for `gh` on this runner so Release SRE can attach live workflow-state evidence.
- Frontend/platform owner:
  - Implement public `/status` page surface consuming approved health contracts.
- Release SRE (after unblock):
  - Re-run workflow state checks, attach deploy-impact evidence, and verify rollback/runbook links on the new page.

---

## Heartbeat update (2026-05-05)

### Mandatory opening + freshness preflight
- Mandatory opening docs were re-read in this heartbeat (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` at `2026-05-04T23:59+08:00` timed out contacting `http://localhost:3023` (localhost runtime unavailable/unresponsive in this session), so local freshness verdict is blocked.

### Live production checks (release safety evidence)
- `GET https://trendingrepo.com/api/health?soft=1` -> `HTTP 200`, payload still `status=stale`, `sourceStatus=degraded`, warning indicates dependency refresh failures and cached snapshot serving.
- `GET https://trendingrepo.com/api/health/sources` -> `HTTP 200`, breaker summary reports `total=9`, `closed=9`, `open=0`, `halfOpen=0`.
- `GET https://trendingrepo.com/api/worker/health` -> `HTTP 200`, summary `total=36`, `green=34`, `amber=2`, `red=0`, `missing=0` (amber: `bluesky-mentions`, `bluesky-trending`).
- `GET https://trendingrepo-worker-production.up.railway.app/healthz` -> `HTTP 200`, payload `ok=true`, `db=true`, `redis=true`.
- `GET https://trendingrepo.com/status` -> `HTTP 404` (public status page gap directly reproduced in production).

### GitHub Actions/cron state (live)
- Initial `gh` calls failed with `HTTP 401` because the process `GITHUB_TOKEN` env override was invalid.
- After unsetting env override for the command scope, `gh run list --limit 20` succeeded and showed mixed state in latest runs, including:
  - failures: `Audit - source freshness`, `Sync TrustMRR revenue overlays`, `Refresh Bluesky signals`, `Ping MCP liveness`, `Refresh arXiv signals`, `Refresh repo profiles`, `Refresh HuggingFace space signals`, `Refresh Lobsters signals`
  - successes: `CI`, `Cron - AISO drain`, `Cron - webhooks flush + scan`, `Cron - MCP usage log rotation`, `Cron — Twitter outbound`
- This confirms current non-green cron/workflow surface is an active ops risk independent of the missing `/status` page route.

### Rollback/readiness note
- Rollback/runbook path exists and is documented in `docs/forensic/AGN-739-RUNBOOKS-4-MOST-LIKELY-INCIDENTS-2026-05-04.md` (includes credential, cron auth, and deploy verification recovery steps).

### Blockers to close AGN-740
1. Product surface blocker: public `/status` page route is not implemented (`404`).
2. Release-verification blocker: local freshness preflight cannot complete while localhost `:3023` is unavailable/unresponsive.
3. Operational blocker: critical workflows remain intermittently failing in latest live runs; status page launch without stabilizing these would misrepresent system health.
