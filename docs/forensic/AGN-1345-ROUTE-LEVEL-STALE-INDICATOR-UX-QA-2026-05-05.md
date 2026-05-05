# AGN-1345 Route-level stale indicator UX consistency QA evidence (2026-05-05)

## Mandatory opening compliance
Read in this heartbeat before QA work:
- `CLAUDE.md`
- `docs/ENGINE.md`
- `docs/SITE-WIREMAP.md`
- `docs/AUDIT-2026-05-04.md`
- `docs/forensic/00-INDEX.md`
- `tasks/CURRENT-SPRINT.md`
- `tasks/BACKLOG.md`

## Freshness check evidence
Command:
```powershell
npm run freshness:check
```
Result:
- Exit code: `1`
- Failure: `'tsx' is not recognized as an internal or external command`
- Classification: environment/tooling blocker (cannot execute scripted freshness gate)

Required localhost classification fallback probes:
```powershell
Invoke-WebRequest http://localhost:3023/api/health?soft=1
Invoke-WebRequest http://localhost:3023/api/cron/freshness/state
```
Both probes returned:
- `Unable to connect to the remote server`

Conclusion:
- `localhost:3023` is **missing** in this heartbeat (connection refused/unreachable), so route-level stale indicator UX cannot be browser-verified locally.

## AGN-1345 acceptance/traceability lookup
Searches run against `tasks/` and `docs/` for `AGN-1345` and stale-indicator wording returned no scoped acceptance text in-repo.

Implication:
- Acceptance criteria are currently not discoverable from local sprint/backlog/docs context.

## Paperclip closure-path blocker
Attempted issue API fetch:
```powershell
Invoke-RestMethod "$env:PAPERCLIP_API_URL/api/issues/AGN-1345"
```
Result:
- `Unable to connect to the remote server`
- `PAPERCLIP_API_URL=http://192.168.192.1:3100`
- Host ping reachable, but TCP `:3100` connect fails/timeouts.

Impact:
- Cannot post required evidence comment or terminal status PATCH from this runtime.

## QA verdict for this heartbeat
Status: **BLOCKED**

Blocked on:
1. Local runtime unavailable at `http://localhost:3023` (cannot execute route/browser stale-indicator verification).
2. Missing local `tsx` runtime in current environment (`npm run freshness:check` cannot run).
3. Paperclip API TCP connectivity to `192.168.192.1:3100` unavailable (cannot submit mandatory comment + terminal PATCH).

Needs:
- Platform owner to restore/start local app at `localhost:3023`.
- Environment owner to install/restore project dependencies providing `tsx`.
- Paperclip/control-plane owner to restore API access on `192.168.192.1:3100` for status PATCH.