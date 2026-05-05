# AGN-261 Frontend stale-surface indicators on home and top10 (2026-05-05)

## Scope
- Route: `/` (`src/app/page.tsx`)
- Route: `/top10` (`src/app/top10/page.tsx`)
- Goal: ensure visible freshness indicators reflect real upstream freshness instead of render-time freshness.

## Code evidence

### Home (`/`)
- `src/app/page.tsx:890` renders the page-head clock from `lastFetchedAt`.
- `src/app/page.tsx:892` renders `FreshnessBadge source="reddit" lastUpdatedAt={lastFetchedAt}`.
- `src/app/page.tsx:14` imports `lastFetchedAt` from `@/lib/trending`.
- `docs/SITE-WIREMAP.md:55` maps `/` to `getDerivedRepos() + lastFetchedAt (trending)` via `scrape-trending` (hourly).

### Top10 (`/top10`)
- `src/app/top10/page.tsx:115` runs `refreshTrendingFromStore()` before reads.
- `src/app/top10/page.tsx:173` sets `computedAt = lastFetchedAt` (no `new Date()` freshness illusion).
- `src/app/top10/page.tsx:191` renders `FreshnessBadge source="reddit" lastUpdatedAt={lastFetchedAt}`.
- `docs/SITE-WIREMAP.md:126` maps `/top10` surface to snapshot workflows; current page implementation still derives visible freshness from `lastFetchedAt` in trending cache.

## Timestamp / badge to backend-source-key mapping

| Surface | UI element | Code source | Backend/source key lineage |
|---|---|---|---|
| `/` | header clock (`refreshedTime`) | `lastFetchedAt` from `@/lib/trending` | `trending` payload freshness (scrape-trending cadence) |
| `/` | freshness badge | `FreshnessBadge(... lastUpdatedAt={lastFetchedAt})` | same `trending` freshness key |
| `/top10` | page clock (`computedClock`) | `computedAt = lastFetchedAt` | `trending` payload freshness (not render timestamp) |
| `/top10` | freshness badge | `FreshnessBadge(... lastUpdatedAt={lastFetchedAt})` | same `trending` freshness key |

## Minimal UI guardrail recommendations (DEAD/YELLOW keys)

1. Keep the current badge visible at page head on both routes (already done) so stale/dead states are explicit.
2. Add one conditional copy line under each page clock when badge resolves to `COLD`: `Data stale — ranking may be outdated`.
3. Add one conditional copy line for `STALE`: `Data delayed — last successful refresh exceeded warn threshold`.
4. If freshness state API is reachable, map blocking keys from `/api/cron/freshness/state` to a compact warning strip; if unreachable (HTTP 500), render `Freshness status unavailable` instead of implying healthy state.

## Browser evidence (current behavior)

- Local captures (`localhost:4127`) show freshness badge presence on both routes:
  - `.tmp-agn261-home.png`
  - `.tmp-agn261-top10.png`
- Capture script output (Playwright):
  - `HOME HAS_BADGE=true`
  - `TOP10 HAS_BADGE=true`

