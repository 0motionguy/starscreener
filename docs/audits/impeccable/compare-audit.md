# /compare audit — 2026-05-13

Surface: `/compare` (Compare Repos · Canonical Signals)
Audited under the impeccable rubric: hierarchy, honest chrome, density, a11y/responsive, motion.

## Files audited

- [src/app/compare/page.tsx](../../../src/app/compare/page.tsx)
- [src/app/compare/layout.tsx](../../../src/app/compare/layout.tsx)
- [src/app/compare/loading.tsx](../../../src/app/compare/loading.tsx)
- [src/app/compare/error.tsx](../../../src/app/compare/error.tsx)
- [src/components/compare/CompareClient.tsx](../../../src/components/compare/CompareClient.tsx)
- [src/components/compare/CompareProfileGrid.tsx](../../../src/components/compare/CompareProfileGrid.tsx)
- [src/components/compare/CompareWaveTop.tsx](../../../src/components/compare/CompareWaveTop.tsx)
- [src/components/compare/CompareSelector.tsx](../../../src/components/compare/CompareSelector.tsx)
- [src/components/compare/CompareSharePanel.tsx](../../../src/components/compare/CompareSharePanel.tsx)
- [src/components/compare/CompareStatStrip.tsx](../../../src/components/compare/CompareStatStrip.tsx)
- [src/components/compare/CompareChart.tsx](../../../src/components/compare/CompareChart.tsx)
- [src/components/compare/CompareHeatmap.tsx](../../../src/components/compare/CompareHeatmap.tsx)
- [src/components/compare/RepoBannerCard.tsx](../../../src/components/compare/RepoBannerCard.tsx)
- [src/components/compare/RepoProfileColumn.tsx](../../../src/components/compare/RepoProfileColumn.tsx)
- [src/components/compare/ContributorGrid.tsx](../../../src/components/compare/ContributorGrid.tsx)
- [src/components/compare/MomentumRow.tsx](../../../src/components/compare/MomentumRow.tsx)
- [src/components/compare/WinnerChips.tsx](../../../src/components/compare/WinnerChips.tsx)
- [src/components/compare/StarterPackRow.tsx](../../../src/components/compare/StarterPackRow.tsx)
- [src/components/compare/compare.css](../../../src/components/compare/compare.css)

## P0 findings

**P0-1 — Dishonest LIVE chrome on `series selected` counter.** [page.tsx:51](../../../src/app/compare/page.tsx). The selected-series count is wrapped in `<span className="live">` which globals.css `.page-head .clock .live` paints sig-green + adds a pulsing live-dot `::before` with `box-shadow: var(--shadow-live)`. The chrome reads as "live data signal" but is just a static count. Violates the freshness-chrome rule.
Fix: drop the `live` class — render `<span className="t-d" style={{color:"var(--ink-300)"}}>series selected</span>`. **Mechanical (1 line).**

**P0-2 — Dishonest LIVE chrome on tool-card foot.** [page.tsx:63](../../../src/app/compare/page.tsx). `<span className="live">live</span>` inside the "Star History" tool foot is never wired to a freshness verdict — it always renders green-glowing regardless of underlying data staleness. Three other tool cards (Signals/Top10/Tier List) on the same row do NOT use `.live`, so the inconsistency reads as a freshness claim, not a label.
Fix: replace with `<FreshnessBadge>` driven by `classifyFreshness()` on the chart payload's max `lastUpdatedAt`, OR drop to a neutral `<span>live</span>` styled via `.t-foot` token (no green dot, no glow). **Design call** (does this tile need a freshness signal, or just consistency with siblings?).

**P0-3 — Dishonest LIVE chrome on chart panel head.** [CompareWaveTop.tsx:264](../../../src/components/compare/CompareWaveTop.tsx). `<span className="live">Live</span>` in the `panel-head .right` slot of the "// STAR HISTORY / CHART / N SERIES" panel. globals.css `.panel-head .right .live` paints sig-green dot + `--shadow-live-small` glow. Hardcoded — never reflects the actual age of `payloads` or `repos` data.
Fix: replace with `<FreshnessBadge data-source="star-activity">` driven by the latest `lastUpdatedAt` of the resolved payloads, or remove the badge entirely (the chart `<title>` already says "Star Activity (30 days)" which carries window context). **Design call.**

