# AGN-1125 Error/Loading/Empty-State Coverage Audit (2026-05-05)

Issue: AGN-1125  
Scope: frontend audit only (no code changes)  
Auditor: paperclip-frontend  
Timestamp: 2026-05-05

## 1) Mandatory opener and freshness gate

- Mandatory docs/tasks opener completed this heartbeat.
- `npm run freshness:check` result: localhost reachable (not missing), but product stale/degraded (`health=stale`, `blocking_non_green=27`, `dead=18`).

## 2) Route inventory: loading/error coverage for top user-facing routes

Audit set (32 routes): `/`, `/consensus`, `/skills`, `/mcp`, `/agent-repos`, `/breakouts`, `/signals`, `/hackernews/trending`, `/lobsters`, `/devto`, `/bluesky/trending`, `/reddit/trending`, `/twitter`, `/producthunt`, `/npm`, `/huggingface/trending`, `/huggingface/datasets`, `/huggingface/spaces`, `/funding`, `/revenue`, `/arxiv/trending`, `/research`, `/digest`, `/ideas`, `/predict`, `/categories`, `/collections`, `/watchlist`, `/compare`, `/tierlist`, `/mindshare`, `/top10`.

Result summary:
- `loading.tsx`: present for all 32/32
- `error.tsx`: present for all 32/32
- route `page.tsx`: present for 31/32
- outlier: `/collections` has no `page.tsx`; served by `src/app/collections/route.ts` while still keeping `loading.tsx` + `error.tsx`

## 3) Missing resilient-state findings (with paths)

1. Route architecture outlier (not a hard break, but parity risk):
   - Route: `/collections`
   - Missing page component: `src/app/collections/page.tsx` (absent)
   - Current files: `src/app/collections/route.ts`, `src/app/collections/loading.tsx`, `src/app/collections/error.tsx`
   - Risk: route-level behavior differs from normal App Router page boundary assumptions.

2. No direct missing `loading.tsx`/`error.tsx` files were found in the top-route set.

## 4) Browser fallback verification (simulated slow/error)

### 4.1 Slow-loading simulation

Method:
- Playwright on production `https://trendingrepo.com`
- Added 500ms delay to `_next` and `_rsc` requests during route transitions
- Probed routes: `/signals`, `/twitter`, `/skills`, `/compare`, `/top10`

Observed:
- Loading fallback UI was not observed (`.animate-pulse` false, loading-text false) on all 5 routes.
- This can indicate either fast completion or loading UI not presented long enough during nav transitions.

### 4.2 Forced error simulation

Method:
- Playwright on production
- Forced one matching `_rsc` request to return HTTP 500 during nav
- Probed routes: `/signals`, `/skills`, `/twitter`

Observed:
- `/skills`: error UI detected (fallback visible)
- `/signals`: no error fallback detected under this injected failure mode
- `/twitter`: no error fallback detected under this injected failure mode

Interpretation:
- Error fallback behavior is inconsistent under forced RSC failure across representative routes.

## 5) Patch-ready checklist (no implementation in this issue)

1. Standardize route primitive for `/collections`
- Add or explicitly document `src/app/collections/page.tsx` vs `route.ts` behavior.
- Done when route primitive is consistent with frontend route conventions or exception is documented in wiremap.

2. Add deterministic fallback probes for runtime verification
- Add Playwright assertions per critical route for loading and error fallback visibility.
- Done when CI can report pass/fail for fallback visibility on `/signals`, `/skills`, `/twitter`, `/compare`, `/top10`.

3. Harden fallback visibility under slow navigation
- Ensure loading UI remains observable under delayed RSC/data paths (no flash-only behavior).
- Done when delayed navigation test captures route loading fallback at least once for each audited critical route.

4. Harden error-state parity on signal routes
- Align `/signals` and `/twitter` with `/skills` error fallback observability under injected RSC failures.
- Done when forced-failure test shows error fallback visible on all targeted routes.

5. Verify navigation parity for `/top10`
- In probe run, navigation click ended on home title, indicating nav-route mismatch risk in the tested path.
- Done when deterministic nav to `/top10` from app UI always lands on `/top10` title and route content.

## 6) Evidence commands

- Coverage inventory script (Node inline): checked `page.tsx/loading.tsx/error.tsx/not-found.tsx` presence for 32 top routes.
- Playwright simulation script (Node inline): delayed `_next`/`_rsc` requests and forced one `_rsc` 500 for representative routes.

