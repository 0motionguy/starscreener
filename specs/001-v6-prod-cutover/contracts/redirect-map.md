# Contract: Redirect Map

**Feature**: 001-v6-prod-cutover | **Date**: 2026-05-21

Canonical mapping of all 95 redirect rules. Source of truth for the `redirects()` array
in `next.config.ts`. Every entry resolves to a 200-OK page within ≤2 hops per FR-015.

The full enumeration of the 22 aggregator + 63 collection routes requires a one-time
sitemap scrape of the pre-cutover live site (see `quickstart.md` § Phase 0 prep,
step "Snapshot the legacy sitemap"). The table below shows the canonical pattern for
each category — the actual `next.config.ts` entries are generated from the sitemap
snapshot at implementation time.

---

## Category A — Moved (4 routes)

| `legacy_path` | `target_path` | `seo_value` |
|---------------|---------------|-------------|
| `/top10` | `/tools/top-10` | high |
| `/tierlist` | `/tools/tier-list` | high |
| `/compare` | `/tools/compare` | high |
| `/digest` | `/tools/digest` | high |

## Category B — Renamed (2 routes)

| `legacy_path` | `target_path` | `seo_value` |
|---------------|---------------|-------------|
| `/breakouts` | `/breakout` | high |
| `/signals` | `/market-signals` | high |

## Category C — Marketing 308 Targets (4 routes)

`/pricing` and `/contact` are NOT in this table — they are preserved as 200 pages
(see Category D below).

| `legacy_path` | `target_path` | `seo_value` |
|---------------|---------------|-------------|
| `/about` | `/` | medium |
| _(3 more to be enumerated from sitemap)_ | `/` | low |

## Category D — Preserved Marketing (200 pages, NOT redirects)

These are tracked here for completeness — they're NOT entries in `redirects()`. They are
new App Router pages at `src/app/(marketing)/pricing/page.tsx` and
`src/app/(marketing)/contact/page.tsx`.

| `path` | Backing file | Source of content |
|--------|--------------|-------------------|
| `/pricing` | `src/app/(marketing)/pricing/page.tsx` | One-time WebFetch of `https://trendingrepo.com/pricing` |
| `/contact` | `src/app/(marketing)/contact/page.tsx` | One-time WebFetch of `https://trendingrepo.com/contact` |

## Category E — Aggregator (22 routes)

Generated from sitemap at implementation time. Examples:

| `legacy_path` (representative) | `target_path` (default) | `seo_value` |
|--------------------------------|-------------------------|-------------|
| `/githubrepo` | `/` | medium |
| `/arxiv` | `/` | medium |
| `/hackernews` | `/` | medium |
| `/producthunt` | `/` | medium |
| _(18 more)_ | varies | medium |

**Defaulting rule**: If no v6 route is a meaningful semantic match for a legacy
aggregator, the redirect target is `/` (homepage). Each entry is reviewed during
implementation to upgrade the target where a better match exists (e.g., `/arxiv` → an
arXiv-cited section of v6 if one exists).

## Category F — Collection (63 routes)

Dynamic-pattern routes like `/category/<slug>`, `/topic/<slug>`.

**Strategy**: Wildcard catch-all entries in `next.config.ts`:

```ts
{ source: '/category/:slug*', destination: '/', permanent: true },
{ source: '/topic/:slug*', destination: '/', permanent: true },
// + one wildcard per legacy collection prefix
```

The full prefix list (estimated 5–8 distinct prefixes covering all 63 routes) is
enumerated from the sitemap at implementation time.

---

## next.config.ts Integration Sketch

```ts
// next.config.ts
async redirects() {
  return [
    // Category A — Moved (4)
    { source: '/top10', destination: '/tools/top-10', permanent: true },
    { source: '/tierlist', destination: '/tools/tier-list', permanent: true },
    { source: '/compare', destination: '/tools/compare', permanent: true },
    { source: '/digest', destination: '/tools/digest', permanent: true },

    // Category B — Renamed (2)
    { source: '/breakouts', destination: '/breakout', permanent: true },
    { source: '/signals', destination: '/market-signals', permanent: true },

    // Category C — Marketing 308 (4)
    { source: '/about', destination: '/', permanent: true },
    // ... 3 more from sitemap

    // Category E — Aggregator (22)
    { source: '/githubrepo', destination: '/', permanent: true },
    { source: '/arxiv', destination: '/', permanent: true },
    // ... 20 more

    // Category F — Collection wildcards (5–8 entries covering 63 routes)
    { source: '/category/:slug*', destination: '/', permanent: true },
    { source: '/topic/:slug*', destination: '/', permanent: true },
    // ...
  ];
}
```

**Total `redirects()` array entries**: ~37 (4 + 2 + 4 + 22 + ~5 wildcards).

---

## Validation Contract

The cutover gate FAILS if:
- Any entry in this map maps `legacy_path` to a `target_path` that does not return 200
  on the cutover deploy URL.
- Any entry produces a redirect chain >2 hops.
- The total number of `next.config.ts` redirect entries does NOT match the count
  derived from the sitemap snapshot (off-by-one indicates a missing legacy URL).
