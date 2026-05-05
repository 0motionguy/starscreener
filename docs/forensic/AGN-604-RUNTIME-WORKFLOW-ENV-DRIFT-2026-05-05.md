# AGN-604 Runtime vs Workflow Env Drift Audit (2026-05-05)

## Scope
- Compare critical env/config presence across local runtime shell, GitHub Actions control-plane access, Vercel CLI context, and Railway worker env.
- Identify likely causes of `401 unauthorized` and related auth-path failures.
- Recommend minimal sync steps without exposing secret values.

## Evidence Timestamp
- Heartbeat date: 2026-05-05 (Asia/Makassar)
- Mandatory preflight rerun completed.
- `npm run freshness:check` result: `ECONNREFUSED` (`http://localhost:3023` unreachable).

## Commands and Observations
- `npm run freshness:check`
  - Result: `freshness-check: local server not reachable at http://localhost:3023 ... (code=ECONNREFUSED)`.
- `Get-ChildItem Env: ...` (filtered for critical keys)
  - Local shell includes names for `GITHUB_TOKEN`, `GH_TOKEN_POOL`, `CRON_SECRET`, `REDIS_URL`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`, and selected source keys.
  - Local shell does **not** expose `VERCEL_ORG_ID`.
- `gh secret list --json name,updatedAt`
  - Result: `HTTP 401 Bad credentials`.
- `gh variable list --json name,updatedAt`
  - Result: `HTTP 401 Bad credentials`.
- `vercel env ls`
  - Result: CLI hard-fail because `VERCEL_PROJECT_ID` is set but `VERCEL_ORG_ID` is missing.
- `railway variables --environment production` (names-only extraction)
  - Present keys include `REDIS_URL`, `SENTRY_DSN`, and multiple worker-specific keys.
  - Missing keys include `CRON_SECRET`, `GITHUB_TOKEN`, `GH_TOKEN_POOL`, `GITHUB_TOKEN_POOL`.

## Drift Matrix (redacted)

| Key / Capability | Local Shell | GitHub API via `gh` | Vercel CLI Context | Railway Worker | Drift / Risk |
|---|---|---|---|---|---|
| `GITHUB_TOKEN` | present | cannot verify (401) | unknown | missing | Worker and runtime token posture diverges; GitHub-dependent worker flows may fail/degrade. |
| `GH_TOKEN_POOL` / `GITHUB_TOKEN_POOL` | local `GH_TOKEN_POOL` present | cannot verify (401) | unknown | missing | No pool configured in Railway; potential runtime/worker behavior mismatch. |
| `CRON_SECRET` | present | cannot verify (401) | unknown | missing | Worker cannot mirror cron-authenticated internal calls if needed; likely contributor to unauthorized paths when contexts differ. |
| `REDIS_URL` | present | cannot verify (401) | unknown | present | Redis parity exists locally/worker, but GHA cannot be audited due to auth failure. |
| `SENTRY_DSN` | not observed locally | cannot verify (401) | unknown | present | Monitoring asymmetry: worker has DSN, local/runtime context uncertain. |
| GitHub Actions secrets inventory | n/a | **failed (401)** | n/a | n/a | Cannot confirm workflow secret coverage; audit blocked on token scope/validity. |
| Vercel env inventory | partial (`VERCEL_PROJECT_ID` set) | n/a | **blocked (missing `VERCEL_ORG_ID`)** | n/a | Cannot verify production env drift or deploy rollback metadata from CLI. |

## Probable Causes of 401/Unauthorized Failures
1. GitHub control-plane credential drift:
   - `gh` cannot read repo secrets/variables (`401 Bad credentials`), so operational checks and secret parity validation are blocked.
2. Vercel context drift:
   - `VERCEL_PROJECT_ID` is set without `VERCEL_ORG_ID`, causing Vercel CLI auth-context failure and blocking env verification.
3. Runtime/workflow/worker auth-path mismatch:
   - Railway worker env missing `CRON_SECRET` and GitHub token keys while local shell has them; auth behavior and data write/read paths can diverge by lane.

## Minimal Sync Steps (Platform Owner)
1. Restore GitHub CLI control-plane access
   - Refresh `gh` auth/token used in this environment with repo `actions:read` coverage.
   - Re-run:
     - `gh secret list --json name,updatedAt`
     - `gh variable list --json name,updatedAt`
2. Fix Vercel CLI org/project pairing
   - Set `VERCEL_ORG_ID` matching existing `VERCEL_PROJECT_ID`.
   - Re-run `vercel env ls` and capture env-name parity by environment (Production/Preview/Development).
3. Normalize worker auth essentials
   - Decide if worker requires `CRON_SECRET` and GitHub token/pool keys for intended fetchers.
   - If yes, add missing keys in Railway production; if no, document that lane as intentionally isolated.
4. Re-run AGN-604 drift snapshot after sync
   - Produce final matrix with all four lanes verifiable (local, GHA, Vercel, Railway).

## Current Status for AGN-604
- Actionable progress completed: drift evidence captured and probable root causes identified.
- Remaining blocker: control-plane verification is incomplete until GitHub CLI auth and Vercel org context are restored.
