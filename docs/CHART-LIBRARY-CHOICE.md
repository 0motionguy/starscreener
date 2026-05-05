# Chart Library Choice — Evaluation & Migration Plan (AGN-538)

**Status:** Decision document. No code change in this PR.
**Author:** Frontend Refactor agent
**Date:** 2026-05-05
**Scope:** Decide on a single charting system to replace today's split between `recharts` and ad-hoc inline SVG / Canvas glyphs. Migration is intentionally deferred to follow-up issues.

---

## 1. Why this issue exists

Mirko's complaint (AGN-538): *"All charts across the platform are ugly."* The screenshots in the issue cover six surfaces — `/signals` SIGNAL VOLUME stacked area, home-page sparklines on the trending widgets, Top 50 inline sparkline column, featured/curated card sparklines, repo-detail STATS · SNAPSHOT, and per-row delta numbers next to sparklines.

The visual inconsistency is not a styling bug; it's structural. The platform currently runs **two independent rendering stacks** (`recharts` for big charts, hand-rolled SVG/Canvas for sparklines), each with its own theming, axis math, and edge-case handling. No amount of CSS tweaking can unify the look while that split exists. AGN-538 is therefore about picking one stack — not about repainting the existing two.

This PR ships the decision; library swaps land as separate, surface-scoped follow-ups (see §6).

---

## 2. Current state — chart usage audit

### 2a. `recharts` consumers (5 files)

Counted with `grep -rn "from \"recharts\"" src`:

| File | Surface | Chart kind |
|---|---|---|
| `src/components/home/Tr100IndexChart.tsx` | Home — TR100 index hero | Area / line |
| `src/components/repo-detail/RepoDetailChart.tsx` | `/repo/[owner]/[name]` STATS · SNAPSHOT | Multi-series line |
| `src/components/compare/CompareChart.tsx` | `/compare` overlay | Multi-series line |
| `src/app/mcp/[slug]/_components/McpDownloadsSparkline.tsx` | MCP detail downloads sparkline | Area |
| `src/app/model-usage/components/UsageCharts.tsx` | `/model-usage` dashboards | Bar / line / pie group |

Two of the five (`RepoDetailChart`, `McpDownloadsSparkline`) already have `*Lazy.tsx` wrappers — recharts is heavy enough that we already pay a code-split tax on it. `package.json` pins `recharts: ^3.8.1`.

### 2b. Hand-rolled SVG / Canvas chart components (the bulk of "sparklines")

These render charts without a runtime library, each with its own path-math:

| File | Surface | Tech |
|---|---|---|
| `src/components/shared/Sparkline.tsx` | Top 50 / featured cards / generic | Inline SVG quadratic bezier |
| `src/components/signal/Sparkline.tsx` | `/signals` per-source mini-line | Inline SVG polyline |
| `src/components/v2/VelocitySpark.tsx` | V2 velocity widget | Inline SVG |
| `src/components/v2/ForecastSparkline.tsx` | V2 forecast widget | Inline SVG |
| `src/components/funding/StockSparkline.tsx` | Funding stock-row glyph | CSS / SVG hybrid |
| `src/components/compare/CompareWaveTop.tsx` | Compare wave header | Custom SVG |
| `src/components/signals-terminal/VolumeAreaChart.tsx` | `/signals` SIGNAL VOLUME stacked area | Custom SVG (no runtime) |
| `src/components/reddit-trending/SubredditHeatMapCanvas.tsx` | Reddit heat map | `<canvas>` 2D |
| `src/components/reddit-trending/SubredditMindshareCanvas.tsx` | Subreddit mindshare bubbles | `<canvas>` 2D |
| `src/components/mindshare/MindShareCanvas.tsx` | Mindshare canvas | `<canvas>` 2D |
| `src/components/terminal/BubbleMapCanvas.tsx` | Bubble map | `<canvas>` 2D |

That's **12 distinct hand-rolled chart implementations** vs **5 recharts consumers**. The "ugly + inconsistent" perception is driven by the 12, not the 5.

