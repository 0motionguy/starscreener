## / (home) audit — 2026-05-13

## Files audited
- [src/app/page.tsx](../../../src/app/page.tsx) — entry, hero, panels, consensus / breakout / featured / TR-100 sections, FAQ, JSON-LD.
- [src/components/home/LiveTopTable.tsx](../../../src/components/home/LiveTopTable.tsx) — sortable Live / Top 50 table.
- [src/components/terminal/BubbleMap.tsx](../../../src/components/terminal/BubbleMap.tsx) — momentum-vs-scale radar.
- [src/components/ui/Card.tsx](../../../src/components/ui/Card.tsx), [Metric.tsx](../../../src/components/ui/Metric.tsx), [SectionHead.tsx](../../../src/components/ui/SectionHead.tsx) — chrome primitives.
- [src/components/shared/FreshnessBadge.tsx](../../../src/components/shared/FreshnessBadge.tsx) — sanctioned freshness pattern (NOT used on `/`).
- [src/app/globals.css](../../../src/app/globals.css) — `.home-surface`, `.page-head`, `.hero-row/.hero-panel`, `.cons-row`, `.brk-row`, `.feat-card`, `.chart-toggle`, `.live`, `.live-pip`.

## P0 findings

### P0-1 — Five hardcoded "LIVE" chrome lies, no `FreshnessBadge` anywhere on `/`
Honest freshness rule violation per `feedback_freshness_chrome_must_be_honest`. `/` never imports `FreshnessBadge` or `classifyFreshness`. Every "LIVE" / green pulse on this page is unconditionally green, even when data is hours / days stale. Sites:
1. [src/app/page.tsx:468](../../../src/app/page.tsx#L468) — `right={<span className="live">LIVE</span>}` on every HeroPanel (Repos, Skills, MCP). Always renders green pulse via `.panel-head .right .live::before` ([globals.css:4142](../../../src/app/globals.css#L4142)).
2. [src/app/page.tsx:944](../../../src/app/page.tsx#L944) — `<span className="live">LIVE</span>` on TR-100 Index card.
3. [src/components/terminal/BubbleMap.tsx:200,245](../../../src/components/terminal/BubbleMap.tsx#L200) — `headerStatus = "LIVE · ${monoDate}"`, always shipped.
4. [src/components/home/LiveTopTable.tsx:373](../../../src/components/home/LiveTopTable.tsx#L373) — `<span className="live-pip">live</span>` with glowing green dot ([globals.css:2632](../../../src/app/globals.css#L2632)).
5. [src/app/page.tsx:865](../../../src/app/page.tsx#L865) — `<Metric ... delta="+ live" tone="positive">` literal "+ live" string.

Fix: route all five through `<FreshnessBadge lastUpdatedAt={lastFetchedAt} source="repos">` (and the appropriate `source` per panel — `skills`/`mcp`). The page already imports `lastFetchedAt` ([page.tsx:14](../../../src/app/page.tsx#L14)) but only renders it in two read-only footers. **Design call** for the visual placement; **mechanical** swap for each call site.

### P0-2 — Consensus row source icons are a data lie
[src/app/page.tsx:530](../../../src/app/page.tsx#L530): `SOURCE_ICONS.slice(0, channels)` renders the first N entries of a static array `[gh, hn, r, b, d]` rather than the actual `repo.channelStatus` keys. A repo whose firing sources are `[github, twitter]` is painted as `[github, hackernews]`. Tooltip + `aria-label` repeat the same lie. **P0** because the page sells itself as "what multiple feeds agree on" — this section is the cross-source pitch.

Fix: derive the source list from `repo.channelStatus` (or `repo.mentions?.perSource` like `LiveTopTable` does) and render only the ones with non-zero counts. **Design call** if you want filled vs ghost states for inactive sources.

### P0-3 — Fake chart-toggle pretends to be interactive
[src/app/page.tsx:947-951](../../../src/app/page.tsx#L947): three `<span class="tg">` styled as toggle buttons (Index / Share / Categories), no `onClick`, no `role`, no keyboard target. They look identical to the live `.fchip` filter buttons two sections above. Affordance lie; keyboard users tabbing past hit nothing. WCAG 2.4.3 + 4.1.2.

Fix: either wire the three views (real toggle) or strip the toggle entirely and keep only the `30d · {total30d}` summary. **Design call**.

### P0-4 — Touch targets below 44×44 on the primary mobile filter row
[src/components/home/LiveTopTable.tsx:354-369](../../../src/components/home/LiveTopTable.tsx#L354) `.fchip` styled `padding: 4px 10px; font-size: var(--font-size-sm)` ([globals.css:2565](../../../src/app/globals.css#L2565)) → ~24-26px tall. These are the category filters on the highest-density mobile surface. PRODUCT.md mandates 44×44 minimum.

Fix: bump `.live-top-filters .fchip` to `min-height: 44px; padding: 10px 12px` on `@media (max-width: 767px)`. **Mechanical**.

### P0-5 — Breakout row sparkline color contradicts its own delta number
[src/app/page.tsx:560-565](../../../src/app/page.tsx#L560): `sparkColor = velocityRatio < 1 ? red : > 1.5 ? green : cyan`. A repo with `+10/24h` (positive but below 7d-baseline) renders a **red** sparkline beside a **green** `+10` delta. The two encodings disagree on the same row.

Fix: either reconcile the spark color to `delta` sign (matches LiveTopTable's pattern), or move the velocity-ratio signal into a separate text indicator and keep spark color tied to direction. **Design call**.

## P1 findings

### P1-1 — `cat-foot` "updated HH:MM utc" is a page-wide stamp posing as panel-level freshness
[src/app/page.tsx:485](../../../src/app/page.tsx#L485) — every HeroPanel footer reads `updated ${lastFetchedAt UTC time}`. All three panels (Repos / Skills / MCP) display the same string because `lastFetchedAt` is the page snapshot, not per-source. Honest-by-default voice demands per-source timestamps; this string flattens three different cadences into one.

Fix: thread per-board `lastFetchedAt` from the respective Redis envelopes (`skillsRes.value.fetchedAt`, `mcpRes.value.fetchedAt`) into each panel; replace the literal string with `<FreshnessBadge>`. **Design call** on which timestamp source to wire.

### P1-2 — "stars today / + live" Metric tone="positive" is a fake green delta
[src/app/page.tsx:865](../../../src/app/page.tsx#L865) — `<Metric delta="+ live" tone="positive">`. The Metric primitive renders this as a green delta pill that mimics real deltas elsewhere on the page. Reads as "+1 live unit," which is meaningless.

Fix: drop `delta="+ live"`, keep the sub line. Or replace with a real "(+N in last hour)" computed delta. **Mechanical** removal.

### P1-3 — Hero h1 lede contains brand fluff, not a scan answer
[src/app/page.tsx:844-848](../../../src/app/page.tsx#L844): `<h1>One live ranking for open-source breakouts.</h1>` + lede "Repos, skills, and MCP servers ranked by cross-source agreement, star velocity, and fresh community attention." PRODUCT.md prime directive is "answer 'what's moving in GitHub' in <3 seconds." First-screen pixel real estate is spent on description, not the answer. The 6-Metric strip (the answer) sits below the fold on most laptop viewports because the hero + clock + newsletter form claim the entire above-fold band.

Fix: either compress the hero (h1 → tighter scale, lede → 1 line, move newsletter below the metrics) or hoist `MetricGrid` above `.page-head`. **Design call**.

### P1-4 — Newsletter form in hero competes with the scan answer
[src/app/page.tsx:850](../../../src/app/page.tsx#L850) `<NewsletterCaptureForm source="hero" />` directly under the h1. PRODUCT.md says interface IS the tool, not the marketing — a newsletter capture in the first 200px on a screener home is a marketing pattern from the anti-feel list (BI / SaaS landing). Either drop it from the hero or move it under the FAQ.

Fix: move the form to a secondary slot (between section 06 and the FAQ, or inside the footer band). **Design call**.

### P1-5 — `HeroPanel` `count` overstates Skills / MCP coverage
[src/app/page.tsx:879-880](../../../src/app/page.tsx#L879): `count={skillsItems?.length ?? skillsBoard.length}`. `skillsItems` is the **deduped** combined list; the panel headline reads "Claude skills / N tracked" using a number that wasn't deduped (and is the full leaderboard count). On a degraded `mcpRes`, the fallback `topCategoryFallback` uses derived repos with category `mcp` — count then displays the fallback's 5, masking that the MCP feed is down.

Fix: derive count from the same envelope being rendered, and surface a "fallback" or "degraded" sub-label when the real feed is missing. **Design call**.

### P1-6 — Bubble map header "LIVE · MM.DD" lies on every cold render
[src/components/terminal/BubbleMap.tsx:199-200](../../../src/components/terminal/BubbleMap.tsx#L199): `headerStatus = LIVE · ${UTC month.day}`. Stamps today's date even when the underlying `repos` snapshot is hours/days old. Empty-state branch ([line 234](../../../src/components/terminal/BubbleMap.tsx#L234)) also runs a pulsing green dot via `animate-pulse` — an empty radar that pulses green = stronger lie than the populated one.

Fix: wrap header + empty state in `<FreshnessBadge lastUpdatedAt={lastFetchedAt} source="repos">`. **Mechanical** at the call site, **design call** for the empty-state copy.

### P1-7 — `.feat-grid` 5-column layout collapses badly at 1100-720px
[globals.css:2156-2166](../../../src/app/globals.css#L2156): 5 cols → 3 cols at 1100px → 2 cols at 720px. The 5-card layout already over-compresses titles via `!important` overrides ([globals.css:2130-2154](../../../src/app/globals.css#L2130)). Tablet (720-1100px) crops the third card's content awkwardly because the second/third Featured cards (smaller height) sit beside a hero card that's still inline.

Fix: drop to a 2-col / 1-col layout earlier (e.g. 5 → 2 at ≤1100px), or remove `!important` overrides and let the cards breathe via natural typography. **Design call**.

### P1-8 — `.hero-row` 5-col grid has no mobile reflow
[globals.css:1769-1797](../../../src/app/globals.css#L1769): `grid-template-columns: 26px 28px minmax(0, 1fr) auto 92px` — fixed sparkline 92px column. At 375px after the home-surface padding (12px×2 = 24px) and grid gutters, the `nm` column has ~80px for `nm.txt + nm.sub`. The `.txt` is `text-overflow: ellipsis` so long names truncate, but the delta-stack column is `auto` and the spark eats 92px regardless. Result on mobile: 3-4 char repo names visible.

Fix: at `(max-width: 767px)`, hide the sparkline column inside `.hero-row` (mirror the `.brk-row` mobile rule at globals.css:2965), giving the name 80-120px more. **Mechanical**.

### P1-9 — `feat-card .desc / .why { display: none }` is dead-code drift
[globals.css:2135-2141](../../../src/app/globals.css#L2135): two whole classes hidden via `display: none`. Indicates the FeaturedCard component used to render `.desc` and `.why` blocks that were stripped without removing the CSS. The current `FeaturedCard` ([page.tsx:597](../../../src/app/page.tsx#L597)) never emits those classes. Drift between the V2 era and current code.

Fix: delete the two rules. **Mechanical**.

## P2 findings

### P2-1 — Spark stroke 1.6px is one notch off the design system's 2px line spec
[src/app/page.tsx:387](../../../src/app/page.tsx#L387) `strokeWidth={1.6}`. DESIGN.md says chart `line` is 2px. Trivial but inconsistent across the home sparklines (1.6) and the chart-theme tokens (2). **Mechanical**.

### P2-2 — "NO SERIES" empty state for sparklines is loud
[src/app/page.tsx:444](../../../src/app/page.tsx#L444) renders a dashed-border pill with uppercase "NO SERIES" text inline with live rows. Reads as an error on the hero scan even though it's just missing data. Honest, but noisy. Consider a low-contrast `—` glyph or a flat baseline mini-spark. **Design call**.

### P2-3 — TR-100 Index aggregates 5 repos' sparklines into one line with no per-leader breakout
[src/app/page.tsx:967-991](../../../src/app/page.tsx#L967) sums each bucket across 5 leaders into a single area-filled line, then renders a legend strip of the 5 names beneath. Reader can't tell which repo contributes which slice of the line — it reads as "trust us, this is the index." For a screener, the chart should be either (a) the literal stacked area per leader, or (b) the sum line + small individual sparks on the legend. **Design call**.

### P2-4 — Crumb "TREND / TERMINAL / FRONT PAGE" is decorative
[src/app/page.tsx:842](../../../src/app/page.tsx#L842): a fake breadcrumb on the homepage (since there's no parent route). PRODUCT.md anti-feel includes "Generic startup hero." A made-up breadcrumb on the root URL reads as that anti-pattern. **Design call** — kill it or replace with a real status line ("// HOME · {N} repos tracked · {lastUpdatedAt}").

### P2-5 — `<details>`-based FAQ swallows keyboard focus from the `[+]/[-]` glyph
[src/app/page.tsx:1076-1078](../../../src/app/page.tsx#L1076): `<span class="toggle-closed">[+]</span>` is `aria-hidden`. Visual ok, but the user gets no SR cue when toggling. `<details>`/`<summary>` is a11y-correct on its own (native expand state), so the `aria-hidden` glyph is redundant; just confirm SR users hear the expanded/collapsed state. Should be fine in modern UA — flag for verification. **Verify in browser**.

### P2-6 — Six metrics on first row is the upper limit per DESIGN.md
[src/app/page.tsx:863-870](../../../src/app/page.tsx#L863) `<MetricGrid columns={6}>`. At 1280px (xl breakpoint, common laptop), six columns means each metric is ~200px after padding — labels are ok but values + sub use `font-size-3xl` which can wrap into the sub. Consider `columns={5}` (drops "top category" into a sub-line, or move it into the FooterBar). **Design call**.

### P2-7 — `.cons-row` and `.brk-row` first-row gradients use brand orange + green at high opacity
[globals.css:1959](../../../src/app/globals.css#L1959) `linear-gradient(90deg, var(--acc-soft), transparent 60%)` and [globals.css:2091](../../../src/app/globals.css#L2091) `linear-gradient(90deg, rgba(34, 197, 94, 0.1), transparent 70%)`. The Consensus row uses brand orange tint, Breakout uses green — semantically: brand = "this is the top," green = "accelerating." Could double-encode (top-1 + accelerating) on the same repo in both panels, painting the same row two different tints in adjacent cards. Visually noisy but defensible. **Design call**.

### P2-8 — Footer string "DATA / HH:MM:SS UTC" lies about granularity
[src/app/page.tsx:1309](../../../src/app/page.tsx#L1309) `actions={`DATA / ${refreshedTime} UTC`}`. The home is ISR-cached 60s ([page.tsx:63](../../../src/app/page.tsx#L63)) so the timestamp is the snapshot time, but it reads as a real-time clock. Same as the page-head clock above. **Design call** — either run `<FreshnessBadge>` here too, or label it "snapshot at HH:MM."

## What's working well

- **Honest "NO SERIES" pattern** ([page.tsx:443-447](../../../src/app/page.tsx#L443)): missing sparkline data renders an explicit empty marker instead of a fake flat line. P0 honesty applied at the right level.
- **Mention-count chip "skip zero-source" rule** ([LiveTopTable.tsx:483-484](../../../src/components/home/LiveTopTable.tsx#L483)): comment explains why ghost-grey chips were removed — high-quality drift correction.
- **Sub-1% pct formatter** ([LiveTopTable.tsx:155-173](../../../src/components/home/LiveTopTable.tsx#L155)): `+<0.1%` instead of `+0%` for tiny deltas — exactly the right honesty fix.
- **`SvgSparkline` swap from `EChartSparkline`** ([LiveTopTable.tsx:175-178](../../../src/components/home/LiveTopTable.tsx#L175)) — saves the 150KB ECharts chunk on the most data-dense surface. Performance call.
- **Viewport-triggered prefetch** ([LiveTopTable.tsx:329](../../../src/components/home/LiveTopTable.tsx#L329)) with Save-Data + concurrency cap — perfect K2.
- **Functional border-left rails** ([globals.css:1789-1796](../../../src/app/globals.css#L1789), [1956-1960](../../../src/app/globals.css#L1956), [2088-2092](../../../src/app/globals.css#L2088)) — every first-row left-rail is color-keyed to its tier (panel acc / consensus acc / breakout green). This is the "not decorative slop" pattern DESIGN.md defends.
- **Sticky 2px card radii** preserved across `.feat-card`, `.cons-row`, `.brk-row`, `.hero-panel` — terminal feel intact.
- **No card shadows** anywhere on the home surface — design system enforced.
- **FAQ + JSON-LD pulled from one array** ([page.tsx:68-93, 1167-1180](../../../src/app/page.tsx#L1167)) — `HOMEPAGE_FAQ` is single source of truth, K2-correct.

## Verify-in-context

- [ ] Load `/` at 375px on a real iOS Safari — confirm `.hero-row` truncation, `.fchip` tap targets, MetricGrid 2-col reflow.
- [ ] Stop the Redis collector + ISR-revalidate the page; verify every "LIVE" pip still renders green (this is the bug that blocks the fix being merged blind).
- [ ] Tab through the page; confirm whether the chart-toggle `<span>`s ever land in tab order (they shouldn't) and whether the chart pretends to respond.
- [ ] Run Lighthouse mobile — current score baseline for re-test after fixes.

## Mechanical fixes ready to ship

1. Delete dead `feat-card .desc / .why { display: none }` rules ([globals.css:2135-2141](../../../src/app/globals.css#L2135)).
2. Drop `delta="+ live"` from "stars today" Metric ([page.tsx:865](../../../src/app/page.tsx#L865)).
3. Hide `.hero-row .spark` at `(max-width: 767px)` (one CSS rule, mirrors `.brk-row` mobile pattern).
4. Bump `.fchip` to `min-height: 44px` at `(max-width: 767px)`.
5. Bump sparkline `strokeWidth` to 2.

## Quick-fix patches (optional)

```diff
// src/app/page.tsx
-          <Metric label="stars today" value={formatCompact(total24h)} delta="+ live" tone="positive" />
+          <Metric label="stars today" value={formatCompact(total24h)} sub="24h aggregate" tone="positive" />
```

```diff
// src/app/page.tsx — five LIVE call sites
- right={<span className="live">LIVE</span>}
+ right={<FreshnessBadge lastUpdatedAt={lastFetchedAt} source="repos" />}

// for Skills / MCP panels use the matching `NewsSource` token
+ <FreshnessBadge lastUpdatedAt={skillsRes.value.fetchedAt} source="skills" />
+ <FreshnessBadge lastUpdatedAt={mcpRes.value.fetchedAt}   source="mcp" />
```

```css
/* globals.css */
@media (max-width: 767px) {
  .hero-row { grid-template-columns: 24px 28px minmax(0, 1fr) auto; }
  .hero-row .spark { display: none; }
  .live-top-filters .fchip { min-height: 44px; padding: 10px 12px; }
}
/* delete dead rules */
- .feat-card .desc { display: none; }
- .feat-card .why  { display: none; }
```

```diff
// src/app/page.tsx ConsensusRow — render only firing sources
- {SOURCE_ICONS.slice(0, channels).map(({ key, label, Icon }) => (
+ {SOURCE_ICONS
+   .filter(({ key }) => (repo.channelStatus?.[key] ?? 0) > 0)
+   .map(({ key, label, Icon }) => (
```
