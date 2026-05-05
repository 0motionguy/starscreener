# GitHub token pool exhausted runbook

Purpose: restore GitHub-backed ingestion/runtime when PAT pool exhaustion or quarantine causes GitHub calls to fail.

Scope owner: Release SRE  
Primary code paths: `src/lib/github-token-pool.ts`, `src/lib/github-fetch.ts`  
Primary ops surfaces: `/admin/pool`, `/admin/pool-aggregate`, Sentry (`alert=github-pool-exhausted`)

## Trigger conditions

- Sentry exception: `GitHubTokenPoolExhaustedError` (`source=github`, `category=fatal`, `pool=github`)
- Runtime warnings/errors include:
  - `[github-token-pool] All tokens exhausted...`
  - `[github-token-pool] All tokens quarantined (401 invalid/revoked)...`
  - `[github-fetch] pool exhausted on ...`
- `/admin/pool` or `/admin/pool-aggregate` shows exhausted/quarantined majority.

## Preconditions

- Vercel production env access for `trendingrepo.com`.
- GitHub PAT management access (to mint/rotate tokens).
- Admin auth access for `/admin/pool` and `/admin/pool-aggregate`.
- Access to Sentry project used by this app.

## Known behavior (verified from code)

- Pool sources are `GITHUB_TOKEN` plus CSV from `GH_TOKEN_POOL` and `GITHUB_TOKEN_POOL`.
- 401 responses quarantine a token for 24h (`QUARANTINE_TTL_MS`).
- 403/429 with exhausted headers are treated as rate-limit pressure and retried on another token.
- If no usable token remains, `GitHubTokenPoolExhaustedError` is thrown and captured to Sentry.
- Pool state is published to Redis under `pool:github:tokens:*` and aggregated at `/admin/pool-aggregate`.

## Triage decision tree

1. Open `/admin/pool-aggregate`.
2. If `quarantined` is high and many tokens are `401`-driven, treat as invalid/revoked PAT incident.
3. If `exhausted` is high with valid resets in the future, treat as quota incident.
4. Confirm Sentry event tags:
   - `all_quarantined=true` -> credential/permission failure.
   - `all_quarantined=false` with soonest reset -> quota depletion.

## Recovery procedure

1. Capture evidence before changes:
   - Screenshot or copy of `/admin/pool-aggregate`.
   - Recent Sentry event payload with tags (`pool`, `all_quarantined`, `soonest_reset_iso`).
2. Rotate/add PATs:
   - Mint new GitHub PATs with required repo/API scopes.
   - Update Vercel production env:
     - `GITHUB_TOKEN` (single fallback token)
     - `GH_TOKEN_POOL` (comma-separated additional tokens)
   - Keep `GITHUB_TOKEN_POOL` only if intentionally used; avoid split-brain values.
3. Redeploy production after env update.
4. Validate post-deploy:
   - `/admin/pool` shows non-empty healthy tokens.
   - `/admin/pool-aggregate` shows recovery in `totalRemaining`, reduced exhausted/quarantined counts.
   - Sentry stops emitting new `github-pool-exhausted` events.
5. Validate cron/runtime impact:
   - Check latest `scrape-trending` and other GitHub-heavy workflows in GitHub Actions.
   - Verify key pages/API depending on GitHub calls no longer degrade.

## Rollback

If rotation introduces broader failures:

1. Revert to last known-good PAT set in Vercel env vars.
2. Redeploy immediately.
3. Re-check `/admin/pool(-aggregate)` and Sentry for stabilization.
4. Re-open incident with root cause notes (scope mismatch, revoked PAT, wrong org token, etc.).

## Verification commands and checks

```bash
# Local freshness signal (stale vs missing localhost)
npm run freshness:check

# GitHub Actions quick status (replace workflow as needed)
gh run list --workflow scrape-trending.yml --limit 5
```

Admin pages for live verification:

- `https://trendingrepo.com/admin/pool`
- `https://trendingrepo.com/admin/pool-aggregate`

## Incident evidence checklist (attach to issue)

- Timestamped Sentry exhaustion event (with tags).
- Before/after snapshots from `/admin/pool-aggregate`.
- Vercel env change + deploy timestamp.
- Post-recovery workflow run evidence (`scrape-trending` or equivalent).
- Post-recovery freshness check result.

## 2026-05-04 heartbeat note (AGN-473)

- Mandatory opening protocol executed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/archive/forensic-2026-05-pre/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` result: timed out contacting `http://localhost:3023` (stale/degraded; localhost not proven missing).
