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

## Heartbeat replay update (2026-05-05, process_lost_retry)

### Freshness replay (required)
- Ran `npm run freshness:check` from repo root.
- Output: `freshness-check: fetch failed (code=ECONNRESET errno=-4077 read ECONNRESET)`.
- Follow-up endpoint probes:
  - `GET http://localhost:3023/api/health?soft=1` -> `Unable to connect to the remote server`
  - `GET http://localhost:3023/api/cron/freshness/state` -> `Unable to connect to the remote server`
- Classification for this heartbeat: **no localhost:3023 server reachable** (environment/server availability failure), not a confirmed product-route HTTP failure.

### Replay conclusion status
- GitHub token-pool rotation and quota-visibility implementation remains verified by code-path replay in this heartbeat.
- Live runtime surface verification (`/admin/pool`, `/admin/pool-aggregate`) remains pending until localhost server is available in-session.

### Control-plane blocker
- Attempted to post Paperclip issue comment and terminal status for this heartbeat via `$PAPERCLIP_API_URL` (`http://192.168.192.1:3100`).
- Result: connection failure (`Unable to connect to the remote server` / `curl: (7) Failed to connect`).
- Impact: issue-thread evidence comment + terminal PATCH could not be submitted from this runtime despite work completion in-repo.

## Heartbeat replay update (2026-05-05, localhost-missing-confirmed)

### Freshness replay (required)
- Ran `npm run freshness:check` from repo root (`C:\Users\mirko\OneDrive\Desktop\STARSCREENER`).
- Output: `freshness-check: local server not reachable at http://localhost:3023 ... (code=ECONNREFUSED)`.
- Classification for this heartbeat: **no localhost:3023 server reachable** (environment/server availability failure), not a product-route HTTP failure.

### Rotation + quota visibility replay (verified paths)
- Rotation core: `src/lib/github-token-pool.ts` (`getNextToken`, `recordRateLimit`, `quarantine`, `GitHubTokenPoolExhaustedError`, `GitHubTokenPoolEmptyError`).
- Runtime caller with retries/backoff + quarantine flow: `src/lib/github-fetch.ts`.
- Per-process visibility surface: `src/app/admin/pool/page.tsx`.
- Fleet aggregate visibility surface: `src/app/admin/pool-aggregate/page.tsx`.
- Fleet reducer: `src/lib/github-token-pool-aggregate.ts`.
- Admin telemetry API lane: `src/app/api/admin/pool-state/route.ts`.

### Replay conclusion status
- GitHub token-pool rotation behavior remains **implemented and wired**.
- Quota visibility remains **implemented** in both local and fleet views.
- Live browser/API rendering verification of `/admin/pool` and `/admin/pool-aggregate` remains pending until localhost is available in-session.
