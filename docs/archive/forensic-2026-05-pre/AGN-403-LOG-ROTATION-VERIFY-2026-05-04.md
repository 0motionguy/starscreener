---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AGN-403 verification - log rotation policy (2026-05-04)

## Scope
- Issue: `AGN-403` (`[Audit-08 T8] Log rotation policy`)
- Role lane: Release SRE
- Surfaces: `.github/workflows/**`, Vercel deploy/cron visibility, Railway operational health, rollback readiness

## Mandatory opening verification (this heartbeat)
- Re-read complete: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness gate command: `npm run freshness:check`
- Result: `freshness-check: request timed out while contacting http://localhost:3023` -> localhost not reachable from this heartbeat session.

## Evidence collected

### 1) Log-rotation policy exists in workflow code (local, verified)
- File: `.github/workflows/cron-mcp-usage-rotate.yml`
- Workflow name: `Cron - MCP usage log rotation`
- Schedule: `0 3 1 * *` (monthly, 1st day at 03:00 UTC)
- Auth guard: fails hard if `CRON_SECRET` is missing
- Endpoint called: `POST /api/cron/mcp/rotate-usage` with `Authorization: Bearer $CRON_SECRET`
- Failure behavior: exits non-zero unless HTTP status is exactly `200`

### 2) Railway worker operational status (live)
- `railway status` output confirms target service:
  - Project `starscreener`
  - Environment `production`
  - Service `trendingrepo-worker`
- Live health probe:
  - `GET https://trendingrepo-worker-production.up.railway.app/healthz`
  - Response: `{"ok":true,"db":true,"redis":true,"lastCheckAt":"2026-05-04T15:42:06.645Z","lastRunAt":"2026-05-04T15:41:00.112Z"}`

### 3) GitHub Actions live workflow-state check (BLOCKED)
- Command attempted: `gh workflow view cron-mcp-usage-rotate.yml`
- Output: `HTTP 401: Bad credentials`
- Impact: cannot confirm current run history, failures, or latest success/cancel state for rotation workflow in this heartbeat.

### 4) Vercel environment/deploy inspection (BLOCKED)
- Command attempted: `vercel env ls`
- Output: `You specified VERCEL_PROJECT_ID but forgot VERCEL_ORG_ID`
- Impact: cannot inspect deployment env state directly (including cron/auth-path readiness) from this session.

## Rollback readiness note
- Rotation workflow is non-destructive to deployment topology and guarded by HTTP 200 check.
- If rotation endpoint fails after a change, rollback path is to restore last known-good secret/env for cron auth (`CRON_SECRET`) and rerun the monthly workflow manually after credential correction.
- Secret-rotation runbook reference: `docs/RUNBOOK-secret-rotation.md` (quarterly overlap-first policy, explicit post-rotation verification and revoke steps).

## Current verdict for AGN-403
- `BLOCKED` for acceptance closure because live GitHub Actions + Vercel verification is not possible with current credentials/context.
- Required unblock owners/actions:
  1. CTO/platform: provide valid GitHub CLI auth context (`gh auth login` or bot token) for this workspace.
  2. CTO/platform: provide `VERCEL_ORG_ID` paired with `VERCEL_PROJECT_ID` (or alternate authorized Vercel access path).
  3. After unblocking creds, rerun:
     - `gh workflow view cron-mcp-usage-rotate.yml`
     - `gh run list --workflow cron-mcp-usage-rotate.yml --limit 5`
     - `vercel env ls`
     - and, if needed, one manual workflow dispatch verification.

## Re-queue retry evidence (comment-driven retry, 2026-05-04)

Trigger context: issue comment `9d6e7781-d594-448d-92c3-c8026f5ff166` (`Re-queue: bumped concurrency to 5, retry now`).

### Auth-path recovery performed in-session
- `gh auth status` showed invalid env override token (`GITHUB_TOKEN`) while a valid keyring account existed.
- Retried GitHub checks with env override cleared (`$env:GITHUB_TOKEN=$null`) and access succeeded.
- Loaded `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from `.vercel/project.json` for Vercel CLI context; `vercel env ls` succeeded.

### Live verification results
- Rotation workflow metadata: `gh workflow view cron-mcp-usage-rotate.yml` succeeded.
- Rotation workflow run history: latest scheduled run was successful (`25204621935`, 2026-05-01T06:09:14Z).
- Manual dispatch verification:
  - Triggered `gh workflow run cron-mcp-usage-rotate.yml --ref main`
  - New run `25329232323` completed `success` (`2026-05-04T16:01:53Z` -> `16:02:01Z`).
- Sibling double-check (`cron-freshness-check.yml`) inspected live: mixed state observed (recent successes and failures), proving GH Actions access and distinguishing workflow health from auth-path failure.
- Vercel environment listing access: `vercel env ls` succeeded after org/project context fix.
- Railway worker live health remains green: `https://trendingrepo-worker-production.up.railway.app/healthz` reported `ok/db/redis=true`, `lastRunAt=2026-05-04T15:50:03.388Z`.

### Remaining release gate blockers in this heartbeat
- Local freshness preflight still degraded: `npm run freshness:check` timed out contacting `http://localhost:3023`.
- Baseline typecheck is currently red (pre-existing repo errors): `npm run typecheck` failed in unrelated files (`scripts/scrape-funding-crunchbase.ts`, `src/app/api/pipeline/...`, `src/components/layout/MobileDrawer.tsx`, tests).

Conclusion: AGN-403 log-rotation policy itself is verified live (including manual dispatch success), but CTO sweep closure gate requiring clean local typecheck is not currently satisfiable in this heartbeat due pre-existing baseline failures.
