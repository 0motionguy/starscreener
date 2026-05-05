# AGN-844 [BIZ-7] Status page - Release SRE heartbeat evidence (2026-05-05)

## Scope
- Issue: AGN-844 `[BIZ-7] Status page — status.trendingrepo.com`
- Role lane: Release SRE (deploy + operations safety)
- Mandatory opening completed before evidence capture (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).

## Freshness preflight (required)
- Command: `npm run freshness:check`
- Timestamp: 2026-05-05 (heartbeat runtime)
- Result: `FAIL` - timeout contacting `http://localhost:3023`
- Interpretation: localhost:3023 is present but unresponsive in freshness window; local product considered stale for this heartbeat.

## Live production and infra evidence

### Public status endpoint targets
- `GET https://status.trendingrepo.com` -> DNS resolution failure (`NXDOMAIN`, host does not exist)
- `nslookup status.trendingrepo.com` -> `Non-existent domain`
- `GET https://trendingrepo.com/status` -> `HTTP 404 Not Found`

Conclusion: status page surface is not deployed and status subdomain is not provisioned.

### Production health surfaces (current runtime reality)
- `GET https://trendingrepo.com/api/health` -> `HTTP 200`, payload `status=ok`, `sourceStatus=degraded`
- `GET https://trendingrepo.com/api/health/sources` -> `HTTP 200`, breaker summary `total=9, closed=9, open=0, halfOpen=0`
- `GET https://trendingrepo.com/api/worker/health` -> `HTTP 200`, summary `total=36, green=36, amber=0, red=0, missing=0`
- `GET https://trendingrepo-worker-production.up.railway.app/healthz` -> `HTTP 200`, payload `ok=true, db=true, redis=true`

### Release-ops control plane blockers
- GitHub Actions live inspection blocked:
  - `gh run list --limit 12 --json ...` -> `HTTP 401: Bad credentials`
- Vercel environment/deploy inspection blocked:
  - `vercel env ls` -> `VERCEL_PROJECT_ID specified but VERCEL_ORG_ID missing`

Impact: cron/workflow and Vercel deploy state cannot be validated with authenticated control-plane evidence in this session.

## Rollback readiness
- Existing incident runbooks are already documented in:
  - `docs/forensic/AGN-739-RUNBOOKS-4-MOST-LIKELY-INCIDENTS-2026-05-04.md`
- For AGN-844 specifically, rollback path is DNS-level:
  1. Keep `status.trendingrepo.com` unset (current safe state) or route to known-good status provider target.
  2. Verify certificate and endpoint health before exposing public DNS.
  3. If launch introduces bad state, remove/rollback DNS CNAME and revert status route deployment.

## Blocked status decision
AGN-844 is blocked in this heartbeat.

Blocked on:
1. DNS provisioning missing for `status.trendingrepo.com` (currently NXDOMAIN).
2. No deployed status route (`/status` returns 404).
3. Missing release verification credentials for GitHub Actions (`gh` auth) and Vercel org linkage (`VERCEL_ORG_ID`).

Needs:
- CTO/platform: provision status subdomain DNS + target provider decision.
- Frontend/platform owner: implement and deploy `/status` surface (or external status provider redirect policy).
- CTO/platform: restore GitHub CLI credentials and Vercel org/project linkage for live release verification.
