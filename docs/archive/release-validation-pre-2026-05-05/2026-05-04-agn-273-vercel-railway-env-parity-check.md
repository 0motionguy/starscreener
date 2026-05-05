---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-273 - Vercel and Railway env parity check (Release SRE)

Timestamp (Asia/Makassar): 2026-05-04T19:05:00+08:00

## Scope and method
- Mandatory opening bundle completed.
- Ran `npm run freshness:check` before parity checks.
- Audited owned surfaces only: `.github/workflows/**`, Vercel deploy/env state, Railway env/health, `next.config.ts` deployment-sensitive config.

## Freshness gate evidence
`npm run freshness:check` at `2026-05-04T11:00:06Z` failed with:
- `GET http://localhost:3023/api/health?soft=1 -> HTTP 500`
- localhost reachable, local health route degraded in this heartbeat.

## Live deploy state
- `vercel ls` succeeded after loading org/project from `.vercel/project.json`.
- Recent production history includes both `Ready` and `Error` deployments.

## Critical env parity matrix (masked)

| Key | Vercel prod | Railway prod worker | GitHub Actions secrets |
|---|---|---|---|
| REDIS_URL | present | present | present (verified earlier 2026-05-04) |
| UPSTASH_REDIS_REST_URL | absent | absent | unknown (401 in this heartbeat) |
| UPSTASH_REDIS_REST_TOKEN | absent | absent | unknown (401 in this heartbeat) |
| SENTRY_DSN | present but EMPTY | present (non-empty) | absent (verified earlier 2026-05-04) |
| CRON_SECRET | present | absent | present (verified earlier 2026-05-04) |
| GITHUB_TOKEN | present | absent | unknown (401 in this heartbeat) |
| GH_TOKEN_POOL | present | absent | present (verified earlier 2026-05-04) |
| APIFY_API_TOKEN | absent | absent | present (verified earlier 2026-05-04) |
| DEVTO_API_KEYS | present | absent | present (verified earlier 2026-05-04) |
| PRODUCTHUNT_TOKEN | present | absent | present (verified earlier 2026-05-04) |
| TRUSTMRR_API_KEY | absent | absent | present (verified earlier 2026-05-04) |

## Mismatches likely causing degraded state
1. Vercel `SENTRY_DSN` is empty while Railway `SENTRY_DSN` is populated.
2. GitHub secret visibility in this heartbeat regressed (`gh secret list` -> HTTP 401), reducing live parity confidence.
3. Local preflight health endpoint is degraded (HTTP 500), complicating release verification.

## Safe rollout order
1. Set non-empty `SENTRY_DSN` in Vercel production (match approved DSN).
2. Trigger no-code production redeploy on Vercel.
3. Verify `https://trendingrepo.com/api/health?soft=1`, authenticated freshness endpoint, and Sentry canary.
4. Re-run parity matrix checks and workflow checks.

## Rollback steps
- Roll back to previous `Ready` Vercel production deployment from `vercel ls` if health worsens.
- Keep Railway unchanged in this fix wave.
- Re-run health/freshness verification after rollback.

## Evidence commands
- `npm run freshness:check`
- `vercel env pull .vercel/.env.agn273 --environment=production --yes` (key names only; temp file removed)
- `vercel ls`
- `railway variables --json`
- `Invoke-RestMethod https://trendingrepo-worker-production.up.railway.app/healthz`
- `gh secret list --json name,updatedAt` (HTTP 401 in this heartbeat)
