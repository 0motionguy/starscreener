# AGN-816 Load Test Validation (2026-05-04)

## Scope
- Issue: AGN-816 `[TEST-3] Load testing — k6 or Artillery against staging before traffic ramp`
- Executor: Release SRE
- Staging target (Vercel preview): `https://starscreener-ebewd7pbl-kermits-projects-6330acd4.vercel.app`
- Deployment id: `dpl_8GKGAg84wN9SPmxf26vkATSqaiqy`
- Alias: `https://starscreener-git-bot-orchestra-79a227-kermits-projects-6330acd4.vercel.app`

## Mandatory opening freshness gate
- Command: `npm run freshness:check`
- Result: `localhost:3023` reachable (not missing), but product stale/degraded.
- Summary: `green=45 yellow=4 red=1 dead=0 blocking_non_green=5`.
- Blocking non-green: `bluesky (RED)`, `npm (YELLOW)`, `producthunt (YELLOW)`, `trending-repos (YELLOW)`, `twitter (YELLOW)`.

## Load test method (bounded)
- `npx artillery quick` and `npx autocannon` timed out in this environment; switched to bounded Node `fetch` concurrency runner.
- Profile used per endpoint: `total=200`, `concurrency=20`.

## Staging load results

### `/`
- URL: `https://starscreener-ebewd7pbl-kermits-projects-6330acd4.vercel.app/`
- Result: `ok=200 fail=0`
- Duration: `7.57s` (`26.43 rps`)
- Latency: `p50=569ms p95=1807ms p99=1884ms max=2255ms`

### `/api/health?soft=1`
- URL: `https://starscreener-ebewd7pbl-kermits-projects-6330acd4.vercel.app/api/health?soft=1`
- Result: `ok=200 fail=0`
- Duration: `8.30s` (`24.09 rps`)
- Latency: `p50=294ms p95=3114ms p99=3650ms max=7628ms`

### `/signals`
- URL: `https://starscreener-ebewd7pbl-kermits-projects-6330acd4.vercel.app/signals`
- Result: `ok=0 fail=200`
- HTTP status distribution probe (`n=120, c=20`): `500=120`
- Header proof: `curl -I` returns `HTTP/1.1 500 Internal Server Error` + `X-Matched-Path: /500`.

## Stale deploy vs code failure distinction
- Production control probe: `curl -I https://trendingrepo.com/signals` returned `HTTP/1.1 200 OK`.
- Preview probe: `curl -I https://starscreener-ebewd7pbl-kermits-projects-6330acd4.vercel.app/signals` returned `HTTP/1.1 500`.
- Conclusion: failure is preview release-specific (code/deploy path), not broad Vercel/network outage.

## Release decision
- `NO-GO` for traffic ramp to this preview.
- Gate not met: staging `/signals` endpoint is hard-failing under light concurrency with 100% 500s.

## Rollback readiness
- Keep production pinned to current healthy deployment while preview is fixed.
- If production regression appears after merge, immediate rollback target from deployment list:
  - current production candidate: `https://starscreener-i89kdb99o-kermits-projects-6330acd4.vercel.app`
  - prior production candidate: `https://starscreener-hflq1o0we-kermits-projects-6330acd4.vercel.app`
- Operator command pattern:
  - `vercel promote <stable-production-deployment-url> --scope kermits-projects-6330acd4`
  - or restore alias with `vercel alias set <stable-production-deployment-url> trendingrepo.com --scope kermits-projects-6330acd4`

## Next actions
1. Backend/platform owner triages preview `/signals` 500 root cause before any ramp.
2. Re-run same bounded load profile after fix and require `0` 5xx on `/`, `/signals`, `/api/health?soft=1`.
3. Attach Vercel function logs for `/signals` failure window to AGN-816.
