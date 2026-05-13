# /reddit/trending audit — 2026-05-13

> Impeccable design audit on `/reddit/trending`. Project rules applied: honest freshness chrome is non-negotiable; functional `border-l-*` color-keys on tier rows are NOT side-tab slop; card radii are 2px; cards are shadow-free; Reddit collector is currently degraded (RSS fallback writes `score=0`).

## Files audited

- [src/app/reddit/trending/page.tsx](../../../src/app/reddit/trending/page.tsx) — RSC route with bundled-JSON fallback + SSR empty-tab redirect
- [src/components/reddit-trending/AllTrendingTabs.tsx](../../../src/components/reddit-trending/AllTrendingTabs.tsx) — client tab strip + filters + EmptyWindow
- [src/components/reddit-trending/PostListPanel.tsx](../../../src/components/reddit-trending/PostListPanel.tsx) — full post-row chunk
- [src/components/reddit-trending/SubredditGroupPanel.tsx](../../../src/components/reddit-trending/SubredditGroupPanel.tsx) — by-subreddit compact rows
- [src/components/reddit-trending/trending-helpers.ts](../../../src/components/reddit-trending/trending-helpers.ts) — tier classes, color-key
- [src/components/reddit-trending/SubredditMindshareCanvas.tsx](../../../src/components/reddit-trending/SubredditMindshareCanvas.tsx) — dead, unimported
- [src/components/reddit-trending/SubredditHeatMapCanvas.tsx](../../../src/components/reddit-trending/SubredditHeatMapCanvas.tsx) — dead, unimported
- [src/components/reddit-trending/TopicMindshareCanvas.tsx](../../../src/components/reddit-trending/TopicMindshareCanvas.tsx) — dead, unimported
- [src/components/reddit/ContentTagChips.tsx](../../../src/components/reddit/ContentTagChips.tsx) — chip filter row
- [src/components/reddit/BaselinePill.tsx](../../../src/components/reddit/BaselinePill.tsx)
- [src/components/reddit/VelocityIndicator.tsx](../../../src/components/reddit/VelocityIndicator.tsx)
- [src/components/ui/InventoryBand.tsx](../../../src/components/ui/InventoryBand.tsx)

## P0 findings

### 1. Three large dead-code map components ship to disk but are unimported — confusion + audit liability

- **Files**: [SubredditHeatMap.tsx](../../../src/components/reddit-trending/SubredditHeatMap.tsx), [SubredditHeatMapCanvas.tsx](../../../src/components/reddit-trending/SubredditHeatMapCanvas.tsx) (660 LOC), [SubredditMindshareMap.tsx](../../../src/components/reddit-trending/SubredditMindshareMap.tsx), [SubredditMindshareCanvas.tsx](../../../src/components/reddit-trending/SubredditMindshareCanvas.tsx) (928 LOC), [TopicMindshareMap.tsx](../../../src/components/reddit-trending/TopicMindshareMap.tsx), [TopicMindshareCanvas.tsx](../../../src/components/reddit-trending/TopicMindshareCanvas.tsx) (~450 LOC)
- **Mechanical**: `rg "SubredditHeatMap\|TopicMindshareMap\|SubredditMindshareMap"` returns only their own internal references — `page.tsx` no longer renders any of them. The wave-1 fix for `bg-black` in `SubredditHeatMapCanvas.tsx:387` is technically still there, but the file is now unreachable code. Auditors flag findings in files the user never sees.
- **Fix**: Delete the three Map + Canvas pairs OR mount the heat map back on the page above `<AllTrendingTabs>`. Picking one or the other is a product decision; either way, stop carrying both. Recommend keep `SubredditHeatMap` + delete the bubble physics pair (Topic + SubredditMindshare) — the heat map was the explicit replacement per file header.
- **Design call**: design — product needs to pick whether the heatmap returns or stays dead. Mechanical part is the deletion sweep.

### 2. Post rows render bouncy hover (translate + scale + arbitrary orange shadow) — violates "no card shadows" + "non-bouncy motion"