**P0-4 — Pill remove button under tap-target minimum.** [CompareSelector.tsx:236-245](../../../src/components/compare/CompareSelector.tsx). The X button is `p-0.5` + 12px icon → ~16×16 hit area. Project rule: 44×44 minimum on mobile, especially for destructive actions. Same issue applies to the dropdown rows being 32px-ish per item — but the bigger problem is the per-pill X.
Fix: wrap the X icon in a button with `min-w-[44px] min-h-[44px] p-2` and use `-mr-2 -my-2` negative margin to keep visual pill compact while preserving real hit area. **Mechanical (2 lines).**

## P1 findings

**P1-1 — Duplicate breadcrumbs on the page.** Both [page.tsx:37-39](../../../src/app/compare/page.tsx) (`<div className="crumb"><b>Tools</b> / compare</div>`) and [CompareProfileGrid.tsx:296-308](../../../src/components/compare/CompareProfileGrid.tsx) (`<nav aria-label="Breadcrumb">Home / Compare</nav>`) render breadcrumb-like UI. Screen readers will announce both navigation landmarks; visual scan sees redundant location chrome.
Fix: keep the page-level `crumb` (it carries the canonical "Tools" parent) and remove the `PageHeader` `<nav>` inside `CompareProfileGrid` since the surrounding panel-head + page-head already establish location. **Mechanical (delete ~10 lines).**

**P1-2 — Contributor avatars under tap target.** [ContributorGrid.tsx:43](../../../src/components/compare/ContributorGrid.tsx). Each contributor avatar is a `size-8` (32×32) anchor — under 44px. Up to 20 avatars per repo column, packed `gap-1` (4px). On mobile, fingers will overlap multiple avatars.
Fix: keep visual size 32px but expand hit zone via `relative` + `::before { content:""; position:absolute; inset:-6px; }` pseudo-target. Or stack as a clickable list on mobile breakpoints. **Design call.**

**P1-3 — Chart toggle buttons under tap target.** [CompareChart.tsx:535-549](../../../src/components/compare/CompareChart.tsx). ToggleButton uses `px-2 py-1 text-[10px]` → ~24×20px hit area. Five toggle groups (Theme / Metric / Window / Scale / Mode) stack into the chart toolbar — on 375px mobile, this is a finger-frustrating row of micro-buttons.
Fix: bump to `px-2.5 py-2 text-[11px]` on desktop, `px-3 py-2.5 min-h-[36px] text-[12px]` on mobile (still falls under 44 but at least usable). Real fix is a mobile drawer/sheet for chart options. **Design call.**

**P1-4 — Heatmap row label-overflow on narrow viewports.** [CompareHeatmap.tsx:225-232](../../../src/components/compare/CompareHeatmap.tsx). The `<div className="flex flex-wrap items-center gap-2 mb-2">` header packs avatar + fullName + "N commits (30d) · M total (52w)" on one row. On 375px the totals get pushed below the fullName with no separator, looking like an orphan.
Fix: hide the 52w-total on `<sm` (`hidden sm:inline`) or stack the meta vertically below the name when truncated. **Mechanical.**

**P1-5 — CompareStatStrip drops mindshare/rank on mobile.** [CompareStatStrip.tsx:39](../../../src/components/compare/CompareStatStrip.tsx). 2-col on mobile means the per-card meta row (`+1.2k 24H · #4 · MS 18%`) gets `flex-wrap`, pushing rank + mindshare onto a second line — readable but the "MS —" placeholder dominates when data is missing. Plus the grid is `gap-3` which at 2 cols leaves cards uncomfortably wide.
Fix: switch mobile to single-column `flex-col gap-2 sm:grid sm:grid-cols-2`, or reduce padding on mobile (`px-2 py-2 sm:px-3 sm:py-2.5`). **Design call.**

**P1-6 — Per-repo border-left + per-component border-left visual stutter.** Every `RepoBannerCard`, `PulseCard`, `RepoSubHeader`, `RepoProfileColumn`, and `HeatRow` independently applies `borderLeft: 3px solid {accent}`. Across the page that's ~5 different vertical-bar strokes per repo — five places the "repo identity" is repeated. Functional per the in-prompt note, but the *accumulation* through the long scroll makes the page feel like a tagged form, not a comparison dashboard.
Fix: keep accent stripes on RepoBannerCard + RepoProfileColumn (the "anchor" cards) and demote to a 2px top stripe or accent-dot on the secondary panels (Pulse / Tech Stack / Contributors / Heatmap). **Design call.**

