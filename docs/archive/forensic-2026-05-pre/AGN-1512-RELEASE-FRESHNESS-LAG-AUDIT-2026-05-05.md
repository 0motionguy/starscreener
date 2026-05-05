# AGN-1512 Release/SRE deploy-to-freshness lag audit (2026-05-05)

## Scope
- Issue: `AGN-1512`
- Role lane: Release SRE
- Focus: deploy state vs freshness lag attribution, workflow visibility, rollback readiness.

## Mandatory opening confirmation
Read in this heartbeat before actions:
1. `CLAUDE.md`
2. `docs/ENGINE.md`
3. `docs/SITE-WIREMAP.md`
4. `docs/AUDIT-2026-05-04.md`
5. `docs/forensic/00-INDEX.md`
6. `tasks/CURRENT-SPRINT.md`
7. `tasks/BACKLOG.md`

## Freshness gate evidence
Command:
```powershell
npm run freshness:check
```
Result timestamp: `2026-05-05T01:19:16.701Z` (from script output)

Outcome:
- `localhost:3023` is reachable (not missing).
- Product is stale.
- Summary: `green=37 yellow=11 red=2 dead=0 blocking_non_green=11 advisory_non_green=2`.
- Blocking reds: `producthunt`, `trending-repos`.
- Script exits non-zero: `FAIL freshness non-green source detected`.

## Live deploy evidence (Vercel)
Auth:
```powershell
vercel whoami
```
- Auth present as `infinitytoken247-2517`.

Active production deployment:
```powershell
vercel ls trendingrepo.com --yes
vercel inspect https://starscreener-70urutvf0-kermits-projects-6330acd4.vercel.app
```
- Deployment URL: `https://starscreener-70urutvf0-kermits-projects-6330acd4.vercel.app`
- Deployment ID: `dpl_Cv12SkiUcH5GbmVhBS7FXm5HxVET`
- Target: `production`
- Status: `Ready`
- Created: `Tue May 05 2026 07:02:04 GMT+0800`
- Aliases include `https://trendingrepo.com`

Production health endpoint:
```powershell
Invoke-WebRequest https://trendingrepo.com/api/health?soft=1
```
- HTTP `200`
- Headers include `x-vercel-id=sin1::iad1::...`
- Payload status: `"stale"`
- `sourceStatus: "ok"`
- Warning: `"refresh degraded: 6/6 dependency refreshes failed; serving cached health snapshot"`

Attribution:
- This is not a missing deployment.
- This is not a Railway down event.
- Lag is freshness degradation while serving cached snapshot from a live production deploy.

## Live worker evidence (Railway/Redis lane)
Auth:
```powershell
railway whoami
```
- Logged in (`infinitytoken247@gmail.com`).

Service:
```powershell
railway status
railway domain
Invoke-WebRequest https://trendingrepo-worker-production.up.railway.app/healthz
```
- Project/env/service: `starscreener / production / trendingrepo-worker`
- Domain: `https://trendingrepo-worker-production.up.railway.app`
- `/healthz` HTTP `200`
- Body: `{ "ok": true, "db": true, "redis": true, "lastRunAt": "2026-05-05T01:20:03.302Z" }`

Attribution:
- Worker process and backing DB/Redis are healthy at check time.

## GitHub Actions workflow visibility
Commands:
```powershell
gh workflow list
gh run list --limit 30 --json workflowName,status,conclusion,createdAt,updatedAt,headSha,url
```
Result:
- Both commands failed with `HTTP 401: Bad credentials`.

Impact:
- Live workflow-state verification is blocked in this heartbeat due to GitHub CLI auth.
- Local repo still contains workflow files (`workflow_files=80`) but live status cannot be confirmed via API until GH auth is fixed.

## Rollback readiness
Current known-good candidate to roll back from/to is identified by deployment ID:
- `dpl_Cv12SkiUcH5GbmVhBS7FXm5HxVET`

Rollback command path (not executed in this heartbeat):
```powershell
vercel rollback dpl_Cv12SkiUcH5GbmVhBS7FXm5HxVET
```

Rollback decision rule for this incident class:
- If deploy status is `Ready` and health indicates cached stale snapshot with refresh failures, prioritize data/workflow freshness remediation first.
- Rollback only if a newer deploy introduced functional regression independent of source freshness.

## SRE conclusion for AGN-1512 (this heartbeat)
- Mandatory opening completed.
- Freshness check executed and shows stale product with blocking non-green sources.
- Production deploy is live/ready; worker/redis lane is healthy.
- Main blocker to full acceptance: GitHub Actions live-state inspection blocked by GH auth (`401 Bad credentials`).
