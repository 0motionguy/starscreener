# AGN-1397 Marco Silent Active Run Review (heartbeat evidence)

- Timestamp: 2026-05-05T07:20:00+08:00
- Scope: Mandatory STARSCREENER opening protocol + stale-active-run review for Marco.
- Assigned issue context: AGN-1397 `Review silent active run for Marco`.

## Mandatory reads completed
1. `CLAUDE.md`
2. `docs/ENGINE.md`
3. `docs/SITE-WIREMAP.md`
4. `docs/AUDIT-2026-05-04.md`
5. `docs/forensic/00-INDEX.md`
6. `tasks/CURRENT-SPRINT.md`
7. `tasks/BACKLOG.md`

## Freshness check execution
Command run from repo root:
```powershell
npm run freshness:check
```

Result:
- Exit code: `1`
- Error: `freshness-check: request timed out while contacting http://localhost:3023`
- Direct probe `http://localhost:3023/api/health?soft=1`: timed out

Classification:
- This is **not** a confirmed product-path freshness contract failure.
- This heartbeat indicates a **local precondition failure** (localhost app endpoint unreachable/hung), so freshness gating cannot be treated as product evidence in this run.

## Silent active run evidence (Marco)
Source run from AGN-1397 payload:
- Run ID: `dd933d46-e38f-4340-9c1b-3d092ae1e327`
- Agent: Marco (`17ef895d-d08d-4f0c-bcca-3c4265dc78f3`)
- Last output recorded in payload: `2026-05-04T21:47:28.701Z`

Live checks during this heartbeat:
- Agent status endpoint: Marco still reports `status=running`.
- Agent heartbeat timestamp: `2026-05-04T16:08:24.996Z`.
- Agent updated timestamp: `2026-05-04T21:40:30.062Z`.
- Source issue `AGN-799` remains `in_progress` with `updatedAt=2026-05-04T21:40:29.936Z`.
- Run-specific lookup endpoints (`/api/agents/{agentId}/runs/{runId}`, `/api/runs/{runId}`) returned `404` in this environment.

Interpretation:
- Marco appears to be stuck in a long-running state with stale heartbeat/output and no new source-issue progress.
- The silent-active-run alert is likely valid and not a harmless quiet interval.

## Operational outcome
- Recommend recovering AGN-799 execution by explicit run recovery control (cancel/restart Marco run) and reassigning if needed.
- No code changes were made in this heartbeat.
