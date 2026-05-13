# /hackernews/trending audit — 2026-05-13

## Files audited
- [src/app/hackernews/trending/page.tsx](../../../src/app/hackernews/trending/page.tsx) — RSC page entry, KpiBand snapshot, WindowedHnFeed wrapper, HnStoryFeed table.
- [src/app/hackernews/trending/loading.tsx](../../../src/app/hackernews/trending/loading.tsx) — pulse skeleton.
- [src/app/hackernews/trending/error.tsx](../../../src/app/hackernews/trending/error.tsx) — boundary fallback.
- [src/components/feed/WindowedFeedTable.tsx](../../../src/components/feed/WindowedFeedTable.tsx) — 24h/7d/30d window switcher (consumed in legacy mode).
- [src/components/feed/TerminalFeedTable.tsx](../../../src/components/feed/TerminalFeedTable.tsx) — shared dense table (consumed).
- [src/components/templates/SourceFeedTemplate.tsx](../../../src/components/templates/SourceFeedTemplate.tsx) — page shell (consumed).
- [src/components/ui/KpiBand.tsx](../../../src/components/ui/KpiBand.tsx), [src/components/ui/LiveDot.tsx](../../../src/components/ui/LiveDot.tsx) — chrome primitives.
- [src/components/shared/FreshnessBadge.tsx](../../../src/components/shared/FreshnessBadge.tsx) — sanctioned freshness pattern (**NOT used on this surface**).
- [src/lib/news/freshness.ts](../../../src/lib/news/freshness.ts) — `hackernews` NewsSource exists at L20 / L44 (fast threshold), ready to wire.
- [src/app/globals.css#L2296-2337](../../../src/app/globals.css) — `.tabs` / `.tab` chrome (consumed by legacy WindowedFeedTable).

## P0 findings (dishonest / broken / a11y blocker)

### P0-1 — Hardcoded `<LiveDot label="LIVE · 24H">` with no `FreshnessBadge`
[page.tsx:116](../../../src/app/hackernews/trending/page.tsx#L116). `<LiveDot label={`LIVE · ${trendingFile.windowHours}H`} />` in the PageHead clock slot, no tone prop → defaults to `money` which renders a green pulse via [LiveDot.tsx:20-32](../../../src/components/ui/LiveDot.tsx#L20). It fires green pulse even when the HN scraper is hours / days stale, identical to the defect waves 3a/3b/3c closed on `/`, `/signals`, `/funding`. `FreshnessBadge` is never imported on this route despite `freshness.ts` already shipping a `hackernews` threshold.

Fix: keep `LiveDot` as a tone slot (acceptable visual anchor) **only** when paired with `<FreshnessBadge source="hackernews" lastUpdatedAt={trendingFile.fetchedAt} />` immediately after — exactly the lobsters pattern at [lobsters/page.tsx:217-218](../../../src/app/lobsters/page.tsx#L217). Better: drop the hardcoded `LiveDot` and let `FreshnessBadge` own the verdict. **Mechanical.**

### P0-2 — Window-toggle tabs render `<button>` 28px tall — sub-44 mobile tap target
[WindowedFeedTable.tsx:148-159](../../../src/components/feed/WindowedFeedTable.tsx#L148) + [globals.css:2305-2314](../../../src/app/globals.css#L2305). `.tabs .tab` is `padding: 9px 14px; font-size: var(--font-size-lg)` (10px from terminal sub-scale) → measured height ≈ 28px. Three tabs sit side-by-side as the only window switcher on this surface; missing the right one on touch is the primary scan-flow error mode. PRODUCT.md "Mobile posture" mandates 44×44 minimums; WCAG 2.5.5 (Level AAA) and 2.5.8 (Level AA, Target Size Minimum) both fail.

Fix: bump `.tabs .tab` to `min-height: 44px; padding: 12px 14px; display: inline-flex; align-items: center` (or scope under `@media (max-width: 767px)` if desktop density is sacred). This is consumed by /hackernews/trending, /lobsters, /devto, /bluesky, /reddit — a shared win. **Mechanical.**

### P0-3 — Cold-state branch drops the PageHead clock + freshness entirely
[page.tsx:79-94](../../../src/app/hackernews/trending/page.tsx#L79). When `allStories.length === 0`, the cold branch renders `SourceFeedTemplate` with `crumb + title + lede` but no `clock` slot — and a `ColdState` section underneath whose copy says "the scraper hasn't run yet" with a literal `npm run scrape:hn` command. (1) no `FreshnessBadge` even in cold, so a user can't tell whether the surface is genuinely empty vs the Redis envelope returned [] vs the scraper is down. (2) operator copy (`<code>npm run scrape:hn</code>`) leaks to the public surface — identical anti-pattern to the wave-2 twitter audit P1 "Cold-state lede leaks internal API endpoint." Honest-by-default voice says "HN scan is cold — fresh data lands hourly," not "run this CLI."

Fix: (a) render `<FreshnessBadge source="hackernews" lastUpdatedAt={trendingFile.fetchedAt} />` in the clock slot even in the cold branch — it'll render `COLD · Nd` honestly; (b) replace the `<code>npm run scrape:hn</code>` copy with public-friendly "HN scan is cold — fresh data lands hourly." and gate the dev hint behind `process.env.NODE_ENV === "development"`. **Mechanical.**

## P1 findings (visible regression)

### P1-1 — `HN_ORANGE = "#ff6600"` hardcoded RGB instead of the source token
[page.tsx:55](../../../src/app/hackernews/trending/page.tsx#L55) `const HN_ORANGE = "#ff6600"` is reused on rank ≤10 ([L198](../../../src/app/hackernews/trending/page.tsx#L198)), FP badge bg ([L256](../../../src/app/hackernews/trending/page.tsx#L256)), score ≥100 ([L273](../../../src/app/hackernews/trending/page.tsx#L273)), cold-state h2 ([L339](../../../src/app/hackernews/trending/page.tsx#L339)), TerminalFeedTable accent ([L316](../../../src/app/hackernews/trending/page.tsx#L316)). DESIGN.md "Source brand colors" defines `--source-hackernews: #ff7a3d` and the V4 alias `--v4-src-hn: #ff7a3d` ([globals.css:176, 6226](../../../src/app/globals.css#L176)). The page's `#ff6600` (true classic HN orange) and the system token `#ff7a3d` (perceptually-tuned brand orange) are two different oranges; the surface drifts from the OG card / heatmap tile renders that consume the token. KpiBand already uses `var(--v4-src-hn)` correctly at [L126](../../../src/app/hackernews/trending/page.tsx#L126) — the rest of the file should match.

Fix: replace the literal with `const HN_ORANGE = "var(--v4-src-hn)"` (or just inline `"var(--v4-src-hn)"` everywhere). **Mechanical.**

### P1-2 — Title cell loses its `linkedRepo` chip on mobile because the parent uses `flex` without wrap
[page.tsx:209-244](../../../src/app/hackernews/trending/page.tsx#L209). `<div className="flex min-w-0 items-center gap-2">` holds `EntityLogo` + truncated `<a>` title + `↳ owner/repo` chip. On 375px after the `.home-surface` 16px padding × 2, the rank col (44px) + score col (70px), the title column is ~210px wide. With a 20px logo + 8px gap + truncated title, the `↳ linkedRepo` chip frequently sits zero-width or scroll-clipped. The `linkedRepo` chip is the cross-source value-add of this surface — losing it on mobile kills the "HN story → linked GH repo" pivot.

Fix: either (a) wrap the chip to a new line with `flex-wrap` + `basis-full` on `<a>` so the chip drops below the title at <640px, or (b) hide the chip in the title cell on mobile and re-render it as a tappable row-accordion. **Design call.**

### P1-3 — `WindowedFeedTable` legacy mode ships 3× HTML payload + missing `tabpanel` association
[WindowedFeedTable.tsx:127-167](../../../src/components/feed/WindowedFeedTable.tsx#L127). Page wires legacy mode (`table24h/7d/30d` props at [page.tsx:181-183](../../../src/app/hackernews/trending/page.tsx#L181)), so all three pre-rendered tables — up to 50 rows × full row markup × 3 — ship in the initial HTML even though only one is visible. The component's own JSDoc ([WindowedFeedTable.tsx:11-15](../../../src/components/feed/WindowedFeedTable.tsx#L11)) explicitly recommends the opt-in `?win=` mode for the perf path. Separately, the tab strip uses `role="tablist"` + `role="tab"` + `aria-selected` correctly, but the table itself isn't wrapped in `role="tabpanel"` / `aria-labelledby` so screen readers can't tie selection to content. Same defect wave-3d /skills closed.

Fix: migrate the page to the `?win=` opt-in mode (also requires dropping `export const revalidate = 300` → `export const dynamic = "force-dynamic"` for the param to pick up — already dynamic-ish at 5min ISR, the cost is small). Add `id` to each `role="tab"` and wrap the rendered table in `<section role="tabpanel" aria-labelledby={selectedTabId}>`. **Design call** for the dynamic-route trade-off; **mechanical** for the aria fix.

### P1-4 — Row stagger animation overrides `prefers-reduced-motion`
[TerminalFeedTable.tsx:156-158](../../../src/components/feed/TerminalFeedTable.tsx#L156) sets `animation: slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both; animation-delay: ${stagger}ms` as inline style. The global `prefers-reduced-motion` rule at [globals.css:1103](../../../src/app/globals.css#L1103) zeroes animation-duration via class selectors, but inline styles win over class rules unless the class is set with `!important`. Up to 50 rows × 50ms stagger (capped at 6 = 300ms) on initial paint for reduced-motion users. Same defect as wave-2 twitter audit P1-row-stagger.

Fix: move the animation into a class (`.v2-row` already exists — apply via `data-stagger="${rowIndex}"` + CSS `--stagger-delay` + class-level animation), so the reduced-motion override actually applies. **Mechanical.**

### P1-5 — `formatClock` cold path returns `"warming"` — same warm/scraped lie as /twitter
[page.tsx:64-67](../../../src/app/hackernews/trending/page.tsx#L64). When `trendingFile.fetchedAt` is undefined, the clock cell reads `warming · UTC · SCRAPED · LIVE · 24H` — a five-token honest-looking telemetry line that's actually wholly fabricated. Wave-2 twitter audit P0-2 named this defect explicitly. The cold branch already protects against `allStories.length === 0`, but if `fetchedAt` is missing while stories exist (Redis envelope half-populated), the clock lies.

Fix: return `"OFFLINE"` or `"—"` and let `FreshnessBadge` (per P0-1) own the COLD verdict. **Mechanical.**

### P1-6 — KpiBand "FRONT PAGE" tone="money" greens up a non-freshness signal
[page.tsx:135-141](../../../src/app/hackernews/trending/page.tsx#L135). `FRONT PAGE` cell uses `tone: "money"` and `pip: "var(--v4-money)"` — green. Per DESIGN.md color semantics, `--color-money` / `--v4-money` is reserved for monetary / fresh-now / positive-delta semantics. "Stories that ever hit FP" is a tier signal, not a freshness or money signal. Reads as "this many fresh stories" on first glance.

Fix: switch to `tone="acc"` + pip `--v4-src-hn` (HN orange — matches the FP badge in-row at [L256](../../../src/app/hackernews/trending/page.tsx#L256)). **Design call.**

### P1-7 — Reading rank highlight uses two oranges across one column
[page.tsx:196-202](../../../src/app/hackernews/trending/page.tsx#L196). The `#` cell colors rank <10 with `HN_ORANGE` ("#ff6600") and rank ≥10 with `--v4-ink-400`. Five rows later the FP badge ([L256](../../../src/app/hackernews/trending/page.tsx#L256)) renders the *same* `HN_ORANGE` as a filled background, and the score cell ([L273](../../../src/app/hackernews/trending/page.tsx#L273)) repeats it for `score ≥ 100`. Three orange semantics in one row: rank-tier, FP-hit, score-tier — all encoded with the same hue. Reader can't tell which signal is which without checking column headers.

Fix: keep `HN_ORANGE` (post-P1-1, → `--v4-src-hn`) for the FP badge (source identity) and the rank ≤10 highlight (tier signal); switch the `score ≥ 100` cell to `--v4-money` or bold-weight ink-000 so the three semantics decouple visually. **Design call.**

## P2 findings (polish / drift)

### P2-1 — `LiveDot role="status" aria-live="polite"` fires on every render
[LiveDot.tsx:30-39](../../../src/components/ui/LiveDot.tsx#L30). The dot is decorative (always-on), but the `role="status"` + `aria-live="polite"` on the wrapper means screen readers re-announce "LIVE · 24H" on every component render. Honest-chrome aside, the SR experience is noisy.

Fix: drop `role="status"` + `aria-live` — the freshness verdict belongs on `FreshnessBadge` (which itself doesn't `aria-live` for the same reason). **Mechanical.**

### P2-2 — Tabs caption "rows · {win}" uses muted ink — fails 4.5:1 contrast
[WindowedFeedTable.tsx:160-162](../../../src/components/feed/WindowedFeedTable.tsx#L160) + [globals.css:2331-2336](../../../src/app/globals.css#L2331). `.tabs .right` is `color: var(--ink-400)` against `var(--bg-025)` (`#0c0d10` ish). Mono 12px small caps at ink-400 measures ~3.2:1 contrast. WCAG AA needs 4.5:1 for text under 18px.

Fix: switch to `var(--ink-300)` (matches `.tab` rest state). **Mechanical.**

### P2-3 — Cold-state border is dashed; populated branch is solid — inconsistent affordance
[page.tsx:328-358](../../../src/app/hackernews/trending/page.tsx#L328) cold-state uses `border: 1px dashed var(--v4-line-100)` + `borderRadius: 2`; populated TerminalFeedTable uses `border: 1px solid var(--v3-line-200)` ([TerminalFeedTable.tsx:110-112](../../../src/components/feed/TerminalFeedTable.tsx#L110)). The dashed border on empty state is the "placeholder" pattern from the DESIGN.md "no series" idiom, but the rest of the project uses dashed only for *true* empty cells, not full surface empty-state. Reads as "this UI is unfinished," not "this data is empty."

Fix: use `border: 1px solid var(--v3-line-100)` for the cold-state container and let the headline ink-color do the empty-state lift. **Design call.**

### P2-4 — `EntityLogo` at 20px square uses `shape="square"` — drifts from DESIGN.md radii
[page.tsx:212-217](../../../src/app/hackernews/trending/page.tsx#L212). `shape="square"` is fine, but DESIGN.md radii ladder caps at 2px for cards; a 20px source-logo with `shape="square"` ends up perfectly sharp-cornered next to the 2px-rounded `↳ linkedRepo` chip ([L235-237](../../../src/app/hackernews/trending/page.tsx#L235)). Tiny inconsistency.

Fix: `shape="rounded"` (2px) or leave both sharp — pick one. **Design call.**

### P2-5 — `WindowedFeedTable` default `defaultWindow="7d"` but page also passes `defaultWindow="7d"` — dead prop
[page.tsx:184](../../../src/app/hackernews/trending/page.tsx#L184). Component default at [WindowedFeedTable.tsx:56](../../../src/components/feed/WindowedFeedTable.tsx#L56) is already `"7d"`. Dead.

Fix: drop the prop. **Mechanical.**

## What's working well

- **Per-window pre-computation is server-side** — `sortByScore` + `inWindow` ([page.tsx:162-175](../../../src/app/hackernews/trending/page.tsx#L162)) runs in RSC; client only swaps which pre-rendered tree mounts. No client-side filtering = no flash of unfiltered content.
- **`hideBelow="sm"` on FP column + `hideBelow="md"` on Cmts/Age** ([page.tsx:251, 284, 299](../../../src/app/hackernews/trending/page.tsx#L251)) hides non-essential columns at narrow breakpoints — title + score + rank survive at 375px, which is exactly the right priority for the scan question.
- **`hnItemHref` opens in new tab with `rel="noopener noreferrer"`** ([page.tsx:218-222](../../../src/app/hackernews/trending/page.tsx#L218)) — correct security posture for external links.
- **Score-color tier (≥100 → orange)** is honest semantic encoding — high-score stories visibly stand out.
- **KpiBand `--v4-src-hn` pip on TRACKED** ([page.tsx:126](../../../src/app/hackernews/trending/page.tsx#L126)) — correct source-token use; this is the canonical pattern other cells should match (per P1-1, P1-6).
- **Sentry-wired error boundary** ([error.tsx:13-17](../../../src/app/hackernews/trending/error.tsx#L13)) captures rendering failures honestly; honest copy "this surface failed to render" beats most app-router defaults.
- **Caption on table** ([page.tsx:317](../../../src/app/hackernews/trending/page.tsx#L317)) — `<caption>` is screen-reader visible inside `TerminalFeedTable`; meaningful description.

## Verify-in-context

- **P0-1 honest-chrome lie is the same shape as the lobsters / devto / twitter siblings** — the LiveDot pattern was authored once and ships across 5 source-feed routes. Fixing it here unblocks a one-liner sweep across the family.
- **P0-2 tap-target is shared** — `.tabs .tab` is consumed by /hackernews/trending, /lobsters, /devto, /bluesky, /reddit. One CSS edit closes 5 routes' P0 simultaneously.
- **P0-3 cold-state operator-copy leak** matches twitter-audit P1 "internal API endpoint" — same anti-pattern, different surface; fix once + grep for siblings.
- **HN data is currently working per OPERATOR notes (hourly scrape, `data/hackernews-trending.json`)** — none of the P0s are masking real data degradation; they're chrome lies on healthy data.
- 6 of 7 P1s + 3 of 5 P2s are mechanical fixes touching ≤5 lines each.

## Mechanical fixes ready to ship

1. **Honest-chrome on the clock slot** — replace `<LiveDot label={...} />` at [page.tsx:116](../../../src/app/hackernews/trending/page.tsx#L116) with `<FreshnessBadge source="hackernews" lastUpdatedAt={trendingFile.fetchedAt} />` (drop `LiveDot` import) — closes P0-1.
2. **Tab tap target 44×44** — `.tabs .tab { min-height: 44px; padding: 12px 14px; display: inline-flex; align-items: center; }` at [globals.css:2305](../../../src/app/globals.css#L2305) — closes P0-2 across 5 routes.
3. **Cold-state freshness + dev-only operator copy** — add `clock` slot in cold branch with `FreshnessBadge`; swap `<code>npm run scrape:hn</code>` block behind `NODE_ENV === "development"` — closes P0-3.
4. **`HN_ORANGE` → `--v4-src-hn`** at [page.tsx:55](../../../src/app/hackernews/trending/page.tsx#L55) — closes P1-1.
5. **`formatClock` cold path** — return `"OFFLINE"` instead of `"warming"` at [page.tsx:67](../../../src/app/hackernews/trending/page.tsx#L67) — closes P1-5.
6. **KpiBand FRONT PAGE tone** — `tone: "money"` → `tone: "acc"` + `pip: "var(--v4-src-hn)"` at [page.tsx:139-140](../../../src/app/hackernews/trending/page.tsx#L139) — closes P1-6.
7. **Drop dead `defaultWindow` prop** at [page.tsx:184](../../../src/app/hackernews/trending/page.tsx#L184) — closes P2-5.
8. **LiveDot SR noise** — drop `role="status"` + `aria-live` at [LiveDot.tsx:34-35](../../../src/components/ui/LiveDot.tsx#L34) — closes P2-1 globally.
9. **Tabs `.right` contrast** — `color: var(--ink-300)` at [globals.css:2332](../../../src/app/globals.css#L2332) — closes P2-2.

## Counts

- P0: 3
- P1: 7
- P2: 5
- Total: 15
