---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# KEY-ROTATION.md - Production Secret Rotation Runbook

Last updated: 2026-05-04
Owner: Platform Security

## Purpose

This document defines how production secrets are rotated across STARSCREENER runtime and ingestion infrastructure.

## Masking Policy (Mandatory)

- Never print raw secret values in docs, logs, comments, or tickets.
- Evidence format is strictly `first4...last4`.
- Example evidence: `ghp1...9xyz`.

## Secret Rotation Matrix

| Secret | Service | Rotation Cadence | How To Rotate | Notify |
|---|---|---|---|---|
| `GITHUB_TOKEN` | GitHub API runtime access | Every 30 days | Create replacement PAT with minimum scopes, update Vercel + Railway + GitHub Actions, verify `/admin/keys` and `freshness:check`, revoke old PAT | CTO, Platform Security, Runtime Owner |
| `GH_TOKEN_POOL` (`GITHUB_TOKEN_POOL` alias) | GitHub pooled PATs | Every 30 days (staggered) | Rotate one pooled token at a time to avoid full pool outage; verify pool health between each token | CTO, Platform Security |
| `CRON_SECRET` | `/api/cron/*` auth | Every 30 days | Generate new high-entropy token, update Vercel + Railway + GitHub Actions in same window, verify one cron call success + one unauthorized denial | CTO, Ops/Workflow Owner |
| `APIFY_API_TOKEN` | Twitter collector (Apify actor) | Every 60 days | Issue new Apify token, update GitHub Actions (and worker env when used), run `collect-twitter.yml`, verify actor run success | CTO, Ingestion Owner |
| `REDIS_URL` | Railway Redis TCP auth | Every 90 days | Rotate credential at provider, update Vercel + Railway + GitHub Actions, run `freshness:check`, verify data-store writes remain live | CTO, Platform Security, Data Owner |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Upstash REST data-store auth | Every 90 days | Rotate in Upstash dashboard, update all consumers, run `freshness:check`, verify no write degradation | CTO, Platform Security, Data Owner |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Sentry ingest + source maps | Every 90 days | Create replacement DSN/token, update Vercel/CI, trigger test error in safe env, verify event arrives | CTO, Platform Security |
| `BLUESKY_APP_PASSWORD` | Bluesky scraper auth | Every 60 days | Generate app password, update GitHub Actions/worker env, trigger scraper workflow, verify successful pull | CTO, Ingestion Owner |
| `PRODUCTHUNT_TOKEN`, `PRODUCTHUNT_TOKENS` | ProductHunt GraphQL | Every 90 days | Create replacement token(s), update GitHub Actions/worker env, run ProductHunt workflow, verify freshness | CTO, Ingestion Owner |
| `TRUSTMRR_API_KEY` | Revenue sync API | Every 90 days | Rotate key in provider, update workflows/worker env, run sync job, verify overlays updated | CTO, Data Owner |
| `RESEND_API_KEY` | Digest email | Every 90 days | Rotate key in Resend, update env, send test digest in non-prod target, verify delivery | CTO, Platform Security |
| `FIRECRAWL_API_KEY` | Funding/source fetchers | Every 90 days | Rotate key, update worker env, run fetcher, verify no auth failures | CTO, Ingestion Owner |

## Standard Rotation Procedure

1. Generate new secret at provider.
2. Record private evidence with masked value (`first4...last4`) and UTC timestamp.
3. Update each required environment surface for that secret.
4. Run smallest verification for impacted workflows/routes.
5. Monitor 15 minutes for auth/rate-limit/fatal anomalies.
6. Revoke old value only after successful checks.
7. Post completion evidence using masked format only.

## Minimum Verification Commands

- `npm run freshness:check`
- Trigger source-specific workflow for rotated source where applicable
- Auth route probe for `CRON_SECRET`-protected path when `CRON_SECRET` rotated

## GitHub Pool Rotation Balance Check (±15%)

Use this check after any `GITHUB_TOKEN` / `GH_TOKEN_POOL` change and during
release verification.

Definition:

- `meanRequests24h = totalRequests24h / totalConfiguredTokens`
- `deviationPct(token) = ((requests24h - meanRequests24h) / meanRequests24h) * 100`
- PASS only if every token has `abs(deviationPct) <= 15`

Required evidence:

1. Authenticated `/api/admin/pool-state` response showing `github.rows[*].requests24h`.
2. Raw Redis confirmation that `pool:github:usage:*` keys exist for the same 24h window.
3. Computed table: token label, `requests24h`, `deviationPct`, PASS/FAIL per token.
4. Final line: `passWithinPlusMinus15Pct=true|false`.

If FAIL:

1. Open/refresh a release issue with top skewed tokens and exact deviation.
2. Check for stale quarantine keys: `pool:github:quarantine:*`.
3. Confirm selector behavior in `src/lib/github-token-pool.ts` before rotating more keys.

## Completion Evidence Template

```text
Secret: CRON_SECRET
Rotated at (UTC): 2026-05-04T10:30:00Z
New value (masked): abcd...wxyz
Updated surfaces: GitHub Actions, Vercel, Railway
Verification:
- freshness:check => blocking_non_green=0
- cron probe => 2xx with new secret, 401 without secret
Rollback: not needed
```

## Rollback

If validation fails:

1. Restore last known-good secret from secure store.
2. Re-run minimum verification commands.
3. Escalate with blocker and unblock owner.
4. Schedule re-rotation within 24h.

## Escalate To CTO

- Secret leak or suspected leak.
- Rotation requires policy/business decision.
- Missing provider/Sentry access prevents verification.
