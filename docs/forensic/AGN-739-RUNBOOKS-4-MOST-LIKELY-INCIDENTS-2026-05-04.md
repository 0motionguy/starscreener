# AGN-739 Release SRE Incident Runbooks (Top 4 Likely)

- Timestamp (heartbeat): 2026-05-04T23:22:00+08:00
- Scope owner: Release SRE
- Evidence basis: live checks executed in this heartbeat (not prior audit claims)

## Live evidence snapshot

- `npm run freshness:check` -> **failed** with `GET /api/cron/freshness/state` returning `HTTP 500` on `http://localhost:3023`.
- `https://trendingrepo.com/api/health?soft=1` -> **HTTP 200**.
- `https://trendingrepo.com/api/cron/freshness/state` (with local `CRON_SECRET` if present) -> **HTTP 401**.
- `gh run list --limit 20 ...` -> **HTTP 401 Bad credentials**.
- `railway status` -> project `starscreener`, env `production`, service `trendingrepo-worker`.
- `https://trendingrepo-worker-production.up.railway.app/healthz` -> `{"ok":true,"db":true,"redis":true,...}`.
- `vercel env ls` -> blocked: `VERCEL_PROJECT_ID` set but `VERCEL_ORG_ID` missing.

---

## Incident 1: Freshness Endpoint Failure (`/api/cron/freshness/state` 5xx locally)

### Trigger
- `npm run freshness:check` fails with `GET /api/cron/freshness/state -> HTTP 500` while localhost is reachable.

### Triage steps
1. Confirm app reachability:
   - `curl http://localhost:3023/api/health?soft=1`
2. Confirm freshness endpoint behavior:
   - `curl http://localhost:3023/api/cron/freshness/state`
3. Check server logs for typed error category from `src/lib/errors.ts`.
4. Inspect recent freshness/state code path changes under `src/app/api/cron/freshness/*` and data-store consumers.

### Stale deploy vs code failure
- If production `GET /api/health?soft=1` is 200 and only local endpoint is failing: likely **local/runtime code-path failure**.
- If both local and production freshness endpoints fail with same signature after deploy: likely **deployed code failure**.

### Immediate mitigation
- Keep release gate closed (`do not mark release healthy`).
- Re-run last known good commit locally for compare if available.

### Rollback path
1. Identify last merged healthy PR on `main`.
2. Revert the offending freshness-route change in a focused PR.
3. Merge and verify:
   - local `npm run freshness:check` exits 0
   - production `/api/cron/freshness/state` returns 200/expected payload

---

## Incident 2: Cron Auth Failure (production freshness endpoint returns 401)

### Trigger
- Production `GET /api/cron/freshness/state` returns `401` during release verification.

### Triage steps
1. Validate secret header usage from workflow and manual check (`x-cron-secret`).
2. Compare configured secret value alignment across:
   - GitHub Actions secret `CRON_SECRET`
   - Vercel production env `CRON_SECRET`
3. Run one controlled probe with explicit header and capture HTTP code.

### Stale deploy vs code failure
- 401 with healthy app (`/api/health?soft=1` = 200) usually means **configuration/auth mismatch**, not a code panic.

### Immediate mitigation
- Pause cron-dependent freshness judgments until auth path is restored.
- Treat freshness as **unknown/blocked** instead of green.

### Rollback path
1. Restore previous known-good `CRON_SECRET` on both GitHub and Vercel.
2. Re-run `cron-freshness-check` workflow manually.
3. Confirm endpoint returns expected non-401 response.

---

## Incident 3: GitHub Actions Visibility/Auth Failure (`gh` 401)

### Trigger
- `gh run list` and related actions APIs fail with `HTTP 401 Bad credentials`.

### Triage steps
1. Check `gh auth status`.
2. Validate token scopes for Actions read (`repo`, `workflow`).
3. Retry `gh run list --limit 20 --json ...`.

### Stale deploy vs code failure
- This is an **operator credential failure**; deploy may be healthy but unverifiable from this shell.

### Immediate mitigation
- Move to secondary verification channel (GitHub web UI or another authenticated runner).
- Do not claim workflow health without authenticated evidence.

### Rollback path
1. Re-auth `gh` with a known-good token.
2. Re-collect workflow evidence for last runs.
3. If credential rotation caused outage, revert to prior automation token and rotate safely later.

---

## Incident 4: Vercel CLI Target Misconfiguration (`VERCEL_ORG_ID` missing)

### Trigger
- `vercel env ls` fails: `VERCEL_PROJECT_ID` set but `VERCEL_ORG_ID` missing.

### Triage steps
1. Confirm active Vercel linkage in `.vercel/project.json`.
2. Export both vars together (`VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`) for CLI session.
3. Re-run `vercel env ls` and deployment state checks.

### Stale deploy vs code failure
- If app endpoints are healthy but Vercel CLI access fails, this is **release-observability/config failure**, not necessarily runtime code failure.

### Immediate mitigation
- Use Vercel dashboard to verify latest deployment SHA and health until CLI context is repaired.

### Rollback path
1. Restore correct org/project env pair for the SRE shell/session.
2. Verify latest deployment alias points at expected commit.
3. If a bad deploy is confirmed, promote prior healthy deployment or revert merge and redeploy.

---

## Release verification minimum set (must pass before DONE)

1. Freshness check succeeds locally (`npm run freshness:check` exit 0).
2. Production health endpoint returns 200.
3. Cron freshness endpoint auth path returns non-401 expected response.
4. GitHub Actions latest critical workflows are readable with valid auth and no new failures.
5. Railway worker `/healthz` reports `ok=true`, `db=true`, `redis=true`.
6. Vercel deployment target/visibility is confirmed (CLI or dashboard) and maps to expected commit.
