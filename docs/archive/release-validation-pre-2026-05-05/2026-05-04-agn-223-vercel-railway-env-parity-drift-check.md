---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-223 - Vercel/Railway env parity drift check (Release SRE)

Timestamp (Asia/Makassar): 2026-05-04T17:44:00+08:00

## Scope and method
- Mandatory opening bundle completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Ran `npm run freshness:check` before release checks.
- Audited owned surfaces only: `.github/workflows/**`, `next.config.ts`, Vercel CLI auth/state, Railway service/env, GitHub Actions live run state.

## Freshness gate evidence
`npm run freshness:check` at `2026-05-04T09:35:11Z`:
- `target=http://localhost:3023`
- localhost status: reachable but degraded (`GET /api/health?soft=1 -> HTTP 500`)
- product status: stale/degraded (freshness gate failed)

## Vercel/Railway env parity findings
1. Vercel env listing now succeeds with explicit project linkage.
- Source of truth: `.vercel/project.json` (`orgId=team_NrVhqhXUDEYB9YOWaqkBIQ4w`, `projectId=prj_ycY0bM38UMyAl9jPcAgrmQGUc4tQ`).
- Command path: export `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`, then run `vercel env ls`.
- Result: Vercel env inventory is accessible for production.

2. Railway worker env available and healthy.
- `railway status` confirms `project=starscreener`, `environment=production`, `service=trendingrepo-worker`.
- `railway variables --json` confirms worker has `REDIS_URL` and `SENTRY_DSN` plus worker fetcher keys.

3. GitHub Actions secret query currently unauthenticated.
- `gh secret list --json name,updatedAt` returned `HTTP 401 Bad credentials` in this heartbeat.
- Previous AGN-223 heartbeat had a valid GH secret inventory, but this run cannot refresh that set live.

4. Workflow state is currently mostly green.
- Recent runs show key cron workflows succeeding (`Refresh fast discovery`, `Refresh collection rankings`, `Refresh dev.to signals`, `Audit - source freshness`, `Collect Twitter Signals`).

## Deploy-sensitive config review
- `next.config.ts` confirms Sentry build plugin wiring depends on env (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`) and runtime behavior depends on `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`.

## Env parity matrix (presence only, values masked)
| Env class | Vercel (prod app) | Railway (worker) | Drift risk |
|---|---|---|---|
| `REDIS_URL` | present | present | low |
| `SENTRY_DSN` | present | present | low |
| `CRON_SECRET` | present | not present | expected split (app-only) |
| `GITHUB_TOKEN` / `GH_TOKEN_POOL` | present | not present in current worker dump | medium |
| `PRODUCTHUNT_TOKENS` | present | not present in current worker dump | medium |
| `DEVTO_API_KEYS` | present | not present in current worker dump | medium |
| `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` | present | not present in current worker dump | medium |

## Drift assessment
- Resolved blocker: Vercel env visibility is restored by using `.vercel/project.json` org/project IDs.
- Confirmed parity drift classes: app/worker source-token surfaces are asymmetric for several fetcher families (GitHub/ProductHunt/Dev.to/Bluesky), which can cause worker-side skip behavior while app-side reads remain configured.
- Additional release risk: local freshness gate now fails (`/api/health?soft=1` returns HTTP 500), so stale-vs-code-failure separation remains degraded for this workstation heartbeat.

## Remediation checklist (owner per missing-variable class)
- [ ] Platform engineer: restore local preflight endpoint health (`/api/health?soft=1` HTTP 200) and re-run `npm run freshness:check` to green/no-blocking.
- [ ] Release SRE: refresh GH Actions secret inventory once `gh` auth is repaired (`gh auth login` or token refresh) and verify CI-side parity against Vercel and Railway.
- [ ] Data platform engineer: decide canonical ownership for GitHub/ProductHunt/Dev.to/Bluesky env classes on worker; either provision missing worker vars or formally mark fetchers app-only and disable worker schedules that depend on them.
- [ ] CTO/platform ops: lock Vercel CLI linkage reliability by exporting both `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` in the ops runtime profile to prevent future false blocked states.

## Rollback readiness
- No deploy/config mutation performed in this heartbeat.
- Rollback path unchanged: revert to previous successful Vercel deployment and keep Railway env untouched.