### 2c. Why we ended up with this split

Three forces compounded:
1. **Recharts ships ~95KB gzipped on its own** (plus its `react-smooth` dep). Sparklines that need to render dozens-per-row in tables (Top 50, /signals per-source rail) couldn't afford that. Engineers reached for inline SVG to skip the runtime cost.
2. **Recharts' theming surface is verbose** — every axis, gradient, tooltip needs explicit JSX. Quick "just draw a line" surfaces felt heavier than a 30-line SVG component.
3. **Canvas heat maps don't fit any general charting library well** — the four `*Canvas` components are essentially custom DOM. Even after AGN-538's chosen library lands, those probably stay custom (see §6 risk table).

So a successful unification needs a library that is (a) light enough to drop into per-row sparklines without code-splitting gymnastics, (b) good-looking by default in dark mode without 40 lines of theme JSX, and (c) capable of the bigger area / stacked / multi-series surfaces too.

---

## 3. Candidate evaluation

Four options were considered. Stars / maintenance verified against the public repos as of 2026-05-04 (AGN-538 explicitly asks the agent to verify currency).

### Option A — Stay on `recharts` (status quo)
- **Bundle:** ~95KB gz + `react-smooth` (~4KB gz). Already in our tree.
- **Customization:** Compositional JSX (`<XAxis />`, `<Tooltip />`, …). Powerful but verbose.
- **A11y:** Axis/legend rendered as DOM, screen-reader-friendly out of the box.
- **DX:** Familiar to the team. Five files already use it.
- **Why this fails AGN-538:** Cost-per-sparkline is too high to roll out to Top 50 rows or the /signals per-source rail without code-splitting. That's exactly why those surfaces went hand-rolled. "Unify on recharts everywhere" is a bundle-budget regression.

### Option B — `lightweight-charts` (TradingView)
- **Bundle:** ~36KB gz. MIT license. Active maintenance, ~10k+ GitHub stars, frequent releases.
- **Render:** HTML Canvas. Built for financial-style time series. Dark mode is native (TradingView terminal aesthetic — which matches `/signals` brief).
- **Strengths:** Exceptional perf on time-series; built-in crosshair, range selector, candle/area/line/histogram; great look without theming work.
- **Weaknesses:**
  - Canvas rendering means **no DOM nodes for axis/legend** → a11y hostile by default; we'd need to overlay an aria-label summary or skip a11y.
  - **No bars / pies / radar / scatter** — `/model-usage` charts (UsageCharts.tsx) are bar+pie heavy; lightweight-charts cannot render them.
  - One chart per `<div>` mount; it's not a React component but an imperative API we'd wrap.
- **Verdict:** Excellent for time-series but **cannot cover the whole platform**. If picked, we still need a second library for `/model-usage` non-time-series charts. That violates the "ONE unified system" requirement.

### Option C — `visx` (Airbnb, on top of d3)
- **Bundle:** Tree-shakable; per-primitive. A typical sparkline is ~8-15KB gz; a multi-series area is ~25-40KB gz. Total grows with how much you import.
- **Render:** SVG. ~20k stars. Maintained but slower release cadence than recharts.
- **Strengths:**
  - **Covers every chart kind we need** — area, line, bar, pie, radar, hexbin, heatmap (with `@visx/heatmap`), even network/force.
  - Tree-shaking means a lone sparkline can be cheaper than recharts.
  - SVG → a11y-friendly, easy to inline our existing sparkline aesthetic.
  - Composable d3 scales — we already do path math by hand in the 12 hand-rolled components; visx gives us the scale/axis primitives without the d3 footgun.
