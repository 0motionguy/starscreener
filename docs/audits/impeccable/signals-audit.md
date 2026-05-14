# /signals audit — 2026-05-13

> Impeccable design audit on `/signals`. Reference surface for chart polish, LIVE indicators, and Tag Momentum heatmap. Project-specific rules apply: honest freshness chrome is non-negotiable; functional `borderLeft` is not "side-tab slop"; cards are 2px and shadow-free.

## Files audited

- [src/app/signals/page.tsx](../../../src/app/signals/page.tsx) — server route + RSC composition
- [src/app/signals/signals.css](../../../src/app/signals/signals.css) — page-scoped grid + chip styles
- [src/components/signals-terminal/LiveClock.tsx](../../../src/components/signals-terminal/LiveClock.tsx)
- [src/components/signals-terminal/LiveTicker.tsx](../../../src/components/signals-terminal/LiveTicker.tsx)
- [src/components/signals-terminal/KpiStrip.tsx](../../../src/components/signals-terminal/KpiStrip.tsx)
- [src/components/signals-terminal/SourceFeedPanel.tsx](../../../src/components/signals-terminal/SourceFeedPanel.tsx)
- [src/components/signals-terminal/SourceFilterBar.tsx](../../../src/components/signals-terminal/SourceFilterBar.tsx)
- [src/components/signals-terminal/VolumeAreaChart.tsx](../../../src/components/signals-terminal/VolumeAreaChart.tsx)
- [src/components/signals-terminal/ConsensusRadar.tsx](../../../src/components/signals-terminal/ConsensusRadar.tsx)
- [src/components/signals-terminal/TagMomentumHeatmap.tsx](../../../src/components/signals-terminal/TagMomentumHeatmap.tsx)
- [src/components/shared/FreshnessBadge.tsx](../../../src/components/shared/FreshnessBadge.tsx) — reference for the honest pattern
- [src/lib/news/freshness.ts](../../../src/lib/news/freshness.ts) — `classifyFreshness()` API
- [src/app/globals.css#L4134-L4150](../../../src/app/globals.css) — `.live` styles (green pulse)
- [src/lib/charts/theme/tokens.ts](../../../src/lib/charts/theme/tokens.ts) — chart theme

## P0 findings

### 1. `<span className="live">LIVE</span>` rendered unconditionally on every source panel
- **File**: [SourceFeedPanel.tsx:85](../../../src/components/signals-terminal/SourceFeedPanel.tsx#L85)
- **Mechanical**: `<span className="live">LIVE</span>` is hardcoded in `CardHeader.right` and emitted by all 8 panels (HN, GH, X, Reddit, Bluesky, Dev.to, Claude RSS, OpenAI RSS). The `.live` class ([globals.css#L4142-L4150](../../../src/app/globals.css)) renders a green dot + green text with no awareness of the source's freshness verdict. Cold collectors (per PRODUCT.md: 7 of 16 sources currently degraded) light up "LIVE" green anyway.
- **Fix**: Pass a freshness verdict into `SourceFeedPanel` and replace the static `<span className="live">LIVE</span>` with `<FreshnessBadge source={...} lastUpdatedAt={...} />`. The page already computes `sourceVerdicts` ([page.tsx:324-334](../../../src/app/signals/page.tsx#L324)) — thread that into each panel.
- **Design call**: route via `<FreshnessBadge>` so the chrome can read FRESH/STALE/COLD honestly.

### 2. `LiveClock` renders hardcoded "FEED LIVE" with green pulse, never verifying freshness
- **File**: [LiveClock.tsx:78](../../../src/components/signals-terminal/LiveClock.tsx#L78), pulse shadow [L74](../../../src/components/signals-terminal/LiveClock.tsx#L74)
- **Mechanical**: Inline `boxShadow: "0 0 0 3px rgba(34,197,94,0.18)"` + literal `FEED LIVE` text + green pulse animation. The shadow value duplicates `--shadow-live-small` and isn't gated on any `lastUpdatedAt`.
- **Fix**: Either (a) accept a `freshness: FreshnessVerdict` prop and render dot color + label from the verdict, or (b) remove the "FEED LIVE" line entirely and let the `FreshnessBadge` next to the clock carry the honest signal. Pulse animation only runs when `verdict.status === "live"`.
- **Design call**: drop or downgrade — the clock is for time, the badge is for freshness. Two channels of "LIVE" double-broadcast and undermine the honest-chrome rule.

### 3. `LiveTicker` header hardcodes "LIVE · 24H WIRE" with green pulse on a 24-hour rollup
- **File**: [LiveTicker.tsx:72](../../../src/components/signals-terminal/LiveTicker.tsx#L72), pulse [L69](../../../src/components/signals-terminal/LiveTicker.tsx#L69) (`pulse-dark 1.4s`)
- **Mechanical**: Wire label is permanent. Ticker items can be 23h old yet the orange-on-dark "LIVE" pip pulses regardless. Animation is 1.4s — matches `--motion-duration-pulse-fast` correctly, but the *semantic* claim is wrong.
- **Fix**: Rename label to "24H WIRE" (drop "LIVE"), or accept a `freshnessIso` prop and only show the pulse when the freshest ticker item is `< 1h` old. Page already has `freshnessIso` ([page.tsx:352-365](../../../src/app/signals/page.tsx#L352)) ready to pass down.
- **Design call**: drop the "LIVE" word and the pulse, OR gate both on real freshness.

### 4. `VolumeAreaChart` card header also pinned to `<span className="live">LIVE</span>`
- **File**: [VolumeAreaChart.tsx:359](../../../src/components/signals-terminal/VolumeAreaChart.tsx#L359)
- **Mechanical**: Same pattern as #1 — `CardHeader.right` emits the static `.live` pip. Volume chart can be displaying a window where every source is cold; the badge still reads "LIVE" green.
- **Fix**: Replace with `<FreshnessBadge source="hackernews" lastUpdatedAt={freshnessIso} />` (or pass the verdict through). The chart panel is `// 01` — the reference panel — so this leaks into "what good looks like" for the rest of the codebase.
- **Design call**: hard requirement per CLAUDE.md.

## P1 findings

### 5. KPI strip "≈ realtime" sub-label is hardcoded under "Data freshness"
- **File**: [KpiStrip.tsx:144-145](../../../src/components/signals-terminal/KpiStrip.tsx#L144)
- **Mechanical**: `sub={<span style={{ color: "var(--color-positive)" }}>≈ realtime</span>}` — green positive text under whatever `freshnessLabel` is (e.g. "3d ago"). When the underlying data is days stale the user sees "3d ago / ≈ realtime" in matching green.
- **Fix**: Derive sub-label from a verdict — `live → "≈ realtime"`, `warn → "stale"`, `cold → "data degraded"`. Pass the verdict colour through. The page computes `coldSources` already; piggyback on the same data.
- **Design call**: small but visible lie. P1 not P0 because the parent `freshnessLabel` does read honestly ("3d ago").

### 6. Inline `<details>` summary in KpiStrip is a 44×44 mobile-tap violation + non-keyboard-discoverable
- **File**: [KpiStrip.tsx:96-105](../../../src/components/signals-terminal/KpiStrip.tsx#L96)
- **Mechanical**: `<summary>` rendered as plain text "status" with `listStyle: "none"`, no marker, no focus styling, no explicit width/height. Tap area is the bounding box of the word "status" (~36px wide × ~14px tall). Below the 44×44 minimum per PRODUCT.md mobile contract.
- **Fix**: Make the summary a chip — `padding: 6px 10px; border: 1px solid var(--color-border-default); display: inline-flex; min-height: 28px;` and add `:focus-visible` outline. Show a caret/`▾` marker so users know it's expandable.
- **Design call**: also note discoverability — a single word "status" doesn't read as actionable.

### 7. KPI strip empty-state ("All sources currently degraded") uses fallback CSS vars + hardcoded radius/border
- **File**: [page.tsx:541-554](../../../src/app/signals/page.tsx#L541)
- **Mechanical**: `border: "1px solid var(--color-border, rgba(255,255,255,0.08))"` and `borderRadius: 8`. The card-radius standard is 2px; the correct token is `--color-border-default`. Fallback `var(--color-border, …)` will never hit the fallback in this codebase but pollutes consistency.
- **Fix**: `border: "1px solid var(--color-border-default)"`, `borderRadius: 2`, `color: var(--color-text-subtle)`. Drop fallback args.
- **Design call**: mechanical.

### 8. Tag-momentum heatmap doesn't reflow on mobile — relies on horizontal scroll inside an already-scrollable page
- **File**: [TagMomentumHeatmap.tsx:196](../../../src/components/signals-terminal/TagMomentumHeatmap.tsx#L196), CSS at [signals.css:54-62](../../../src/app/signals/signals.css#L54)
- **Mechanical**: Fixed `left: 96` ECharts grid margin for tag labels, 24-column hour axis. On 375px viewport the heatmap is wider than the panel; the page-scoped `.signals-heatmap-body` then *removes* `overflow-x: auto` at `≤767px` (`overflow-x: visible`). Result on phone: the heatmap either overflows the card and gets clipped by the page horizontal-scroll lock, or the cells become un-readable squares <8px wide.
- **Fix**: At `≤640px`, either (a) keep `overflow-x: auto` on the heatmap body and add a horizontal scroll hint, or (b) reduce the tag-list to 6 rows + compress the x-axis to 8 four-hour buckets. Density-test the readable cell size at 375px.
- **Design call**: choose between scroll-or-compress; both are valid for the heatmap content.

### 9. "ALL" filter chip is unlabelled — screen reader announces nothing
- **File**: [SourceFilterBar.tsx:256-263](../../../src/components/signals-terminal/SourceFilterBar.tsx#L256)
- **Mechanical**: `<Link href=…><b>ALL</b></Link>` (visible text "ALL") has `aria-pressed` but no `aria-label`. Topic ALL chip same — [L361-370](../../../src/components/signals-terminal/SourceFilterBar.tsx#L361). Source-key chips do have `aria-label={s.label}`.
- **Fix**: Add `aria-label="All sources"` and `aria-label="All topics"` to the two ALL chips. Their visible text "ALL" is ambiguous out of context.
- **Design call**: mechanical; trivially correct.

### 10. Heatmap legend swatches are 10×10 with adjacent text — fails 44×44 tap target if made interactive later
- **File**: [TagMomentumHeatmap.tsx:213-243](../../../src/components/signals-terminal/TagMomentumHeatmap.tsx#L213)
- **Mechanical**: Currently informational-only (`aria-hidden`), so technically not a tap target. Flagging as P1-not-P0 because the legend would naturally become a filter toggle in a future iteration.
- **Fix**: If/when legend becomes interactive, wrap each swatch+label in a `min-height: 28px; padding: 6px 8px` container. For now, no action needed.
- **Design call**: design call — leave as P1 watch-list item.

## P2 findings

### 11. Card radius drift on KpiStrip empty-state — uses 8px, not 2px
- Already covered as part of #7; flagging here as a P2 visual-consistency violation against the 2px card radius standard.

### 12. `ageLabel()` returns "no data yet" but renders as "updated no data yet" in panel footers
- **File**: [page.tsx:141, used at L610, L621, etc.](../../../src/app/signals/page.tsx#L141)
- **Mechanical**: Composition produces "updated no data yet" — grammatically awkward. Cold-source footer reads less honestly than it should.
- **Fix**: When `ageLabel === "no data yet"`, render `freshLabel={"no data yet"}` directly without the "updated " prefix.
- **Design call**: copy nudge.

### 13. Inline styles dominate — 80%+ of the visual rules live as React `style={{}}` props
- **File**: every component in `signals-terminal/`
- **Mechanical**: Inline styles repeat tokens like `fontFamily: "var(--font-mono)"`, `letterSpacing: "0.14em"`, `color: "var(--color-text-subtle)"` hundreds of times. Hard to audit drift, hard to swap with a theme prop later. Doesn't run through Tailwind's class detection or critical-CSS path.
- **Fix**: Not a quick fix; flag as systemic. The page-scoped `signals.css` proves the team is willing to colocate; migrate repeated inline blobs to component-scoped CSS modules or utility classes over time.
- **Design call**: design call — accept inline style cost during the V4 migration, then sweep.

### 14. `EmptyMessage` text "no recent items — collector warming up" appears in 4+ places with subtle variants
- **File**: [SourceFeedPanel.tsx:505-520](../../../src/components/signals-terminal/SourceFeedPanel.tsx#L505), [TagMomentumHeatmap.tsx:261-272](../../../src/components/signals-terminal/TagMomentumHeatmap.tsx#L261), [LiveTicker.tsx:142-150](../../../src/components/signals-terminal/LiveTicker.tsx#L142), [ConsensusRadar.tsx:281-292](../../../src/components/signals-terminal/ConsensusRadar.tsx#L281)
- **Mechanical**: Four near-identical empty states (em-dash vs hyphen, different colors via different vars).
- **Fix**: Promote to a shared `<EmptyState message />` primitive under `components/ui/`.
- **Design call**: small consistency lift.

### 15. SourceFeedPanel tweet-row avatar uses hardcoded "1.5px solid var(--color-bg-shell)" border
- **File**: [SourceFeedPanel.tsx:335](../../../src/components/signals-terminal/SourceFeedPanel.tsx#L335)
- **Mechanical**: Non-token 1.5px border width. The hairline ladder is 1px / 2px / 3px (`--border-width-hairline/accent/rail`). 1.5 is half-step drift.
- **Fix**: Either 1px (`--border-width-hairline`) or 2px (`--border-width-accent`).
- **Design call**: mechanical.

## What's working well (reference patterns to propagate)

1. **`SourceFeedPanel` brand-tint pattern** ([SourceFeedPanel.tsx:99-107](../../../src/components/signals-terminal/SourceFeedPanel.tsx#L99)) — `color-mix(in srgb, ${brand} 22%, transparent)` + 50% border + brand-colored mark. Reads as identity-keyed at a glance without screaming color. Use everywhere a source / repo identity needs anchoring.
2. **`SourceMark` + brand-color CSS var pattern** — clean abstraction; chip on/off state lives in URL, color carries identity. Worth replicating on `/twitter` and `/funding`.
3. **Cold-source disclosure pattern** ([KpiStrip.tsx:88-115](../../../src/components/signals-terminal/KpiStrip.tsx#L88)) — `<details>` collapses the "X cold" broadcast without hiding the data. Honest *and* quiet. Should propagate to `/funding` and any surface showing degraded-source counts (after tap-target fix #6).
4. **Empty-state when all sources cold** ([page.tsx:541-554](../../../src/app/signals/page.tsx#L541)) — single muted line, no zero-bombing of every KPI. Right call; pattern should travel.
5. **`SOURCE_FRESHNESS_SOURCE` mapping computed once at top** ([page.tsx:291-334](../../../src/app/signals/page.tsx#L291)) — clean RSC composition: 8 sources × 1 verdict each, ready to thread into panels. This is the right shape; just needs to actually reach the panels.
6. **Topic + window filter URL-state pattern** — every filter is a `<Link>`, no client state machinery, server re-renders cheaply. Sets the bar for all filter surfaces.
7. **Functional `borderLeft` color-keys on source panels and the vol-rail** — correctly applied per per-source identity, not decoration. Don't strip.
8. **`ECharts` chart theme registered once and reused** via `<EChart theme="trendingrepo-dark">` — single chart language across panels.
9. **`buildSparkline()` per-source rail under volume chart** ([VolumeAreaChart.tsx:381-449](../../../src/components/signals-terminal/VolumeAreaChart.tsx#L381)) — inline SVG (not ECharts) for 8 tiny glyphs, smart performance call. Worth documenting as a pattern in DESIGN.md.
10. **Card radii at 2px** consistent across all panels — terminal feel preserved.

## Verify-in-context

- **Chart palette drift**: noted in DESIGN.md as an open follow-up — `globals.css --color-series-1` (green) vs `tokens.ts SERIES_PALETTE[0]` (orange). On `/signals`, the ConsensusRadar gives the *top* polygon `CHART_TOKENS.accent` (orange, [ConsensusRadar.tsx:104-105](../../../src/components/signals-terminal/ConsensusRadar.tsx#L104)) which forces brand-accent for the lead story. Subsequent polygons cycle the SERIES_PALETTE. Visually fine on this page, but if someone reads `--color-series-1` (green) on a sibling chart, the top-story-orange convention doesn't transfer. Not for the audit to fix.
- **`signals.css:71` chip uses `color-mix(... var(--color-text-default))`** — relies on `--color-text-default` being a near-white. If the theme accent ever swaps to a lighter neutral the chip would invert. Low risk; flag if a new theme is added.
- **Motion timing**: `LiveClock` pulse is `1.6s` — matches `--motion-duration-pulse`. `LiveTicker` pulse-dark is `1.4s` — matches `--motion-duration-pulse-fast`. Ticker scroll is `60s linear` — matches `--motion-duration-clock`. All correct.

## Mechanical fixes ready to ship

1. **SourceFeedPanel** ([L85](../../../src/components/signals-terminal/SourceFeedPanel.tsx#L85)): replace `<span className="live">LIVE</span>` with `<FreshnessBadge source={SIGNAL_FRESHNESS_SOURCE[source]} lastUpdatedAt={lastUpdatedAt} />` — accept a new `lastUpdatedAt` prop.
2. **VolumeAreaChart** ([L359](../../../src/components/signals-terminal/VolumeAreaChart.tsx#L359)): same replacement, accept `lastUpdatedAt` prop, pass from page.
3. **LiveTicker** ([L72](../../../src/components/signals-terminal/LiveTicker.tsx#L72)): change label "LIVE · 24H WIRE" → "24H WIRE"; remove `pulse-dark` animation OR accept `latestItemIso` prop and gate pulse on `< 1h`.
4. **LiveClock** ([L58-L80](../../../src/components/signals-terminal/LiveClock.tsx#L58)): remove the entire "FEED LIVE" block — the clock should be a clock. Freshness lives in the `<FreshnessBadge>` placed next to it.
5. **KpiStrip** ([L144-L145](../../../src/components/signals-terminal/KpiStrip.tsx#L144)): make "≈ realtime" conditional on a verdict prop.
6. **SourceFilterBar** ([L256, L361](../../../src/components/signals-terminal/SourceFilterBar.tsx#L256)): add `aria-label="All sources"` / `"All topics"` to the two ALL chips.
7. **KpiStrip empty-state in page.tsx** ([L545-L546](../../../src/app/signals/page.tsx#L545)): swap `--color-border` fallback for `--color-border-default`, `borderRadius: 8` → `borderRadius: 2`.
8. **SourceFeedPanel tweet avatar** ([L335](../../../src/components/signals-terminal/SourceFeedPanel.tsx#L335)): `1.5px` → `1px`.

## Quick-fix patches (optional)

### Patch A — Page wires verdict into each SourceFeedPanel

```tsx
// page.tsx — already computes sourceVerdicts[]. Build a lookup once.
const verdictBySource: Record<SourceKey, FreshnessVerdict> = Object.fromEntries(
  sourceVerdicts.map((v) => [v.key, v.verdict]),
) as Record<SourceKey, FreshnessVerdict>;

// Pass into each <SourceFeedPanel ... verdict={verdictBySource[<key>]} />
```

### Patch B — SourceFeedPanel renders honest pill

```tsx
// SourceFeedPanel.tsx
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

interface SourceFeedPanelProps {
  // ...
  lastUpdatedAt: string | null | undefined;
  freshnessSource: NewsSource; // hackernews / twitter / reddit / etc.
}

<CardHeader right={
  <>
    <span style={{ fontVariantNumeric: "tabular-nums" }}>{countLabel}</span>
    <FreshnessBadge source={freshnessSource} lastUpdatedAt={lastUpdatedAt} />
  </>
}>
```

### Patch C — LiveClock loses the lie

```tsx
// LiveClock.tsx — delete the entire <div style={{ marginTop: "4px" }}> block.
// Page already renders FreshnessBadge in the PageHead area; that's the honest signal.
```

---

**Audit health score (estimated)**

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | aria-label gaps on ALL chips; <details> summary too small to tap |
| 2 | Performance | 4 | ECharts canvas, memoised options, lttb sampling, RSC composition |
| 3 | Theming | 3 | Mostly tokenised; one 1.5px drift, one fallback-var pattern |
| 4 | Responsive | 2 | Heatmap doesn't reflow under 640px; tap targets <44 in disclosure |
| 5 | Anti-patterns | 1 | Four `LIVE` hardcoded indicators on the reference surface — the exact rule CLAUDE.md flags as P0 |
| **Total** | | **12/20** | **Acceptable — once P0 honest-chrome cluster is fixed, jumps to ~18/20** |

The P0 cluster is *all* the same defect: four places ([SourceFeedPanel:85](../../../src/components/signals-terminal/SourceFeedPanel.tsx#L85), [LiveClock:78](../../../src/components/signals-terminal/LiveClock.tsx#L78), [LiveTicker:72](../../../src/components/signals-terminal/LiveTicker.tsx#L72), [VolumeAreaChart:359](../../../src/components/signals-terminal/VolumeAreaChart.tsx#L359)) render permanent green "LIVE" without checking `lastUpdatedAt`. One pattern fix lands in all four. The page already computes the verdicts — it just doesn't thread them down.
