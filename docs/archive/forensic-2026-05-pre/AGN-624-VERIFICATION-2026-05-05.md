# AGN-624 Verification - 2026-05-05

Issue: AGN-624 [SPEED-7] Streaming SSR on /githubrepo top-50 list
Route: https://trendingrepo.com/githubrepo

## Implementation status
- Streaming SSR refactor present in `src/app/githubrepo/page.tsx` via top-level `Suspense` and streamed async payload component.
- Loading, empty, and error shells are implemented.

## Evidence artifacts
- Desktop screenshot (after): `qa-artifacts/agn-624-githubrepo-desktop-after.png`
- Mobile 375 screenshot (after): `qa-artifacts/agn-624-githubrepo-mobile375-after.png`
- Tablet 768 screenshot (after): `qa-artifacts/agn-624-githubrepo-tablet768-after.png`
- Lighthouse JSON (after): `qa-artifacts/agn-624-lighthouse-after.json`

## TTFB measurements (prod route)
Command:
`curl -w '%{time_starttransfer}' -o /dev/null -s https://trendingrepo.com/githubrepo`

5-run sample (seconds):
- 0.504636
- 0.154534
- 0.161780
- 0.149172
- 0.153076

10 sequential requests (seconds):
- 0.601514
- 0.159668
- 0.153815
- 0.145200
- 0.145942
- 0.144367
- 0.142534
- 0.141549
- 0.143977
- 0.144448

Observation:
- First request is colder (~0.50-0.60s); subsequent requests stabilize around ~0.14-0.16s, consistent with cache warm behavior.

## Lighthouse (after)
Extracted from `qa-artifacts/agn-624-lighthouse-after.json`:
- Performance: 0.74
- Accessibility: 0.92
- Best Practices: 1.00
- SEO: 0.92
- LCP: 6.1 s
- Root doc server response time: 480 ms
- FCP: 2.0 s
- TBT: 170 ms
- Speed Index: 2.8 s

## Required checks attempted (CTO sweep)
- `npm run typecheck` -> currently fails on unrelated existing TS issues (scripts/tests/routes), not AGN-624 route code.
- `npm run build` -> advanced past prior blockers after local unblock fixes:
  - fixed `src/app/tierlist/page.tsx` by moving `ssr:false` dynamic import into client island wrapper.
  - fixed `src/app/api/oembed/route.ts` runtime from `edge` to `nodejs` to avoid Node built-in resolution failure chain.
  - build now fails on unrelated repo-wide lint errors (e.g. `react/jsx-no-comment-textnodes` in other routes), outside AGN-624 changes.

## Unblock actions completed in this heartbeat
- Added `src/components/tier-list/TierListEditorIsland.tsx` client wrapper for dynamic no-SSR editor.
- Updated `src/app/tierlist/page.tsx` to render `TierListEditorIsland` instead of server-side `dynamic(..., { ssr:false })`.
- Updated `src/app/api/oembed/route.ts` runtime to `nodejs`.

## Gaps to close before issue closure
- Before-vs-after Lighthouse delta is not available in this heartbeat (only after snapshot captured).
- Bundle analyzer before/after screenshot not captured in this heartbeat (build currently failing globally).

## Next action
- Once global build/typecheck blockers are resolved on trunk, rerun:
  - `npm run typecheck`
  - `npm run build`
  - `npm run analyze` (or equivalent bundle analyzer capture)
  - Lighthouse before/after comparison for `/githubrepo`