- **Weaknesses:**
  - More boilerplate than recharts for full charts (it's primitives, not a chart). Fine for a sparkline; chunkier for `/model-usage`.
  - No built-in interactivity (tooltip/crosshair) — we add those ourselves with `@visx/tooltip`.
- **Verdict:** Best fit for the "unify everything from sparkline to dashboard" goal. Worst fit if the team wants charts-as-one-component (recharts ergonomics).

### Option D — `echarts` (`echarts-for-react`)
- **Bundle:** ~150KB+ gz even with tree-shaking. Apache. Massive feature set (every chart imaginable, 3D, GL).
- **Render:** Canvas (default) or SVG.
- **Verdict:** Overkill on weight, opposite direction from "lightweight". Ruled out.

### Quick comparison

| Criterion | recharts (status quo) | lightweight-charts | visx | echarts |
|---|---|---|---|---|
| Bundle (sparkline) | 95KB gz baseline | 36KB gz baseline | 8-15KB gz tree-shaken | 150KB gz+ |
| Dark mode out of box | Manual theme | Native | Manual but trivial | Native |
| Sparkline ergonomics | Heavy | N/A (one chart per mount) | Excellent | Heavy |
| Big chart coverage | Yes | **Time-series only** | Yes | Yes |
| Bars / pies for /model-usage | Yes | **No** | Yes | Yes |
| Heat map / canvas surfaces | No | No | Yes (`@visx/heatmap`) | Yes |
| A11y default | DOM, good | Canvas, hostile | DOM, good | Canvas, hostile |
| Replaces all 12 hand-rolled? | No (cost) | No (kinds missing) | **Yes** | Yes |
| Bundle delta vs today | 0 | +36KB but doesn't replace recharts → net +36KB | -recharts +visx, smaller per-surface | Much larger |

---

## 4. Recommendation

**Adopt `visx` as the single charting system. Remove `recharts` over the migration plan in §6.**

Rationale, in priority order:

1. **It's the only candidate that actually unifies all 17 chart surfaces** (5 recharts + 12 hand-rolled). lightweight-charts cannot render bars/pies; recharts is too heavy for sparkline-per-row.
2. **Tree-shaking lines up with our actual mix** — most surfaces are sparklines or simple areas, where visx ships less than recharts. Heavy dashboards (`/model-usage`) pay for the primitives they use.
3. **SVG output preserves a11y and matches our existing inline-SVG sparkline aesthetic** — visual continuity during migration; we won't ship a sudden Canvas-everywhere look halfway through.
4. **Theming is centralised through d3 scales** — one place to define source colours, axis tick style, gradient stops. That is the actual fix to "ugly + inconsistent": today the 12 hand-rolled files each invent their own scale, which is why nothing matches.
5. **Lightweight-charts is tempting for `/signals` SIGNAL VOLUME specifically** (it's literally what TradingView ships). We considered a two-library compromise (visx everywhere + lightweight-charts for the one stacked-area on /signals) and rejected it: AGN-538 explicitly demands "ONE unified system". Two libraries is what got us here.

Caveats accepted:
- visx is **primitives, not finished charts**. We will write a thin internal wrapper layer (`src/components/charts/`) — `<ChartArea>`, `<ChartLine>`, `<ChartSparkline>`, `<ChartBar>` — so that surface code doesn't deal with scales/axes directly. This wrapper is the unified system; visx is the engine.
- The four `*Canvas` mindshare/heatmap components stay custom for now (visx has heatmap but the bubble-physics / force-layout work in those files is custom enough that swapping is a separate question — see §6 risk table).

---

## 5. Out of scope for this PR

This PR ships only the decision document. It deliberately does **not**:
- Add `visx` to `package.json`
- Touch any chart component
- Remove `recharts` from `package.json`
- Restyle any surface

All of the above land in the per-surface migration PRs in §6.

---

## 6. Migration plan

Sequenced by **traffic × risk**: highest-traffic, lowest-risk surfaces first so the unified look lands where users actually see it, and we de-risk the wrapper layer before touching the painful surfaces.

| Order | Surface | Why this order | Risk | Follow-up issue |
|---|---|---|---|---|
| **0** | Add `@visx/*` deps + ship `src/components/charts/` wrapper layer with `<ChartSparkline>` and `<ChartArea>`. No surface migration. | Land the wrapper before any consumer. Lets every following PR be a 1-component swap. | Low — additive | AGN-538-a |
| **1** | `src/components/shared/Sparkline.tsx` → wrapper. (Top 50 / featured / many tables.) | Highest blast radius — swap one file, dozens of surfaces look unified instantly. | Low — pure presentation | AGN-538-b |
| **2** | `src/components/signal/Sparkline.tsx` and `src/components/signals-terminal/VolumeAreaChart.tsx` (`/signals` SIGNAL VOLUME + per-source rail). | Surface Mirko called out first in the issue. Stacked-area validates the wrapper handles multi-series. | Medium — multi-series stacking | AGN-538-c |
| **3** | `src/components/home/Tr100IndexChart.tsx`. (Home hero — first thing users see.) | High visibility. Recharts → visx 1:1 for an area chart is straightforward. | Medium — hero surface, must screenshot diff | AGN-538-d |
| **4** | `src/components/v2/{VelocitySpark,ForecastSparkline}.tsx` and `src/components/funding/StockSparkline.tsx` and `src/components/compare/CompareWaveTop.tsx`. | Cleanup pass — remaining inline-SVG one-offs. | Low | AGN-538-e |
| **5** | `src/components/repo-detail/RepoDetailChart.tsx` and `src/components/compare/CompareChart.tsx` (recharts multi-series). | Recharts replacement. Deletes one of the two `*Lazy.tsx` wrappers. | Medium — interactive crosshair/tooltip parity | AGN-538-f |
| **6** | `src/app/mcp/[slug]/_components/McpDownloadsSparkline.tsx`. | Last recharts area. After this lands, **`recharts` can be removed from `package.json`**. | Low | AGN-538-g |
| **7** | `src/app/model-usage/components/UsageCharts.tsx` (bars/pies). | Most complex single file. Defer until wrapper has bar/pie components. | High — most dashboard surface area | AGN-538-h |
| **deferred** | Four `*Canvas` mindshare/heatmap components. | Not a charting-library problem — bubble/force layouts are bespoke. Re-evaluate after §6.7 lands. | High — separate decision | AGN-538-i (separate spike) |

**Bundle outcome target after §6.6 lands:** remove `recharts` (~95KB gz), add `@visx/scale + @visx/shape + @visx/axis + @visx/tooltip` (~30-40KB gz total across the app, less per-route). Net savings ~50KB gz on routes that only use sparklines, slight increase on `/model-usage` until §6.7.

**Per-PR acceptance template** (copy into each follow-up):
- Visual diff screenshot (before/after) for the migrated surface.
- `npm run typecheck` clean.
- `npm run build` reports no bundle regression on routes that consume the surface (use `next build` size output).
- No new a11y regressions (axes/legends remain DOM-rendered).

---

## 7. Open questions deferred to migration

Listed here so they're not forgotten when §6 PRs start:

1. **Tooltip ergonomics** — visx ships `@visx/tooltip` but it's primitives. The wrapper needs one tooltip implementation that recharts users (`<Tooltip />`) and hand-rolled users (currently no tooltip) both adopt.
2. **Animation** — recharts uses `react-smooth`. visx has no opinion. We pick a single approach (likely `framer-motion` since it's already a dep) when the wrapper lands.
3. **Source colours** — today every hand-rolled sparkline reads CSS vars (`--source-hackernews`, etc.) directly. The wrapper should expose a `source` prop and look up the var, so colour drift across surfaces becomes impossible.
4. **SSR** — recharts has known SSR pain (`*Lazy.tsx` wrappers exist for this reason). visx is SVG-first → SSR-safe. Confirm during AGN-538-a.

---

## 8. Decision summary (one paragraph)

We adopt **visx** as the single charting engine, wrapped in an internal `src/components/charts/` component layer. We migrate over seven follow-up PRs ordered by traffic × risk, starting with the shared sparkline that drives the most surfaces. `recharts` is removed once the last consumer migrates (PR §6.6). The four custom-canvas mindshare/heatmap components stay out of scope — their bespoke layouts are not a charting-library problem. This unblocks AGN-538's "ONE unified system" requirement without taking a multi-week hit in a single PR.