## P2 findings

**P2-1 — `bg-black` not used, but theme leak.** [CompareChart.tsx:295](../../../src/components/compare/CompareChart.tsx) uses `splitLineColor = "#1f1f1f"` for light theme — fine. No `bg-black` violations found. But [CompareChart.tsx:830](../../../src/components/compare/CompareChart.tsx) `var(--color-text-muted, var(--color-text-tertiary))` is a fallback to a non-existent token — degrades to `text-tertiary`. Cosmetic.

**P2-2 — Skeleton uses `--v3-bg-*` legacy tokens.** [loading.tsx:11,14,17,27,34,42](../../../src/app/compare/loading.tsx) all use `var(--v3-bg-050)` / `var(--v3-bg-100)`. These are pre-token-system holdovers. Modern compare components use `bg-bg-secondary` / `bg-bg-card` etc.
Fix: migrate to current surface tokens (`var(--color-bg-raised)` / `var(--color-bg-muted)`). **Mechanical.**

**P2-3 — Error page uses `--v2-*` legacy tokens.** [error.tsx:24,31,42,47,49](../../../src/app/compare/error.tsx) — same legacy-token issue across `--v2-sig-red`, `--v2-ink-000`, `--v2-ink-300`, `--v2-ink-400`. **Mechanical.**

**P2-4 — Inline `<style>`-style props instead of utility classes.** [error.tsx:28-36](../../../src/app/compare/error.tsx) and [CompareChart.tsx:693-696, 700-704](../../../src/components/compare/CompareChart.tsx) hand-roll style objects for color/fontSize. Drifts from the rest of compare which uses tailwind tokens. **Mechanical.**

**P2-5 — `formatRelativeDate` rolls its own; `getRelativeTime` exists in utils.** [CompareClient.tsx:110-123](../../../src/components/compare/CompareClient.tsx) reimplements relative-time formatting; [RepoBannerCard.tsx:170-174](../../../src/components/compare/RepoBannerCard.tsx) uses the shared `getRelativeTime`. Output drifts between the two surfaces (e.g. "today" vs "Xh ago"). **Mechanical.**

**P2-6 — Empty-state copy mismatch.** [CompareClient.tsx:308-312](../../../src/components/compare/CompareClient.tsx) says "Select at least 2 repos to compare their momentum, stars, and activity"; [CompareProfileGrid.tsx:250-253](../../../src/components/compare/CompareProfileGrid.tsx) says "Select at least 2 repos to compare their momentum, signals, and revenue". Different feature lists.
Fix: align on one canonical empty-state copy. **Mechanical.**

**P2-7 — CompareSharePanel uses `rounded-card`, gets overridden anyway.** [CompareSharePanel.tsx:165](../../../src/components/compare/CompareSharePanel.tsx) sets `rounded-card`; `compare.css:131-136` then strips `border-radius` back to `--radius-none`. The class is dead intent — confusing for future maintainers. **Mechanical.**

**P2-8 — `WinnerChips` `rounded-full` pill on a flat-radii page.** [WinnerChips.tsx:98-99](../../../src/components/compare/WinnerChips.tsx) renders chips as `rounded-full`. But `compare.css` doesn't override `rounded-full` — so these read as warm pills on an otherwise flat-cornered terminal page. Inconsistency.
Fix: either expose `rounded-full` overrides in `compare.css` OR change chips to `rounded-[3px]`/`rounded-none`. **Design call.**

**P2-9 — `border-l 3px` per-row on heatmap eats horizontal space.** [CompareHeatmap.tsx:223](../../../src/components/compare/CompareHeatmap.tsx). The 3px stripe + 12px card padding leaves 15px of "non-data" on the left of the 52-week strip. On a 375px viewport the heatmap squares shrink to ~6px each.
Fix: drop the heatmap row's `borderLeft` and rely on the avatar+accent-dot in the header for repo identity (matches the impeccable hint that border-stripes are functional but can be demoted). **Design call.**

**P2-10 — `space-y-8` rhythm between section headings creates lots of scroll.** [CompareClient.tsx:475](../../../src/components/compare/CompareClient.tsx) `EmbeddedShell` uses `space-y-8` (32px). Combined with the ~14 sections (banner / chart / heatmap / pulse / tech / contrib / wins) the page is a long scroll. Could tighten to `space-y-6` (24px) and let `label-section` headings carry hierarchy. **Design call.**

## What's working well

