# AGN-720 CTO Engineering Audit — GitHub token-pool rotation + quota visibility

- Timestamp: 2026-05-04T22:47:00+08:00
- Scope: code-trace audit of GitHub PAT rotation and operator visibility surfaces.

## Mandatory opening protocol evidence
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`.
- Result: product-path failure (`GET /api/cron/freshness/state` -> HTTP 500) while localhost `:3023` is reachable.

## Queue-depth duty evidence (pre-work)
- Data Pipeline: 28 open
- Frontend: 42 open
- Backend: 48 open
- QA: 19 open
- Platform Security: 20 open
- Release/SRE: 53 open
- Sprint Triage: 5 open
- No queue <5, so no seed tasks created.

## Token-pool code trace (verified)

1. Pool state + token selection
- File: `src/lib/github-token-pool.ts`
- Token source merge order:
  - `GITHUB_TOKEN`
  - `GH_TOKEN_POOL`
  - `GITHUB_TOKEN_POOL`
- Dedupe + trim is enforced.
- Selection algorithm in `getNextToken()`:
  - skips quarantined tokens (`quarantinedUntilMs > now`)
  - skips exhausted tokens (`remaining <= 0` with future reset)
  - picks highest remaining token
  - round-robin tie-break among equally healthy tokens
- Empty pool throws `GitHubTokenPoolEmptyError`.
- Fully exhausted/quarantined pool throws `GitHubTokenPoolExhaustedError` and emits Sentry exception tagged `source=github category=fatal`.

2. Quota recording + quarantine writes
- File: `src/lib/github-token-pool.ts`
- `recordRateLimit()` updates `remaining/reset` and emits low-quota warning to Sentry once per low-quota episode (`remaining < 500`, hysteresis reset >1000).
- `quarantine()` marks PAT as quarantined for 24h and emits Sentry error tagged `category=quarantine`.
- Both paths publish redacted token state to Redis keyspace `pool:github:tokens:*` for fleet aggregation.

3. Request path integration
- File: `src/lib/github-fetch.ts`
- All calls choose token via pool; on 401 token is quarantined and request retries with a different token.
- 403/429 rate-limit cases record telemetry + Sentry; 5xx paths retry with 1s/2s/4s backoff, then emit recoverable error if exhausted.
- Pool exhaustion triggers typed `GithubPoolExhaustedError`, Sentry capture, and `OPS_ALERT_WEBHOOK` notification path.

4. Visibility surfaces
- Per-process snapshot page: `src/app/admin/pool/page.tsx` (`/admin/pool`)
- Fleet aggregate page: `src/app/admin/pool-aggregate/page.tsx` (`/admin/pool-aggregate`)
- API-state + anomaly surface: `src/app/api/admin/pool-state/route.ts` (`/api/admin/pool-state`, consumed by `/admin/keys`)

## Verified strengths
- Rotation logic is deterministic and quota-aware with quarantine handling.
- Exhaustion and low-quota states are surfaced to Sentry.
- Fleet aggregate view exists and is Redis-backed (not only per-lambda state).
- Token labels are redacted (`first4****last4`) throughout visible surfaces.

## Verified gaps
1. Visibility history is still last-write-wins
- Aggregate state keeps latest token state only; no built-in historical timeline or burn-rate trend per token.

2. Legacy env naming drift remains operator-confusing
- Pool supports both `GH_TOKEN_POOL` and `GITHUB_TOKEN_POOL` for compatibility, but docs and older comments still mixed; this can cause misconfiguration during rotation checks.

3. Freshness route is currently degraded in local product path
- This blocks easy heartbeat-level freshness verification while auditing pool behavior.

## Next concrete patch targets
1. Add rolling pool-history snapshot keys (hour buckets) for per-token remaining/reset trends and reset window burn-rate.
2. Add explicit env-source introspection in `/admin/pool` (which vars were detected, count only; never values).
3. Normalize docs to one operator-facing env name (`GH_TOKEN_POOL`) with explicit compatibility note.
4. Fix `/api/cron/freshness/state` 500 so CTO/OPS heartbeat checks are not degraded.
