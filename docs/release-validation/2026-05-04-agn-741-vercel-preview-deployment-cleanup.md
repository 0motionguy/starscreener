# AGN-741 Vercel preview-deployment cleanup (2026-05-04)

## Scope
- Issue: `AGN-741` (`[GAP-AUDIT-27] Vercel preview-deployment cleanup`)
- Role lane: Release SRE (Vercel + release safety surfaces)
- Timestamp (UTC): `2026-05-04T16:00Z` approx

## Mandatory opening evidence
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`.
- Result: localhost `3023` reachable (not missing), but stale/degraded (`blocking_non_green=5`).

## Live deployment checks
- Vercel context loaded from `.vercel/project.json` (`VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`).
- `vercel ls --yes` showed active production and preview deployments; preview lane included stale/errored preview artifacts.

## Cleanup actions executed
Removed stale preview deployments (safe cleanup, no production deletion):
1. `starscreener-po3i2e96v-kermits-projects-6330acd4.vercel.app` (Error, Preview)
2. `starscreener-587ckcvlu-kermits-projects-6330acd4.vercel.app` (Ready, Preview, stale)
3. `starscreener-mpoxhqfd4-kermits-projects-6330acd4.vercel.app` (Ready, Preview, stale)

Command evidence:
- `vercel remove <deployment> --yes` succeeded for all three removals.

## Post-cleanup verification
- `vercel ls --yes` after cleanup confirms:
  - Preview lane reduced to current active entries (`ebewd7pbl` ready, `2eeqfsupp` ready).
  - Production ready deployment preserved (`i89kdb99o`) with older ready production entries still available.
- Production route checks:
  - `GET https://trendingrepo.com/api/health?soft=1` -> `200`
  - `GET https://trendingrepo.com/api/cron/freshness/state` with `Authorization: Bearer $CRON_SECRET` -> `200`

## Rollback readiness
- Rollback candidate is available in Vercel deployment history (`vercel ls --yes`), including latest and prior Ready production deployments.
- Rollback procedure:
  1. Promote previous Ready production deployment in Vercel.
  2. Re-run release refresh workflow (`workflow_dispatch`) to warm critical routes.
  3. Re-check `/api/health?soft=1` and `/api/cron/freshness/state`.

## Control-plane delivery blocker
- Could not post Paperclip issue comment or PATCH status in this heartbeat because control plane was unreachable:
  - `http://192.168.192.1:3100` TCP/HTTP unreachable from runtime.
  - Multiple retries returned `Unable to connect to the remote server`.
- Needs: Paperclip API network restoration, then replay issue comment + terminal status PATCH.

---

# AGN-741 continuation (2026-05-05)

## Acceptance follow-through

### 1) Active Vercel deployments + branch-state evidence
- `vercel ls --yes` confirms active Preview deployments:
  - `starscreener-ebewd7pbl-...` (`target=preview`, `status=Ready`)
  - `starscreener-2eeqfsupp-...` (`target=preview`, `status=Ready`)
- `vercel inspect` aliases show branch-linked previews:
  - `starscreener-git-bot-orchestra-79a227-...` (preview branch lane)
  - `starscreener-git-bot-orchestra-0bed06-...` (preview branch lane)
- Active production deployment:
  - `starscreener-drbxcudk5-...` alias includes `starscreener-git-main-...` and `trendingrepo.com`.

### 2) Cleanup trigger for merged/deleted-branch previews
- GitHub branch-state API check path (`gh api /repos/0motionguy/starscreener/deployments`) is currently blocked by `HTTP 401 Bad credentials` in this shell.
- Implemented automated cleanup path in workflow instead:
  - Enumerates Vercel `target=preview` deployments via Vercel API.
  - Reads deployment branch from `meta.githubCommitRef`.
  - Checks branch existence via GitHub API (`/repos/{owner}/{repo}/branches/{branch}`).
  - Marks `404` branch previews as stale candidates (merged/deleted branch path).
  - Deletes stale candidates when run with `dry_run=false`.

### 3) Weekly cleanup workflow added
- Added `.github/workflows/cleanup-stale-previews.yml`.
- Trigger: weekly on Monday (`23 02 * * 1`) + manual dispatch.
- Safety:
  - default `dry_run=true`
  - deletion cap `max_deletes` (default `25`)
  - requires `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`.