- **Per-repo accent system is internally consistent.** `COMPARE_PALETTE` is the single source of truth shared by selector pills, banner stripes, chart strokes, heatmap series, language bars, and winner chips. The 5-slot palette indexing keeps each repo's identity readable across the entire page.
- **Diff-tone highlighting is restrained.** `computeDiffFlags` in `CompareProfileGrid` only colors the extremes when spread > threshold — exactly the right call. Avoids the rainbow-everything trap.
- **Skeleton geometry matches final geometry.** `BannerSkeleton`, `HeatmapSkeleton` (52×7 grid), `PulseSkeleton`, `SectionRowSkeleton`, `WinnerSkeleton` all preserve final layout dimensions — no layout shift on hydration.
- **Empty / fallback discipline.** `fallbackBundle()` synthesizes ok:false envelopes so one failed repo never blanks its siblings. Grid keeps all selected slots populated even on `/api/compare` errors.
- **URL-driven sharing works.** `CompareWaveTop` syncs `?repos=` via `router.replace({scroll:false})` so the back button doesn't accumulate noise on every pill add/remove.
- **Compare-page CSS overrides flatten radii to 0.** `compare.css:131-136` enforces the terminal look across `v2-card`, `rounded-card`, `rounded-md`, `rounded-badge` — exactly aligned with the project's terminal-feel tokens.
- **Chart end-of-line labels.** `CompareChart.buildLineData` puts the series label at the right end of each line. Far better than a separate legend lookup — answers "which line is which repo" instantly.

## Verify-in-context

- LIVE chrome (P0-1/2/3) is visible without data — load `/compare` with no `?repos=` param: the "series selected" pulse + tool-card live dot + chart-panel "Live" badge all render against the empty-state. They are LIVE chrome with no live data backing them.
- Tap-target (P0-4) is provable on devtools mobile 375px — try to remove a pill with a thumb-sized target on the iPhone 13 emulator; the 16px X is below pointer accuracy.
- Duplicate breadcrumbs (P1-1) audible with VoiceOver: two "navigation, Breadcrumb" landmarks announced.

## Mechanical fixes ready to ship

Ordered by impact-per-line:

1. **P0-1** — Drop `className="live"` on `page.tsx:51`. 1 char delta.
2. **P0-2** — Drop `className="live"` on `page.tsx:63` (or replace with FreshnessBadge — design call).
3. **P0-3** — Drop `className="live"` on `CompareWaveTop.tsx:264` (or replace with FreshnessBadge).
4. **P0-4** — Add `min-w-[44px] min-h-[44px] -m-2 p-2` to the pill-X button.
5. **P1-1** — Delete the `PageHeader` `<nav>` block in `CompareProfileGrid.tsx:295-308`.
6. **P2-2/2-3/2-4** — Sweep `--v2-*` / `--v3-*` legacy tokens to current `--color-*` tokens.
7. **P2-6** — Unify the two empty-state copies on one canonical message.

## Quick-fix patches (optional)

```tsx
// page.tsx:51 — drop dishonest "live" pulse
- <span className="live">series selected</span>
+ <span className="t-d">series selected</span>
```

```tsx
// page.tsx:63 — same; the foot "live" tag is a freshness claim that's never wired
- <span className="live">live</span>
+ <span>live</span>
```

```tsx
// CompareWaveTop.tsx:263-265 — replace static Live with FreshnessBadge or remove
- <span className="right">
-   <span className="live">Live</span>
- </span>
+ <span className="right">
+   <FreshnessBadge slug="star-activity" />
+ </span>
```

```tsx
// CompareSelector.tsx:236-245 — expand hit zone without growing pill
   <button
     type="button"
     onClick={() => removeRepo(id)}
     className={cn(
-      "p-0.5 rounded-full hover:bg-bg-card-hover transition-colors cursor-pointer",
+      "p-2 -my-2 -mr-1 rounded-full hover:bg-bg-card-hover transition-colors cursor-pointer",
+      "min-w-[44px] min-h-[44px] flex items-center justify-center",
       "text-text-tertiary hover:text-text-primary",
     )}
     aria-label={`Remove ${name}`}
   >
     <X size={12} />
   </button>
```

```tsx
// CompareProfileGrid.tsx:295-308 — remove duplicate breadcrumb
- function PageHeader() {
-   return (
-     <nav aria-label="Breadcrumb" ...>...</nav>
-   );
- }
- ...
- <PageHeader />
```