- **File**: [PostListPanel.tsx:66-72](../../../src/components/reddit-trending/PostListPanel.tsx#L66), same pattern in [SubredditGroupPanel.tsx:47-53](../../../src/components/reddit-trending/SubredditGroupPanel.tsx#L47)
- **Mechanical**: `motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.005]` + `hover:shadow-[0_8px_24px_-8px_rgba(245,110,15,0.25)]`. DESIGN.md is explicit: `--shadow-card: none` is enforced; "no card shadows at all, ever. Shadows reserved for focus, LIVE, overlay, popover, glow." A 24px orange drop-shadow on every row hover is a card-elevation shadow. Plus 1.005× scale on every hover is the "hover lift" anti-pattern DESIGN.md called out as drifted from V2 (the canonical hover is `--shadow-row-hover: inset 3px 0 0 functional`).
- **Fix**: Replace hover with the sanctioned `--shadow-row-hover` inset-rail. Drop `translate` + `scale`. Border-color hover (`hover:border-brand/40`) can stay — it's the honest hover signal.
- **Design call**: design — touches every Reddit post row. Same anti-pattern probably lurks elsewhere; worth a global sweep follow-up.

### 3. Card radii drift — `rounded-xl` (10px) on rows + nested cards contradict the 2px `--radius-card`

- **File**: [PostListPanel.tsx:66](../../../src/components/reddit-trending/PostListPanel.tsx#L66) (`rounded-xl`), [SubredditGroupPanel.tsx:47](../../../src/components/reddit-trending/SubredditGroupPanel.tsx#L47) (`rounded-xl`), [SubredditGroupPanel.tsx:171](../../../src/components/reddit-trending/SubredditGroupPanel.tsx#L171) (`rounded-md`, 4px), inner stat block at [PostListPanel.tsx:152](../../../src/components/reddit-trending/PostListPanel.tsx#L152) (`rounded-lg`, 6px).
- **Mechanical**: globals.css resolves `--radius-card: 0.125rem` (2px). `rounded-xl` maps to `--radius-xl: 10px`. DESIGN.md "terminal density. Sharp corners are intentional. Don't round things to 12px — that reads as a marketing site, not a screener." `/reddit/trending` rows are softer than any other surface in the codebase.
- **Fix**: `rounded-xl` → `rounded-card` (or `rounded-[2px]`) on row + compact row. Sub-group header card (`rounded-md`) → `rounded-card`. Inner inset stat block (`rounded-lg`) → `rounded` (3px) or `rounded-card`. Keep the BaselinePill at `rounded-md` (it's a pill chip, not a card).
- **Design call**: design — every Reddit user lands on a 10px-radius row. This is the "looks like a marketing site" smell the brand explicitly rejects.

## P1 findings

### 4. `bg-black` still present on heatmap container (wave-1 fix never landed in wave6)

- **File**: [SubredditHeatMapCanvas.tsx:387](../../../src/components/reddit-trending/SubredditHeatMapCanvas.tsx#L387)
- **Mechanical**: `<div ref={containerRef} className="relative w-full bg-black rounded-md overflow-hidden border border-border-primary">`. Wave-1 audit baseline expected this swapped to `bg-bg-canvas` and PR #1146 claimed the fix; the wave6 worktree still has `bg-black`. Untinted neutral violates DESIGN.md surface tokens: "Never use bare `bg-black` — use `bg-bg-canvas` or the overlay token."
- **Fix**: `bg-black` → `bg-bg-canvas`. Drops to P2 if the dead-code purge in #1 deletes this file outright.
- **Design call**: mechanical (one token swap), gated on #1.

### 5. Mid-tier active-state colors hardcode `accent-green` tint — should route through brand tokens

- **File**: [SubredditHeatMapCanvas.tsx:355, 374](../../../src/components/reddit-trending/SubredditHeatMapCanvas.tsx#L355) — `bg-accent-green/20 text-accent-green` on the window/sort toggle.
- **Mechanical**: Functional-green is correct semantic for "active/toggle-on" per DESIGN.md (`--color-functional: #22c55e`), but the wider codebase uses `bg-brand` for active tabs (see [AllTrendingTabs.tsx:340](../../../src/components/reddit-trending/AllTrendingTabs.tsx#L340) and [SubredditMindshareCanvas.tsx:805](../../../src/components/reddit-trending/SubredditMindshareCanvas.tsx#L805)). Within the same `/reddit/trending` family the active-state hue swaps between brand-orange and accent-green depending on which sub-component you're in. Drift.
- **Fix**: Pick one. Recommend brand for primary tabs, functional-green only for row-hover + toggle-on states. Apply across the three control clusters.
- **Design call**: design — single decision propagates.

### 6. Subreddit chip on each post row uses HSL-from-name color hash — fails contrast guarantees + reads "random pastel" not "data"

- **File**: [trending-helpers.ts:95-100](../../../src/components/reddit-trending/trending-helpers.ts#L95) (`subredditColorHash`), consumed at [PostListPanel.tsx:80](../../../src/components/reddit-trending/PostListPanel.tsx#L80), [SubredditGroupPanel.tsx:176](../../../src/components/reddit-trending/SubredditGroupPanel.tsx#L176)
- **Mechanical**: `hsl(<hue>, 60%, 65%)` against `bg-bg-card` (`#101418`, oklch 0.189). HSL 60% saturation × 65% lightness on dark surfaces produces pastels that nominally pass 4.5:1 contrast but read as "fun party theme" not "Bloomberg-terminal serious". Hue is quantized to 30° (12 buckets), so r/MachineLearning and r/Python may collide. Worse: the color tells the user nothing about the sub — purely identity, no momentum/tier signal.
- **Fix**: Two options: (a) drop the random hash, render `r/{sub}` in `text-text-primary` and let the avatar carry identity color (LetterAvatar already does); (b) keep deterministic color but pin saturation lower (e.g. `hsl(hue, 40%, 75%)`) and use a 6-hue palette pinned to DESIGN.md tokens. Recommend (a) — color budget on this page is already crowded (per-tier border, brand-orange CTAs, baseline-tier pills).
- **Design call**: design — every row reads slightly different. The "serious, fast-scan" feel takes a hit.

### 7. Subreddit chip + inline `↗` external-link arrow taps below 44×44

- **File**: [PostListPanel.tsx:76-94](../../../src/components/reddit-trending/PostListPanel.tsx#L76)
- **Mechanical**: `<button>` chip for `r/{sub}` is text-only (`text-sm font-mono` line-height collapses to ~18px), no `min-h-11`. Adjacent `↗` external-link is `text-xs leading-none -ml-1`, hit-target ~12×12. PRODUCT.md is explicit: "44×44 minimum tap targets on every interactive element." Two taps stacked on mobile guaranteed to mis-fire.
- **Fix**: Wrap chip in `min-h-11 inline-flex items-center` and pad the `↗` to `h-11 w-11 inline-flex items-center justify-center -my-3 -mx-1` (use negative margin so it still reads inline visually but the hit-target spans the row height).
- **Design call**: mechanical with a design tilt — easy fix, high mobile-CX impact.

### 8. SubredditHeatMapCanvas tooltip uses viewport `clientX/Y` math but never handles touch — no mobile reflow

- **File**: [SubredditHeatMapCanvas.tsx:287-318](../../../src/components/reddit-trending/SubredditHeatMapCanvas.tsx#L287)
- **Mechanical**: tooltip pinned to cursor via pointer events. On mobile, no `tap-to-reveal` fallback, and the 280px tooltip clamped to viewport leaves <16px on a 375px screen. Cells smaller than ~50×30 on mobile are unreadable (no text fits per `typographyFor()`).
- **Fix**: On viewports ≤640px, swap the treemap for a vertical list of top-15 cells with the same per-cell content (name, big number, momentum delta, sparkline). Treemap's strength is dense-grid pan-scan — wasted on a phone.
- **Design call**: design — gated on #1 keeping the heatmap alive.

### 9. KPI band shows "Top score" + "GH-linked" even when collector is degraded — no honest signal that scores are zero

- **File**: [page.tsx:248-321](../../../src/app/reddit/trending/page.tsx#L248)
- **Mechanical**: When Reddit RSS fallback fires (the documented degraded state where `score=0, numComments=0` for 80%+ of posts), `topScore` will compute to `0` and "GH-linked" tiles read `0`. Page renders four big tabular `0`s with no explanation. The `InventoryBand` zero-engagement count says "RSS-fallback artifacts" but the KPI band is silent.
- **Fix**: When `stats.totalPosts > 0` AND `topScore === 0`, render a small sub-label "RSS fallback — scores unavailable" under the TOP SCORE / GH-LINKED cells, OR collapse those two cells when degraded. The page already detects engagement via `postsZeroEngagement`; piggyback the same condition.
- **Design call**: design — partial chrome lie. P1 because the FreshnessBadge already reads COLD honestly, but the KPI band is the loudest signal on the surface.

### 10. ContentTagChips active-state has `bg-black/25` inner count badge — same untinted-black violation

- **File**: [ContentTagChips.tsx:270](../../../src/components/reddit/ContentTagChips.tsx#L270)
- **Mechanical**: `bg-black/25 text-white/95` on the count badge when a chip is active. DESIGN.md again: never bare `bg-black`. The 25% alpha tames the visual hit but lints fail the rule.
- **Fix**: `bg-black/25` → `bg-bg-canvas/40` or `bg-bg-overlay/25`.
- **Design call**: mechanical.

## P2 findings

### 11. Three coexisting font-size scales used inside one component

- **File**: [PostListPanel.tsx:78-191](../../../src/components/reddit-trending/PostListPanel.tsx#L78)
- **Mechanical**: A single post row mixes `text-sm` (Tailwind `--text-sm: 12px`), `text-xs` (11px), `text-[11px]` (arbitrary literal), `text-[10px]` (arbitrary). DESIGN.md flagged "rationalize 3 coexisting type scales" as an open follow-up. Hardcoded `text-[11px]` literals bypass the token system.
- **Fix**: Replace `text-[11px]` → `text-xs`, `text-[10px]` → `text-2xs`. Either expand the global ladder or use the existing tokens. Defer the cross-scale rationalization to the DESIGN.md follow-up sweep.
- **Design call**: design — small, additive cleanup.

### 12. `EmptyWindow` uses `rounded-md` (4px) — drift vs 2px card spec

- **File**: [AllTrendingTabs.tsx:453](../../../src/components/reddit-trending/AllTrendingTabs.tsx#L453)
- **Mechanical**: Dashed-border empty-state at 4px. EmptyState in `cold-page` uses the `EmptyState` primitive which is correct; this in-tab empty is a one-off.
- **Fix**: `rounded-md` → `rounded-card`.
- **Design call**: mechanical.

### 13. `PanelSkeleton` placeholders at `rounded-xl` (10px) — same drift as the rows they're standing in for

- **File**: [AllTrendingTabs.tsx:155](../../../src/components/reddit-trending/AllTrendingTabs.tsx#L155)
- **Mechanical**: Skeleton block at `h-[120px] rounded-xl`. When the rows fix lands in #3, the skeleton will visibly contradict the real rows.
- **Fix**: Carry whatever radius #3 chooses through to the skeleton.
- **Design call**: mechanical, gated on #3.

### 14. Pointer-up tooltip pattern uses `transition: stroke-width 120ms` then a separate `transition: r 180ms` on overlapping circles — non-uniform motion

- **File**: [TopicMindshareCanvas.tsx:141, 149](../../../src/components/reddit-trending/TopicMindshareCanvas.tsx#L141)
- **Mechanical**: Two SVG circles in the same group animate `r` (180ms) and `stroke-width` (120ms) independently on the same drag/active. They visibly desync on slow devices. Wave-1 flagged `transition: width` here as layout-jank candidate; current code uses `transition: r` (an SVG attribute, not a CSS box-model layout property) — that's actually fine for composited animation. Flagging the duration mismatch instead.
- **Fix**: Unify both to `var(--motion-duration-base)` (180ms) with `var(--motion-ease-standard)`. Dead-code purge in #1 would moot this.
- **Design call**: design, gated on #1.

### 15. SubredditGroupPanel sub-header uses hash color for `r/{sub}` text — same as #6 but on the group label

- **File**: [SubredditGroupPanel.tsx:174-178](../../../src/components/reddit-trending/SubredditGroupPanel.tsx#L174)
- **Mechanical**: Same `subredditColorHash` pastel applied to the group title. Same fix flows from #6.
- **Design call**: rolls into #6.

## What's working well (reference patterns to propagate)

1. **Honest FreshnessBadge wiring** ([page.tsx:286-289](../../../src/app/reddit/trending/page.tsx#L286)) — `<FreshnessBadge source="reddit" lastUpdatedAt={allPostsFetchedAt} />` is exemplary. No hardcoded "FRESH · 1H" anywhere. Comment block at L281-285 calls out the honest-chrome rule by name. This page is the reference for honest chrome on the codebase — `/signals` should copy this shape.
2. **Bundled-JSON SSR fallback** ([page.tsx:79-101, 144-169](../../../src/app/reddit/trending/page.tsx#L79)) — the "never less than what we have" rule from 2026-05-08 is well-implemented: cold detect → bundled file → engagement-filter → graceful degrade. Pattern should travel to `/funding` and other degraded sources.
3. **EmptyWindow + SSR-side tab redirect** ([page.tsx:179-214, AllTrendingTabs.tsx:295-310](../../../src/app/reddit/trending/page.tsx#L179)) — never strand the user on an empty tab. Both server-side redirect AND client-side `router.replace` as belt-and-braces. Strong UX.
4. **Functional `border-l-4 border-l-[#ff6600]` tier color-key** ([trending-helpers.ts:33,66](../../../src/components/reddit-trending/trending-helpers.ts#L33)) — wave-1 baseline correctly tagged these as functional, not decorative. Reddit-orange on hyperviral rows is identity-keyed; do not strip.
5. **`defaultFilterWouldHideAll` auto-degrade** ([AllTrendingTabs.tsx:209-215](../../../src/components/reddit-trending/AllTrendingTabs.tsx#L209)) — when the default `value_score >= 1` would zero out the page (RSS degraded state), the filter falls through. Honest user-facing graceful degrade.
6. **Velocity p50/p90 percentile gating** ([AllTrendingTabs.tsx:75-99](../../../src/components/reddit-trending/AllTrendingTabs.tsx#L75)) — chevrons + velocity-bar color only fire on the top decile of the visible feed, so they stay rare and meaningful. Worth borrowing for `/twitter`.
7. **Lazy-loaded tab panels** ([AllTrendingTabs.tsx:32-39](../../../src/components/reddit-trending/AllTrendingTabs.tsx#L32)) — `dynamic(... ssr:false, loading: <PanelSkeleton/>)` is the right shape; first paint ships just the strip.
8. **`content-visibility: auto` on rows** ([PostListPanel.tsx:60-64](../../../src/components/reddit-trending/PostListPanel.tsx#L60)) — cheap virtualization, full SSR compat, no react-window. Pattern note in DESIGN.md follow-ups.
9. **InventoryBand making the degraded state visible** ([page.tsx:251-267](../../../src/app/reddit/trending/page.tsx#L251)) — "Zero-engagement: RSS-fallback artifacts" is the explicit, honest disclosure the brand requires.

## Verify-in-context

- **Reddit collector degraded state** (per CLAUDE.md anti-patterns + PRODUCT.md "honest reliability state"): when the Apify-less fallback runs, `score=0` rows dominate. The page handles this on three layers — bundled-JSON splice, `defaultFilterWouldHideAll`, sortTrending fallback to chronological. KPI band is the one place that still doesn't reflect the degraded state (#9).
- **Motion tokens**: `transition-colors duration-150` on tab chips matches `--motion-duration-fast: 120ms` within tolerance (Tailwind's `duration-150` = 150ms; the design token is 120ms but a 30ms divergence is invisible). No bouncy easing in the active component tree — Framer's `[0.22, 1, 0.36, 1]` ease on heatmap cells matches the project's non-bouncy `cubic-bezier(0.2, 0.8, 0.2, 1)` shape closely. Acceptable.
- **A11y**: tab strip has `role="tablist"` + `role="tab"` + `aria-selected` ([AllTrendingTabs.tsx:321, 332](../../../src/components/reddit-trending/AllTrendingTabs.tsx#L321)). HeatMapCanvas window/sort toggles use plain `<button>` without `role="tab"` ([SubredditHeatMapCanvas.tsx:347-381](../../../src/components/reddit-trending/SubredditHeatMapCanvas.tsx#L347)) — sister TopicMindshareCanvas and SubredditMindshareCanvas DO use `role="tab"`. Inconsistency, but moot if #1 deletes the file.
- **Wave-1 baseline `TopicMindshareCanvas.tsx:149` "transition: width"**: now reads `transition: stroke-width 120ms`. `stroke-width` is an SVG attribute compositable on the GPU, not a layout property — wave-1's concern was correct for `width: <px>` on HTML elements; it does not apply here. **Cleared.**
- **Wave-1 baseline `SubredditHeatMapCanvas.tsx:387` "bg-black"**: still present in wave6 (#4). PR #1146 either didn't merge or didn't reach this worktree.

## Mechanical fixes ready to ship

1. **Dead-code purge** (#1): `git rm src/components/reddit-trending/{SubredditMindshareMap,SubredditMindshareCanvas,TopicMindshareMap,TopicMindshareCanvas}.tsx` and keep `SubredditHeatMap*` only if product wants the heatmap mounted; otherwise drop those too. Confirm no other file imports any of them first.
2. **PostListPanel.tsx:66 / SubredditGroupPanel.tsx:47** (#2 + #3): remove `motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.005]` and the arbitrary `hover:shadow-[0_8px_24px_-8px_rgba(245,110,15,0.25)]`; change `rounded-xl` → `rounded-card`. Replace with `hover:shadow-row-hover` (or define a 1px brand-border hover).
3. **PostListPanel.tsx:152** (#3): `rounded-lg` → `rounded`.
4. **SubredditGroupPanel.tsx:171** (#3): `rounded-md` → `rounded-card`.
5. **AllTrendingTabs.tsx:155, 453** (#12, #13): `rounded-xl` / `rounded-md` → `rounded-card`.
6. **SubredditHeatMapCanvas.tsx:387** (#4): `bg-black` → `bg-bg-canvas` (skip if file deleted in #1).
7. **ContentTagChips.tsx:270** (#10): `bg-black/25` → `bg-bg-canvas/40`.
8. **PostListPanel.tsx:76-94** (#7): wrap `r/{sub}` button in `min-h-11`, expand `↗` link to 44×44 hit-target with negative margins.
9. **trending-helpers.ts:95-100** (#6, #15): drop `subredditColorHash`, recolor `r/{sub}` callers to `text-text-primary`.

## Quick-fix patches (optional)

### Patch A — kill the row anti-patterns

```tsx
// PostListPanel.tsx (row className)
className={cn(
  "group relative block border border-border-primary rounded-card bg-bg-card p-4 sm:p-5",
  "transition-colors duration-150 motion-reduce:transition-none",
  "hover:border-brand/40",
  tc.row,            // keeps the functional border-l-* tier key
  tc.contentOpacity,
)}
```

### Patch B — KPI band honest sub-label when degraded

```tsx
// page.tsx KpiBand cells, in the TOP SCORE + GH-LINKED cells
{
  label: "TOP SCORE",
  value: topScore.toLocaleString("en-US"),
  sub: postsWithEngagement === 0 ? "RSS fallback — scores unavailable" : "velocity peak",
  tone: "acc",
  pip: "var(--v4-acc)",
},
```

### Patch C — dedupe sub-color

```tsx
// trending-helpers.ts
export function subredditColorHash(_seed: string): string {
  return "var(--color-text-primary)";
}
// or delete and remove the import + style at call sites
```

---

**Audit health score (estimated)**

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Hierarchy & scannability | 3 | 4-KPI band + lede reads in <3s; sub-color hash adds confusing pastel noise |
| 2 | Honest chrome | 4 | FreshnessBadge wired correctly; KPI band silent on RSS-fallback degraded state |
| 3 | Information density | 4 | Excellent — rows, chips, sparklines, baseline pills all earn their keep |
| 4 | Accessibility & responsive | 2 | <44px sub-chip tap target; heatmap canvas has no mobile reflow; pastel contrast borderline |
| 5 | Motion & interaction | 2 | Bouncy `translate + scale + 24px orange drop-shadow` row hover violates DESIGN.md no-card-shadow + non-bouncy rules |
| **Total** | | **15/25** | **Solid — the honest-chrome cluster `/signals` failed on is fully fixed here. Remaining defects are mechanical drift (radii, dead code, hover anti-pattern).** |

The page is one of the better surfaces in the codebase: honest chrome, bundled-JSON fallback, empty-tab redirect, auto-degrade filter — all done correctly. The P0s are not chrome lies (rare for trendingrepo); they're dead-code accumulation (3 unimported maps) and template-SaaS hover patterns leaked through. One pattern fix on row hover lands across both list panels, one purge across three Map files, one radius sweep across four call sites — three small PRs total.
