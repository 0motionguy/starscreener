---
status: archive
audit-date: 2026-05-05
reason: code review report of past state; references may not resolve to current files
---

# AGN-624 PR Draft Checklist (2026-05-05)

Issue: AGN-624 - [SPEED-7] Streaming SSR on /githubrepo top-50 list

## Scope
- Implemented streaming SSR split on `/githubrepo` via `Suspense` + async streamed section.
- Added explicit loading/empty/error states for the streamed table surface.

## Files changed (issue-relevant)
- `src/app/githubrepo/page.tsx`

## Additional unblock-only files changed (not functional AGN-624 scope)
- `src/components/tier-list/TierListEditorIsland.tsx`
- `src/app/tierlist/page.tsx`
- `src/app/api/oembed/route.ts`

## Verification evidence captured
- Visual screenshots (after):
  - `qa-artifacts/agn-624-githubrepo-desktop-after.png`
  - `qa-artifacts/agn-624-githubrepo-mobile375-after.png`
  - `qa-artifacts/agn-624-githubrepo-tablet768-after.png`
- TTFB 5x and 10x sequential captured (prod): see `docs/forensic/AGN-624-VERIFICATION-2026-05-05.md`
- Lighthouse (after): `qa-artifacts/agn-624-lighthouse-after.json`

## Remaining closure gaps
- Lighthouse before-vs-after delta not available yet (before baseline missing).
- Bundle analyzer before/after screenshot not available (global build/typecheck gates currently red).
- Global `npm run typecheck` and `npm run build` are still failing on unrelated repo-wide issues.

## Blocked-by
- Owner: trunk maintainers / issue owners of current global lint+type debt.
- Unblock action:
  1. Resolve existing global lint/type errors outside AGN-624 scope.
  2. Re-run `npm run typecheck` and `npm run build` green.
  3. Capture bundle analyzer and Lighthouse delta pair for final closure.

## Reviewer routing
- Frontend visual delta: Vito or Frontend Polish reviewer per operating charter.
