# AGN-1137 Deploy freshness coherence check (ISR vs store)

Date: 2026-05-05 (heartbeat evidence captured from local mandatory opening run)
Owner lane: Release SRE

## Mandatory-opening freshness verdict

Command:

```powershell
npm run freshness:check
```

Observed:
- localhost target `http://localhost:3023` was reachable (not missing).
- Result was stale/degraded, not healthy:
  - `health=stale sourceStatus=ok`
  - `blocking_non_green=27`
  - `summary: green=18 yellow=10 red=4 dead=18`
  - exit was failure (`FAIL freshness source past budget by more than 24h`)

Conclusion:
- This heartbeat is a **stale product** condition, not a localhost-missing condition.

## ISR vs store coherence evidence

1. Home ISR window is short:
   - `src/app/page.tsx` exports `revalidate = 60`.

2. Data-store refresh hook exists for trending payloads:
   - `src/lib/trending.ts` exports `refreshTrendingFromStore()` and documents server components should call it before sync getters.

3. Home read path does not call the refresh hook:
   - `src/app/page.tsx` calls `getDerivedRepos()` from `src/lib/derived-repos.ts`.
   - `src/lib/derived-repos.ts` does not call `refreshTrendingFromStore()`; it assembles from sync getters + bundled/data-file versioning.

Operational impact:
- ISR can re-render every 60s while still deriving from bundled/file-seeded snapshots if store refresh is not invoked on the read path.
- That yields **deploy freshness incoherence**: short ISR interval does not guarantee Redis-fresh content.

## Release SRE classification

- Classification: stale-data coherence risk (not deploy outage).
- Distinguishing signal:
  - Deploy/runtime is serving requests on localhost target.
  - Freshness inventory has high blocking non-green/dead counts.
  - Home route ISR is configured, but read path is not store-refresh-coupled.

## Recommended follow-up owner

- Backend/platform engineer to decide one of:
  1. Preload `refreshTrendingFromStore()` (and related refresh hooks) in the home/server read path before sync getters.
  2. Or explicitly document that home is file-seeded by design and remove store-freshness expectation from release checks.
