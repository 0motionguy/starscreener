# AGN-1466 CTO GitHub token-pool rotation and quota visibility replay audit (2026-05-05)

## Scope
- Issue: `AGN-1466`
- Heartbeat date: `2026-05-05`
- Workspace: `C:\Users\mirko\OneDrive\Desktop\STARSCREENER`

## Mandatory opening protocol evidence
Verified reads completed in this heartbeat:
1. `CLAUDE.md`
2. `docs/ENGINE.md`
3. `docs/SITE-WIREMAP.md`
4. `docs/AUDIT-2026-05-04.md`
5. `docs/forensic/00-INDEX.md`
6. `tasks/CURRENT-SPRINT.md`
7. `tasks/BACKLOG.md`

Freshness command result:
- Command: `npm run freshness:check`
- Result: `freshness-check: local server not reachable at http://localhost:3023 ... (code=ECONNREFUSED)`
- Classification: **localhost missing/unreachable in this run**, not a product-path HTTP 500 failure.

## GitHub token-pool rotation replay (code verification)

### Rotation and selection
- `src/lib/github-token-pool.ts`
  - Pool reads and merges `GITHUB_TOKEN`, `GH_TOKEN_POOL`, and `GITHUB_TOKEN_POOL` with de-dup.
  - `getNextToken()` selects highest remaining quota; tie-break uses round-robin cursor.
  - Exhausted tokens (`remaining<=0` and reset in future) are skipped.
  - Quarantined tokens are skipped until `QUARANTINE_TTL_MS` (24h) expires.
  - Empty pool throws `GitHubTokenPoolEmptyError`; full exhaustion throws `GitHubTokenPoolExhaustedError`.

### Runtime fetch behavior
- `src/lib/github-fetch.ts`
  - Uses pool token per attempt (up to 4 attempts total).
  - Retries external failures with 1s/2s/4s backoff (`RETRY_DELAYS_MS`).
  - On `401`: quarantines token in pool + telemetry quarantine key, emits Sentry, retries with next token.
  - On `403/429` with zero remaining: records quarantine-until-reset telemetry and retries.
  - Records rate-limit headers into pool every response.

## Quota visibility replay (code verification)

### Per-process view
- `src/app/admin/pool/page.tsx`
  - Shows per-token remaining/reset/last-seen/quarantine/health from in-process snapshot.
  - Explicitly documents this is lambda-local state.

### Fleet aggregate view
- `src/lib/github-token-pool.ts` publishes redacted token state to Redis keyspace `pool:github:tokens:<namespace>:<redacted>`.
- `src/lib/github-token-pool-aggregate.ts` reads aggregate state and computes:
  - tokens seen
  - total remaining across fleet
  - exhausted count
  - quarantined count
  - lambdas reporting
- `src/app/admin/pool-aggregate/page.tsx` renders this fleet view and degraded-mode message when Redis unavailable.

### Admin API observability lane
- `src/app/api/admin/pool-state/route.ts`
  - Returns GitHub pool row telemetry including usage, last rate-limit snapshot, quarantine, idle status, anomalies, and headroom.

## Replay verdict
- Rotation logic: **present and enforced** in code.
- Quota visibility: **present** at per-process and fleet levels, with Redis-backed aggregate.
- Freshness preflight in this heartbeat: **blocked by missing localhost:3023**, not by product 500 response.

## Residual risk noted in replay
- Fleet aggregate remains last-write-wins per token (no per-lambda historical timeline in aggregate reducer).
- This heartbeat could not execute a live browser/admin verification because local server was unreachable.
