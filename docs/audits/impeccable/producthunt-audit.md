# /producthunt audit — 2026-05-13

> Impeccable design audit on `/producthunt` (host page + 3 components). Project rules applied: honest freshness chrome non-negotiable; ProductHunt brand `--source-producthunt: #da552f` token EXISTS (globals.css:182) but is bypassed by a hardcoded `PH_RED` const; PH cron cadence = 16h budget per `PRODUCTHUNT_STALE_THRESHOLD_MS` (source-health.ts:53). NewsSource union already lists `producthunt` so the freshness wiring is unblocked.

## Files audited

- [src/app/producthunt/page.tsx](../../../src/app/producthunt/page.tsx) — host page (574 LOC, table + cross-link panel + cold/empty/tabnav)
- [src/app/producthunt/loading.tsx](../../../src/app/producthunt/loading.tsx) — skeleton
- [src/app/producthunt/error.tsx](../../../src/app/producthunt/error.tsx) — error boundary
- [src/components/producthunt/LaunchLinkIcons.tsx](../../../src/components/producthunt/LaunchLinkIcons.tsx) — Globe/X/GitHub mini-icons
- [src/components/producthunt/PhBadge.tsx](../../../src/components/producthunt/PhBadge.tsx) — repo-card PH chip (off-route consumer)
- [src/components/producthunt/RecentLaunches.tsx](../../../src/components/producthunt/RecentLaunches.tsx) — homepage 5-row section (currently orphaned, no importers)
- Cross-refs: [FreshnessBadge.tsx](../../../src/components/shared/FreshnessBadge.tsx), [freshness.ts](../../../src/lib/news/freshness.ts), [LiveDot.tsx](../../../src/components/ui/LiveDot.tsx), [source-health.ts](../../../src/lib/source-health.ts#L53)

## P0 findings

### 1. Hardcoded `<LiveDot label="FRESH · 4H" />` — honest-chrome violation

- **File**: [page.tsx:151](../../../src/app/producthunt/page.tsx#L151)
- **Mechanical**: `<LiveDot label="FRESH · 4H" />` renders the default `tone="money"` (green, pulsing) with a static `FRESH · 4H` literal. The label has zero relation to `fetchedAt`, and the PH stale budget is **16h** (source-health.ts:53), not 4h — the copy is wrong on TWO axes (constant 4 vs. the 16h spec, and constant vs. the live age). Exact pattern called out in [feedback_freshness_chrome_must_be_honest](C:\Users\mirko\.claude\projects\c--dev-trendingrepo\memory\feedback_freshness_chrome_must_be_honest.md): "Never inline hardcoded 'FRESH · 1H' / green-pulse LiveDot. Wire `lastUpdatedAt` to `FreshnessBadge` via `classifyFreshness()`." `producthunt` is already a `NewsSource` (freshness.ts:24) so the badge compiles immediately.
- **Fix**: Replace with `<FreshnessBadge source="producthunt" lastUpdatedAt={getProducthuntFetchedAt()} />`. Read the timestamp via the existing loader getter (producthunt.ts:84) — do NOT re-derive from `topLaunches[0]?.createdAt` (see #2). Optionally pass `oldestRecordAt={findOldestRecordAt(file)}` if PH records carry `lastRefreshedAt` stamps.
- **Design call**: mechanical — single-line swap, no new tokens needed.

### 2. Clock value reads launch `createdAt`, not scrape `fetchedAt` — second honest-chrome violation

- **File**: [page.tsx:107](../../../src/app/producthunt/page.tsx#L107) (`fetchedAt = !cold ? topLaunches[0]?.createdAt : undefined`) + [page.tsx:149](../../../src/app/producthunt/page.tsx#L149) (`<span className="big">{formatClock(fetchedAt)}</span>`)
- **Mechanical**: The comment two lines above admits the hack — "Pull lastFetchedAt off the loader's getter". The code does the opposite: it reads `topLaunches[0]?.createdAt`, i.e. the timestamp of the **top-voted launch's post date** on ProductHunt, not the time TrendingRepo last scraped. With the 7-day window + votes-desc sort, that timestamp is usually 1–6 days old — the muted `UTC · LATEST POST` sub-label half-acknowledges this but the visual reads as "this page is N days old". After #1, the FreshnessBadge would expose the true scrape age right next to a clock claiming an entirely different age. The two values must agree.
- **Fix**: Replace `topLaunches[0]?.createdAt` with `getProducthuntFetchedAt()` (already imported via `producthuntCold` from `@/lib/producthunt`). Keep the `UTC · LATEST POST` sub-label OR rename to `UTC · LAST SCRAPE` to match. Recommend the latter — the page already shows per-launch `formatRelative(l.createdAt)` in the POSTED column for individual post age.
- **Design call**: mechanical — one expression swap + sub-label copy fix.

### 3. Brand color hardcoded as `PH_RED = "#DA552F"` — token EXISTS but is bypassed in 7 sites

- **File**: [page.tsx:28](../../../src/app/producthunt/page.tsx#L28) (const declaration), then consumed at L161, L244, L259, L277, L287, L432, L465, L504, L561 — **9 use-sites** for one literal
- **Mechanical**: `globals.css:182` already defines `--source-producthunt: #da552f` (oklch sibling at L183). The PhBadge component correctly threads `var(--source-producthunt)` via inline style (PhBadge.tsx:46,48,50,55) — so the token is the established convention. The page page bypasses it entirely. Worse, [RecentLaunches.tsx:20](../../../src/components/producthunt/RecentLaunches.tsx#L20) declares its OWN const `PH_ORANGE = "#DA552F"` — three different names (`PH_RED`, `PH_ORANGE`, `--source-producthunt`) all hold the same value, classic drift surface. The brand spec calls it ProductHunt orange `#da552f`; "PH_RED" const name actively misleads. The PageHead clock + tab underline + rank tint + hot-vote tint + cross-link tint + cold-state heading + empty-state heading all paint the same brand orange via the wrong path.
- **Fix**: Delete the `PH_RED` const. Replace each call-site with `var(--source-producthunt)` (inline style for the dynamic ones, or a CSS class for the static ones). For the v4 KpiBand `pip` prop (page.tsx:161) pass `"var(--source-producthunt)"`. Also delete `PH_ORANGE` in RecentLaunches.tsx and route through the same token. Match the existing PhBadge.tsx pattern exactly. Optional: add a `--v4-src-ph` mirror in the v4 token block (globals.css:6226-6233) for consistency with `--v4-src-hn`/`--v4-src-x` etc.
- **Design call**: mechanical — token exists, 10 literal sites collapse to one var reference.

## P1 findings

### 4. Loading skeleton on v3 tokens — drift vs. surrounding v4 page

- **File**: [loading.tsx:10,14,18,23,30,38](../../../src/app/producthunt/loading.tsx#L10) — 6 references to `var(--v3-bg-050)` / `var(--v3-bg-100)`
- **Mechanical**: globals.css alias chain keeps v3 visually identical to v4 today, but every other recent audit (huggingface, npm) flagged the same drift and the sweep is being done globally. PH is the only top-tier source-feed page still on v3 skeleton tokens.
- **Fix**: `--v3-bg-050` → `--v4-bg-050`, `--v3-bg-100` → `--v4-bg-100`. One file, 6 lines.
- **Design call**: mechanical.

### 5. Error boundary on v2 tokens — same drift, older generation

- **File**: [error.tsx:23,32,42,49,52](../../../src/app/producthunt/error.tsx#L23) — `--v2-sig-red`, `--v2-ink-000/300/400`
- **Mechanical**: Two generations behind. Same global sweep applies as HF #9 audit finding.
- **Fix**: `--v2-sig-red` → `--v4-red`, `--v2-ink-*` → `--v4-ink-*`. Five token swaps in one file.
- **Design call**: mechanical.

### 6. `RecentLaunches` component is orphan — zero importers, but ships in the bundle

- **File**: [RecentLaunches.tsx](../../../src/components/producthunt/RecentLaunches.tsx) (153 LOC)
- **Mechanical**: `grep -rn 'RecentLaunches\|from .*RecentLaunches' src/` returns only the file's own exports and the default re-export. No page imports it. The file references `getAiLaunches`, `getDerivedRepoByFullName`, `next/image`, `producthuntCold`, and the duplicate `PH_ORANGE` const — all dead weight if nothing renders it. The comment at L1-9 still describes it as a "homepage section". Either the homepage hook was removed during a sprint and the file orphaned, or the import is pending. Either way the file is currently dead code, and it owns one of two `PH_ORANGE` literals (see #3).
- **Fix**: Decide intent. If `RecentLaunches` should ship on the homepage, restore the import on `/` (and clean up its `PH_ORANGE` per #3). If not, delete the file. K2-simplicity says delete unless there's a documented sprint to wire it back. Recommend delete + capture in `tasks/BACKLOG.md` if homepage revival is planned.
- **Design call**: design — needs a product call (is the homepage strip on the roadmap?), then mechanical.

### 7. `<div className="hidden mt-0.5 inline-flex …">` — `hidden` always wins, this block never renders

- **File**: [page.tsx:364](../../../src/app/producthunt/page.tsx#L364)
- **Mechanical**: The optional `<a>` rendering the github URL under the launch name carries Tailwind `hidden` AND `inline-flex` — `hidden` (display: none) wins. The branch is permanently invisible. This duplicates the GitHub icon already shown in the LINKS column via `<LaunchLinkIcons>`, so it was likely hidden on purpose during a redesign but left in the tree. Dead UI under a falsy gate.
- **Fix**: Delete the entire conditional `launch.githubUrl ? (…) : null` block in `NameTagline` (page.tsx:359-379). The `LaunchLinkIcons` column owns the GH link affordance — including the stars badge tooltip. Removes ~20 LOC of dead JSX.
- **Design call**: mechanical — straight deletion.

### 8. TabNav `aria-current="page"` but no `role="tab"` / `role="tablist"` — pick a model

- **File**: [page.tsx:544-571](../../../src/app/producthunt/page.tsx#L544)
- **Mechanical**: `<nav aria-label="ProductHunt tabs">` with `<Link>` children using `aria-current="page"`. Visually it's the same orange-underline tab strip as reddit-trending's `AllTrendingTabs` which uses `role="tablist"`. Different ARIA contracts for visually-identical patterns — same finding as huggingface audit #10. Each PH tab is a `?tab=ai` / `?tab=all` query-string variation of the SAME route, NOT a different route. That's an intra-page tab control by Next.js routing semantics, not a route nav. So unlike HF (where each tab is a real sub-route), here `role="tablist"` is the more honest match.
- **Fix**: Two options: (a) keep `<nav>` semantics (defensible — `aria-current="page"` works with `?tab=`); (b) switch to `role="tablist"` + `role="tab"` + `aria-selected`. Recommend (b): the URLs only differ in querystring, so screen readers should treat this as a tab control, not a navigation. Add `role="tablist"` to `<nav>` and `role="tab"` + `aria-selected={isActive}` on each `<Link>`. Drop `aria-current="page"` for `aria-selected`.
- **Design call**: design — needs the same project-wide tab-vs-nav rule HF #10 surfaced.

### 9. Cross-link panel anchor lacks `aria-label` — first link in a row is name-only

- **File**: [page.tsx:414-421](../../../src/app/producthunt/page.tsx#L414)
- **Mechanical**: `<a href={launch.url} target="_blank">{launch.name}</a>` opens an external PH page in a new tab. The repo `<Link>` next to it (L423) is internal and labeled by the fullName text. Screen readers announcing the launch-name link give no clue that it's external + opens PH; the row's `→` separator (L422) is presentational. The header row at L399 announces "CROSS-LINKED REPOS (n)" but the per-row destination is ambiguous.
- **Fix**: Add `aria-label={`${launch.name} on ProductHunt`}` to the launch link (matching the pattern already used by `ThumbLink` at page.tsx:316). Optional: append `title={launch.tagline}` to surface the one-liner on hover.
- **Design call**: mechanical — one prop.

### 10. Mobile layout drops the thumbnail entirely — recognition cost spikes on 375px

- **File**: [page.tsx:274-295](../../../src/app/producthunt/page.tsx#L274) (mobile grid `[32px_1fr_60px_70px]`)
- **Mechanical**: Mobile hides the 40px logo column ("hides thumbnail + comments per spec" — comment at L273). The 7d list on /producthunt is a launch directory; without a logo on mobile, every row reads as text-only `#N · Name · tag tag · ▲500 · 3d`. PH launches are unusually logo-driven (products carry brand marks designed for the PH grid). Recognition density on mobile is significantly worse than desktop. Audit brief asks for "launch cards + maker bubbles" — neither is present in either layout. Tap target on the rank-number column is also 32px (below 44px spec).
- **Fix**: Two-part. (a) Re-add the 32px logo as the second column on mobile: grid `[24px_32px_1fr_56px_60px]`. The thumbnail anchors recognition without bloating the row. (b) Wrap the row body in a `min-h-[44px]` link region so the touch target reaches the spec floor — currently rows are clickable via `<NameTagline>` only, with the rest of the row being whitespace.
- **Design call**: design — small layout shift, lifts recognition + a11y together.

### 11. Maker avatars never render — info-density gap vs. brief

- **Files**: [page.tsx:128-134](../../../src/app/producthunt/page.tsx#L128) (makerSet counted), data shape at [producthunt.ts:35-40](../../../src/lib/producthunt.ts#L35)
- **Mechanical**: Audit brief calls out "launch cards + maker bubbles + upvote counts". The MAKERS KPI counts unique shippers (good) but no row surfaces the maker face/handle. The `Launch.makers` payload carries `name`, `username`, `twitterUsername`, `websiteUrl` — enough to render 1-3 stacked initial chips per row. Currently a launch with one well-known maker (e.g. @rauchg) shipping reads identically to a stealth solo launch. Misses one of the strongest PH-native signals.
- **Fix**: Add a 60-72px column between LINKS and VOTES on desktop: render up to 3 stacked monogram bubbles (size-5 each, -ml-1 stack) using `EntityLogo` with `shape="circle"`. Tooltip = comma-joined maker names. Hide on mobile by default; promote to a single bubble row if mobile spec adds space. Pattern reuses `EntityLogo` (already imported at L10).
- **Design call**: design — net-new column, but matches the brief and is the highest-leverage information add. Lower priority than the P0s.

## P2 findings

### 12. KpiBand `pip: PH_RED` is a string literal but other cells use `var(--v4-*)` — type drift inside one band

- **File**: [page.tsx:155-183](../../../src/app/producthunt/page.tsx#L155)
- **Mechanical**: Cell 1 pip is `PH_RED` (hex literal), cells 2/3/4 pips are `var(--v4-acc) / var(--v4-money) / var(--v4-blue)`. KpiCell.pip accepts any CSS color, so neither is "wrong", but mixing string-literal hex with var-references in the same `cells` array makes the source style inconsistent. Folds into #3.
- **Fix**: After #3 lands, cell 1's pip becomes `"var(--source-producthunt)"` and the band is uniform.
- **Design call**: mechanical, gated on #3.

### 13. `formatRelative` doesn't pluralize and ages `1m ago` vs `1 minute ago` are mismatched with the clock

- **File**: [page.tsx:56-68](../../../src/app/producthunt/page.tsx#L56)
- **Mechanical**: Helper renders `1m ago` / `1h ago` / `1d ago` — fine. The page-level clock at L149 shows full HH:MM:SS UTC. So the user sees `13:47:22 · UTC · LATEST POST` (the full clock) next to a row reading `3d ago`. The full clock is more precise than every per-row label — visually, the loudest temporal element on the page (the big clock) is also the least informative for the actual feed.
- **Fix**: Drop the seconds from the clock — `HH:MM` is plenty since the underlying data is 7d-rolling. `formatClock` becomes `slice(11, 16)`. Bigger fix: once #2 lands, the clock can shrink one tier and the FreshnessBadge takes the visual anchor — clock becomes secondary metadata.
- **Design call**: design — small hierarchy correction.

### 14. Cold-state + Empty-state use inline `style={{ border: "1px dashed var(--v4-line-100)", borderRadius: 2 }}` — token-correct but inline vs the rest of the page using Tailwind utilities

- **Files**: [page.tsx:452-485](../../../src/app/producthunt/page.tsx#L452) (ColdState), [487-518](../../../src/app/producthunt/page.tsx#L487) (EmptyState)
- **Mechanical**: Both functions render a `<section>` with inline styles (radius 2, dashed border, bg, padding). The same shape elsewhere uses `border border-border-primary rounded-md bg-bg-secondary`. Inline styles are token-correct here but the mixed-paradigm makes maintenance worse — Tailwind sweep can't catch token changes inside inline `style` blobs.
- **Fix**: Convert both `<section>` wrappers to Tailwind classes: `className="p-8 bg-bg-secondary border border-dashed border-border-primary rounded-sm"` (rounded-sm = 2px per project rule). Keep the inline color on the H2 heading (PH brand orange, via #3 token).
- **Design call**: mechanical — class swap.

### 15. Cold-state H2 is uppercase + 18px + letter-spacing 0.18em in brand orange — louder than the H1 it sits below

- **Files**: [page.tsx:463-471](../../../src/app/producthunt/page.tsx#L463), [502-509](../../../src/app/producthunt/page.tsx#L502)
- **Mechanical**: Same hierarchy inversion HF audit #18 called out. H1 is sans 30px weight 500 ink-000 (PageHead). Cold-state H2 is mono 18px weight 700 uppercase letter-spaced 0.18em in PH orange. On a cold day the empty state shouts louder than the page title.
- **Fix**: Drop the brand-orange color on the cold-state heading; keep mono but in `var(--v4-ink-300)` at weight 600 / 14px. Same fix applies to EmptyState. Pairs with #14 class sweep.
- **Design call**: design — small hierarchy correction.

### 16. `tags` chip uses `bg-brand/15 text-brand` — uses the GLOBAL brand (Liquid Lava orange), not the PH source color

- **File**: [page.tsx:347-353](../../../src/app/producthunt/page.tsx#L347)
- **Mechanical**: Tag chips on rows render in `bg-brand/15 text-brand`. `--brand` is the global Liquid Lava orange (oklch ~0.7 0.18 28). PH's `--source-producthunt` is `#da552f` (oklch 0.619 0.175 36.4). They're close enough that the visual is "orange-on-orange-on-orange" but they're TWO different oranges per the design system. On the PH page the tag chip should sit in the SOURCE color so it pairs with the rank tint + hot-vote tint + tab underline, not the global brand.
- **Fix**: After #3, swap chip classes to inline style: `style={{ background: "color-mix(in oklab, var(--source-producthunt) 15%, transparent)", color: "var(--source-producthunt)" }}`. Or add a utility class. Either way, decouple from `--brand`.
- **Design call**: design — color-key honesty.

### 17. Empty-state `tab === "ai"` copy promises tab switch but no inline CTA

- **File**: [page.tsx:488-491](../../../src/app/producthunt/page.tsx#L488)
- **Mechanical**: `"The ProductHunt scrape completed, but no launches matched the AI-adjacent 7-day filter. Try the All Launches tab for the full PH feed."` — copy invites the user to click "the All Launches tab" but no anchor is rendered. User has to scroll back up to find the strip. Friction.
- **Fix**: Add a `<Link href="/producthunt?tab=all" className="v2-btn v2-btn-ghost mt-3 inline-flex">Show all launches →</Link>` below the body paragraph. Mirrors the error-boundary CTA pattern at error.tsx:64.
- **Design call**: design — small affordance add.

### 18. Hover transition omits `duration` — defaults to browser ~150ms, motion spec is 120-180ms

- **Files**: [page.tsx:241, 274, 342, 364, 411, 418, 425, 556](../../../src/app/producthunt/page.tsx#L241) — all `transition-colors` without `duration-*`
- **Mechanical**: Tailwind `transition-colors` defaults to 150ms via `transition-duration: 150ms`. Project tokens are `--motion-duration-fast: 120ms` and `--motion-duration-base: 180ms` (globals.css:346-347). Implicit 150ms is within range but not on the token grid.
- **Fix**: Add `duration-150` (closest Tailwind preset) or extend the Tailwind config to expose `duration-fast` (120ms) / `duration-base` (180ms) custom keys. Recommend `duration-150` everywhere for K2-simplicity — single global pass.
- **Design call**: mechanical.

## What's working well (reference patterns to propagate)

1. **`EntityLogo` fallback for blocked PH thumbnails** ([page.tsx:304-326](../../../src/app/producthunt/page.tsx#L304)) — switched from `next/image` after CORB/`ERR_BLOCKED_BY_ORB` errors. Inline comment documents the prior incident. Pattern other pages should adopt for third-party CDNs.
2. **`cold` separation from "empty data"** ([producthunt.ts:81-83](../../../src/lib/producthunt.ts#L81)) — `producthuntCold` only fires when the scraper NEVER ran, NOT on empty days. Inline comment explicitly notes the prior conflation and the fix. Honest cold contract.
3. **Per-tab counts in the strip** ([page.tsx:190](../../../src/app/producthunt/page.tsx#L190)) — `<TabNav active={activeTab} aiCount={ai7d.length} allCount={all7d.length} />` shows both counts even on the inactive tab. User sees "AI 12 · All 47" without switching. Great info-density move.
4. **`ChevronUp` for upvotes** ([page.tsx:261, 289, 434](../../../src/app/producthunt/page.tsx#L261)) — single-glance signal that this is a vote count, not a generic number. Aligns with PH's native ▲ affordance without resorting to the literal `▲` Unicode glyph used in the orphaned `RecentLaunches`. Better typography hygiene.
5. **CrossLinkedRepos drops the panel entirely when zero matches** ([page.tsx:389-395](../../../src/app/producthunt/page.tsx#L389)) — no orphan "empty box" on quiet days. Pattern matches HF cold-state graceful degrade.
6. **ISR `revalidate = 600`** ([page.tsx:44](../../../src/app/producthunt/page.tsx#L44)) — 10-min cache aligns with the audit brief's data-store rules; tab-query variants get separate ISR keys per the comment at L42.
7. **No `bg-black` violations** — the page uses `home-surface` + `bg-bg-secondary` everywhere; no opaque blacks.
8. **No card shadows** — table + cross-link sections use `border + rounded-md` only. Compliant with the no-shadow rule.

## Verify-in-context

- **PH cron cadence**: `PRODUCTHUNT_STALE_THRESHOLD_MS = 16h`, `PRODUCTHUNT_DEGRADED_THRESHOLD_MS = 8h` (source-health.ts:53,59). Means the FreshnessBadge in #1 will read GREEN for the first 8h post-scrape, AMBER 8-16h, RED past 16h — matching the cadence the `FRESH · 4H` literal was trying (and failing) to approximate.
- **`oldestRecordAt` stamping for PH**: `Launch` shape carries `createdAt` (post timestamp) but no `lastRefreshedAt` per-record. `findOldestRecordAt` in freshness.ts walks for `lastRefreshedAt` keys — passing PH's payload would return null. Skip the optional arg until the scraper adds the stamp (or thread `lastFetchedAt` as the single source of truth, which is acceptable for a slow-cron source).
- **`force-static` vs `revalidate`**: Page exports `revalidate = 600` only; no `dynamic = "force-static"`. Next.js infers static + ISR. Acceptable for the current data shape. No drift.
- **MarkVisited routeKey**: Not present on this page (unlike `/huggingface/*`). If sidebar fresh-count is supposed to flag PH new-data, the marker is missing. Out-of-scope for visual audit; worth a follow-up.
- **rounded-md vs rounded-sm**: Page mixes `rounded-md` (table containers, ~6px) with the project rule "Card radii 2px". Quick scan: `rounded-md` appears at L213, L398. The project rule says **card** radii are 2px — the section wrappers may legitimately be cards. Recommend a separate ADR call on "what's a card vs. a panel"; for now flag as P3.
