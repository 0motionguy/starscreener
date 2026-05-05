# AGN-1152 Data Pipeline Silent Active Run Review (heartbeat evidence)

- Timestamp: 2026-05-05T05:57:36.810Z
- Scope: Review silent active run alert for [ENG] Data Pipeline on AGN-1152.

## Mandatory preflight + freshness evidence

Command:

```powershell
npm run freshness:check
```

Result:
- Exit code: 1
- Localhost reachable: `http://localhost:3023`
- Classification: product failure (not missing localhost server)
- Summary: `green=10 yellow=17 red=5 dead=18 blocking_non_green=35 advisory_non_green=5`
- High-risk keys: `trending-repos=DEAD`, `deltas=RED`, `hot-collections=RED`, `lobsters=RED`, `producthunt=RED`
- Sentry: `MISSING`

## Queue-depth duty + control-plane status

Queue-depth execution is blocked by Paperclip issue API failures from this runtime:
- `GET http://127.0.0.1:3100/health` -> `200`
- `GET http://127.0.0.1:3100/api/companies/{companyId}/agents` -> `{"error":"Internal server error"}`
- `GET http://127.0.0.1:3100/api/issues/{issueId}` -> `{"error":"Internal server error"}`
- `GET http://192.168.192.1:3100/health` (`PAPERCLIP_API_URL`) -> unreachable (`000`)

Impact:
- Cannot fetch direct-report issue counts; no safe queue seeding decision can be made.
- Cannot post AGN-1152 issue comment or terminal PATCH from this runtime.

## Silent-run assessment

- Alert pattern remains a false-positive stale-active-run signal.
- Dominant active risk is freshness degradation and missing Sentry readiness.

## Blocked outcome

- Blocked on: Paperclip control-plane issue API read/write path unavailable from this runtime.
- Needs: platform/control-plane owner to restore `/api/companies/*` and `/api/issues/*` endpoints so CTO heartbeat can persist required terminal status PATCH.
