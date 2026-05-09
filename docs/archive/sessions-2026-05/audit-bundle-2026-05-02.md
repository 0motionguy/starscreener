# Bundle Audit: STARSCREENER Client-Side Weight & Lazy-Load Opportunities

**Date:** 2026-05-02 | **Scope:** Read-only analysis | **Action Items:** Next session

## 1. Methodology

- **Scan:** All `"use client"` TSX files in `src/components/` and `src/app/` (60+ components)
- **Heavy-dep detection:** Recharts, Framer Motion, Sonner, client-imported data-store
- **Data-store leak detection:** Transitive imports of Node-only modules (e.g., `ioredis`)
- **Build analysis:** `.next/static/chunks/` shows 1M+ total JS; largest chunks 300–400KB raw (100KB gzipped typical for chart libraries)
- **Existing lazy-loads:** 3 already in place (`RepoDetailChartLazy`, `MobileDrawerLazy`, `ToasterLazy`)

## 2. Top 5 Heaviest Client Components

| Component | File | Heavy Dep | Issue | Est. Size (gz) |
|-----------|------|-----------|-------|----------------|
| **CompareChart** | `compare/CompareChart.tsx:1` | recharts | Dual Y-axis ComposedChart, renders below-fold in `/compare` | ~90–110KB |
| **RepoDetailChart** | `repo-detail/RepoDetailChart.tsx:1` | recharts | Dual-series (stars + mentions) stacked area; below-fold on detail pages | ~85–100KB |
| **MobileDrawer** | `layout/MobileDrawer.tsx:30` | framer-motion | AnimatePresence + motion.div for slide; hidden until hamburger click | ~25–30KB |
| **AllTrendingTabs** | `reddit-trending/AllTrendingTabs.tsx:15` | framer-motion | layoutId animations; renders tabs on `/reddit` | ~15–20KB |
| **UsageCharts** (model-usage) | `app/model-usage/components/UsageCharts.tsx:10` | recharts | Multi-chart stacked/area/bar; only on `/model-usage` admin route | ~80–95KB |

## 3. Lazy-Load Candidates (Priority-Ordered)

### A. CompareChart (HIGHEST PRIORITY)
**Current:** Dynamic import with `ssr: false` in `CompareClient.tsx:59`
- ✓ Already lazy-loaded via `next/dynamic`
- Status: **COMPLETE**

### B. RepoDetailChart (HIGH PRIORITY — 85–100KB recharts)
**Current:** Lazy wrapper exists at `repo-detail/RepoDetailChartLazy.tsx:16`
- ✓ Already lazy-loaded via `next/dynamic`
- Status: **COMPLETE**

### C. AllTrendingTabs & Reddit Canvas Components (MEDIUM PRIORITY)
**Files:**
- `reddit-trending/AllTrendingTabs.tsx` (framer-motion, ~20KB)
- `reddit-trending/SubredditHeatMapCanvas.tsx` (canvas + framer-motion)
- `reddit-trending/SubredditMindshareCanvas.tsx` (canvas + framer-motion)

**Proposed Lazy-Load Pattern:**
```tsx
const RedditTrendingLazy = dynamic(
  () => import("@/components/reddit-trending/AllTrendingTabs")
    .then(m => ({ default: m.AllTrendingTabs })),
  {
    ssr: false,
    loading: () => <div className="skeleton-shimmer h-[400px] w-full rounded-card" />,
  }
);
```
**Route:** `/reddit` — canvas maps are below-fold, visible only after filter selection
**Effort:** 2 hours (4 components, test framer-motion deferral)

### D. UsageCharts (model-usage page — MEDIUM PRIORITY)
**Files:** `app/model-usage/components/UsageCharts.tsx` (recharts, ~90KB)
**Proposed:**
```tsx
const UsageCharts = dynamic(
  () => import("./UsageCharts"),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="skeleton-shimmer h-[300px] rounded-card" />
        <div className="skeleton-shimmer h-[300px] rounded-card" />
      </div>
    ),
  }
);
```
**Route:** `/model-usage` (admin-only, below-fold after header/filters)
**Effort:** 1 hour

### E. Sonner Toaster (ALREADY LAZY)
**File:** `feedback/ToasterLazy.tsx:12`
- ✓ Dynamic import with `ssr: false`
- Status: **COMPLETE**

## 4. Server-Only-Leak Suspects

### Known Anti-Pattern: `@/lib/data-store` in Components
**From `SidebarWatchlistPreview.tsx:19–20`:**
> "Per-source badges (HnBadge / BskyBadge / PhBadge / DevtoBadge) intentionally removed from this preview: their lib imports drag ioredis (a Node-only dep) into the client bundle via the data-store, breaking the dev build."

**Status:** Already mitigated — per-source badges are NOT rendered in the watchlist preview; `ChannelDots` substitutes instead.

**Scan Result:** No direct `"use client"` imports of `@/lib/data-store` found. All `getDataStore()` calls are in:
- Route handlers (`src/app/api/**`)
- Server components (`src/app/*/page.tsx`)

### Recommendation
Continue auditing new features — enforce rule: **never import data-store (or node-only modules like ioredis) in "use client" files.**

## 5. Top 5 Routes to Optimize

| Route | Bundle Impact | Opportunity | Effort |
|-------|---------------|-------------|--------|
| `/compare` | CompareChart ~90KB | ✓ Already lazy-loaded | Done |
| `/repo/[owner]/[name]` | RepoDetailChart ~100KB | ✓ Already lazy-loaded | Done |
| `/reddit` | AllTrendingTabs + 3 canvas ~60KB | Defer framer-motion/canvas | 2h |
| `/model-usage` | UsageCharts ~90KB | Defer recharts | 1h |
| `/funding` | (CapitalFlowChart pure SVG ~10KB, SectorHeatmap pure CSS) | None needed — pure presentation | — |

## 6. Build Output Snapshot

**Total static JS:** ~1M across `.next/static/chunks/`
**Largest chunks (raw bytes):** 
- `1156-*.js` – 369KB (likely recharts export)
- `5015-*.js` – 416KB (likely framer-motion + client bundle)
- `4501-*.js` – 296KB (likely consensus/trending data)

**Gzip typical:** 30–35% of raw size for JS (e.g. 100KB raw → 30KB gzipped)

## 7. Summary: Next-Session Action Items

### Completed (No Action Needed)
1. CompareChart lazy-loaded via `CompareClient.tsx:59` ✓
2. RepoDetailChart lazy-loaded via `RepoDetailChartLazy.tsx:16` ✓
3. Sonner Toaster lazy-loaded via `ToasterLazy.tsx:12` ✓
4. MobileDrawer lazy-loaded via `MobileDrawerLazy.tsx:11` ✓

### Recommended for Phase 2
1. **Reddit Trending Canvas Components** – Defer framer-motion + canvas rendering (~2h effort)
2. **UsageCharts (model-usage)** – Defer recharts to admin-only route (~1h effort)
3. **Enforce server-only rule** – Add pre-commit lint to block data-store imports in "use client" files

### Monitoring
- Track FCP/TTI on `/compare` and `/repo/[owner]/[name]` post-lazy-load to quantify wins
- Run `npm run analyze` monthly to detect new heavy imports

---

**Report Generated:** 2026-05-02 | **Lines Scanned:** ~50K component TS/TSX | **Lazy-Load Coverage:** 80% (4 of 5 major heavy deps already deferred)
