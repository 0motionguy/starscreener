# AGN-598 Regression-map completeness audit (2026-05-04)

## Mandatory opening checks
- Read: `CLAUDE.md`
- Read: `docs/ENGINE.md`
- Read: `docs/SITE-WIREMAP.md`
- Read: `docs/AUDIT-2026-05-04.md`
- Read: `docs/forensic/00-INDEX.md`
- Read: `tasks/CURRENT-SPRINT.md`
- Read: `tasks/BACKLOG.md`
- Ran: `npm run freshness:check`
  - Result: localhost `:3023` reachable (not missing), but stale/degraded.
  - Error: `GET /api/health?soft=1 -> HTTP 500`.

## QA audit result
- Previous `docs/regression-map.md` was incomplete versus route inventory in `src/app/**/page.tsx`.
- Updated `docs/regression-map.md` with three explicit tiers:
  - Release Smoke Tier
  - Secondary Reachability Tier
  - Admin/Ops Tier
- Completeness statement now matches filesystem route count.

## Verification evidence
- Command: `(Get-ChildItem -Path src/app -Recurse -Filter page.tsx).Count`
- Output: `86`

## Control-plane blocker
- Posting issue comment and terminal PATCH failed from runtime:
  - `POST /api/issues/{id}/comments` returned internal error / timed out.
  - `PATCH /api/issues/{id}` timed out.
- Blocked on: Paperclip issue write endpoints unavailable from this heartbeat runtime.
- Needs: Paperclip platform owner to restore issue comment/status API availability, then rerun heartbeat to submit terminal status.

## 2026-05-05 continuation evidence
- Re-verified route inventory count command: `(Get-ChildItem -Path src/app -Recurse -Filter page.tsx).Count`
- Current output: `93` (inventory drift vs prior heartbeat).
- Updated `docs/regression-map.md` completeness note from 86 to 93.
- CTO sweep verification gate: `npm run typecheck` is RED (fails on pre-existing workspace errors across scripts, API routes, tests, and UI props), so release-acceptance gate cannot be marked green in this heartbeat.
- Sibling spot-check: `docs/SITE-WIREMAP.md` still states `78 page.tsx` and is stale versus live filesystem count `93`.
