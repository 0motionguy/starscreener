# Proposal: Restore ISR on routes that read searchParams server-side

**Status:** PROPOSAL — needs operator design call before execution.
**Discovered:** 2026-05-15 by `npm run perf:routes:prod` during PR #1253 verification.
**Author:** Claude (CTO seat)
**Estimated effort:** 1-2 days, depending on URL strategy.

## The bug

Twelve of 27 production routes return `Cache-Control: private, no-cache, no-store, max-age=0` instead of ISR caching. TTFB on uncached lambdas is 2-3 seconds for these routes; popular surfaces (`/skills`, `/signals`, `/top10`) feel slow on cold visits.

Each affected route has `export const revalidate = N` (suggesting ISR is intended) but Next.js 15 forces dynamic rendering whenever a server component reads `searchParams`. The `revalidate` setting is silently ignored.

Affected routes (per `npm run perf:routes:prod`):

| Route | Searchparams shape | Filter intent |
|---|---|---|
| `/skills` | `?list=<slug>` | Filter by curator-list taxonomy (4 lists) |
| `/signals` | `?source=&window=&topic=` | Multi-filter |
| `/top10` | Complex `Top10SearchParams` | Window + ranking mode |
| `/revenue` | `?category=` | Category filter |
| `/producthunt` | `?tab=` | Tab switcher |
| `/npm` | `?range=` | Window (24h/7d/30d) |
| `/breakouts` | `?filter=` | Filter |
| `/categories` | `?window=` | Window |
| `/reddit/trending` | TBD | TBD |

## Why this is sprint-scale work

Each route has different filter shape and different rendering dependencies on that filter:

- `/npm` recomputes the sort order based on `range` — different rows are surfaced per window.
- `/skills` recomputes leaderboards (top-N, breakouts, KpiBand) on the filtered subset — list-internal rankings differ from all-skills rankings.
- `/signals` has three independent filters that compose multiplicatively (3 windows × 8 sources × N topics).

There is no one-size-fits-all fix.

## Three URL/UX strategies, operator picks per route

### Strategy A — path-based routing (best for single-window/tab filters)

Move the filter to a path segment, e.g. `/npm/[window]/page.tsx` with `generateStaticParams: [{window:'24h'},{window:'7d'},{window:'30d'}]`. Each variant gets its own ISR cache.

- ✅ Pure ISR, fully static after first hit per variant.
- ✅ Crawler-friendly — each variant is a distinct indexable URL.
- ❌ URL changes — `?range=X` → `/X`. Old bookmarks need redirects.
- ❌ Scales poorly when filter is multi-dimensional (`/signals` would need 27+ combinations).
- **Fits:** `/npm`, `/breakouts`, `/categories`, `/revenue`, `/producthunt`.

### Strategy B — client-side filter (best for multi-filter / UX-rich routes)

Server renders the unfiltered page as ISR. A nested client component reads `useSearchParams()` to apply the filter via DOM hiding or local state.

- ✅ ISR-friendly — server doesn't read URL.
- ✅ Filter UX preserved exactly.
- ✅ Multi-filter scales (just read each param client-side).
- ❌ Initial paint shows unfiltered view; JS hydrates filtered view → brief flicker.
- ❌ Larger payload (all items shipped, not the filtered subset).
- ❌ Leaderboards/KpiBands can't be filter-aware unless precomputed for all variants.
- **Fits:** `/signals`, `/skills` (if curator-list rankings can be computed for all 4 lists at build time).

### Strategy C — drop the filter, single canonical view

Remove server-side filter support entirely. Page always renders the default view. Filter feature is retired.

- ✅ Simplest restoration of ISR.
- ❌ Feature regression — visible UX loss.
- **Fits:** Routes where the filter is low-usage and not worth the architecture effort.

## Recommended sequencing

1. **Operator decides:** for each affected route, pick A / B / C.
2. **One canary PR per strategy:** ship one route under A, one under B (skip C unless something turns out unused).
3. **Pattern-scale:** apply the chosen strategy to remaining routes in batches.

## Verification gate

For each fixed route, the gate is `npm run perf:routes:prod --only=/<route>` returning `cache-control: public, s-maxage=<N>` and TTFB under the per-route budget in `perf/routes.json`.

## Out of scope

- Bundle bloat fixes (`/twitter` 318 KB, `/reddit/trending` 621 KB) — separate concern, different fix (code-splitting + lazy-load).
- `/repo/sindresorhus/ky` 6.4s TTFB on cold cache — likely a `buildCanonicalRepoProfile` hot-path issue.
- `/api/health?soft=1` 3.1s — slow downstream check.

These are listed in the PR #1253 comment for awareness.
