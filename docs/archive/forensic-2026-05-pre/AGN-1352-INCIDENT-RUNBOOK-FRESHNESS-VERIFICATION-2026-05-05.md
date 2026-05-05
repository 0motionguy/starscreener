# AGN-1352 [Sprint 1 audit] Incident runbook freshness verification

- Timestamp: 2026-05-05
- Owner lane: Release SRE
- Scope: validate incident runbook commands/paths against current repo and CLI reality; mark stale steps and provide corrected alternatives.

## Mandatory opening + freshness evidence

- Mandatory opening bundle re-read this heartbeat:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/AUDIT-2026-05-04.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- Freshness gate:
  - Command: `npm run freshness:check`
  - Result: `freshness-check: local server not reachable at http://localhost:3023 ... (code=ECONNREFUSED)`
  - Classification: localhost `:3023` is missing/unreachable in this heartbeat.

## Verification evidence (repo + tool checks)

### Checked runbook sources

- `docs/forensic/AGN-739-RUNBOOKS-4-MOST-LIKELY-INCIDENTS-2026-05-04.md`
- `docs/forensic/AGN-881-SOURCE-FAILURE-RUNBOOK-FALLBACK-CHAIN-2026-05-05.md`
- `docs/runbooks/github-pool-exhausted.md`
- `docs/runbooks/redis-full.md`
- `docs/runbooks/apify-down.md`
- `docs/runbooks/vercel-deploy-failing.md`
- `docs/runbooks/rollback.md`

### Current-system checks used

1. Auth path contract for freshness endpoint:
   - `.github/workflows/cron-freshness-check.yml` uses:
     - `Authorization: Bearer $CRON_SECRET` for `/api/cron/freshness/state`
2. Endpoint implementation presence:
   - `src/app/api/cron/freshness/state/route.ts` exists and is wired as protected cron route.
3. Admin surface path validation:
   - `src/app/admin/keys` and `src/app/admin/pool-aggregate` exist.
4. CLI contract validation:
   - `vercel --help` confirms `rollback`, `promote`, `redeploy` commands exist.
   - `railway --help` confirms `status`, `logs`, `redeploy` commands exist.
5. GitHub auth reality check:
   - `gh workflow list --limit 5` returns `HTTP 401 Bad credentials`.
6. Twitter fallback reality check:
   - `scripts/collect-twitter-signals.ts` explicitly documents `apify` as default production path and labels `nitter`/`web` as legacy.
   - `src/lib/pipeline/adapters/nitter-adapter.ts` marks adapter disabled with `LIB-03`.

## Findings: stale/invalid steps and corrected alternatives

### 1) Stale auth-header guidance in AGN-739

- Location:
  - `docs/forensic/AGN-739-RUNBOOKS-4-MOST-LIKELY-INCIDENTS-2026-05-04.md`
- Problem:
  - Incident 2 still says to validate `x-cron-secret`.
- Corrected alternative:
  - Use `Authorization: Bearer $CRON_SECRET` for `/api/cron/freshness/state` checks.
  - Match workflow behavior in `.github/workflows/cron-freshness-check.yml`.

### 2) Overstated Nitter fallback instruction in Apify-down runbook

- Location:
  - `docs/runbooks/apify-down.md`
- Problem:
  - Guidance says to "switch to Nitter fallback mode for continuity" as a mitigation default.
  - Current codebase marks Nitter path as legacy/degraded for collector operations; supported production collector default is Apify.
- Corrected alternative:
  - Treat Nitter/Web as diagnostics/legacy fallback only.
  - Primary mitigation is restoring Apify token/actor health and rerunning `collect-twitter`.
  - If Apify remains down, classify Twitter lane as degraded and escalate (do not claim continuity as healthy).

### 3) Missing explicit auth prerequisite in workflow-health steps

- Locations:
  - `docs/forensic/AGN-739-RUNBOOKS-4-MOST-LIKELY-INCIDENTS-2026-05-04.md`
  - `docs/runbooks/github-pool-exhausted.md`
- Problem:
  - `gh run ...` commands are present, but runbooks do not hard-gate on `gh auth status`.
  - Live check shows `gh` is currently unauthenticated (`401`), so workflow verification can silently fail.
- Corrected alternative:
  - Add prerequisite step:
    - `gh auth status`
    - If unauthenticated: classify verification as blocked, escalate credential restore, and use GitHub web UI as interim evidence channel.

### 4) Escalation-owner mapping is under-specified across runbooks

- Problem:
  - Incident runbooks describe actions but do not consistently map unblock owner/action for credential/config blockers.
- Corrected owner/action mapping for Release SRE:
  - Missing `CRON_SECRET` alignment (GitHub/Vercel): `CTO/Platform`
  - Missing Vercel org/project context (`VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`): `CTO/Platform`
  - Missing GitHub CLI auth token/scope: `CTO/Platform` (or repo admin)
  - Railway access/auth failures: `CTO/Platform`
  - Local server down (`localhost:3023`): `platform engineer` to restore app runtime before freshness gate.

## What is still valid

- `docs/runbooks/rollback.md` command family is still valid with current CLI (`vercel rollback` exists).
- Admin diagnostic paths (`/admin/keys`, `/admin/pool-aggregate`) are present.
- Freshness endpoint auth path check in workflow is current and correct (`Authorization: Bearer ...`).

## Release-safe correction set (operator quick patch list)

1. In AGN-739 incident 2, replace `x-cron-secret` wording with `Authorization: Bearer $CRON_SECRET`.
2. In `docs/runbooks/apify-down.md`, rewrite Nitter switch step to degraded-mode guidance (Apify-first recovery).
3. In GitHub-workflow verification steps, prepend `gh auth status` as hard precondition and define blocked path.
4. Add explicit owner/action escalation lines to each runbook section for auth/context blockers.

## Acceptance criteria mapping

- Validate each runbook command/path against current repo state: completed with command/file evidence above.
- Mark stale/invalid steps and corrected alternatives: completed (4 concrete drift findings + replacements).
- Confirm escalation paths and alert owners: completed (owner/action mapping defined for current blocker classes).
- Publish verification packet under `docs/forensic`: completed (this file).
