# Impeccable design audit — `/bluesky/trending`

**Surface**: `/bluesky/trending` (no separate `/bluesky` landing exists — directory only contains `trending/`).
**Date**: 2026-05-13 · **Worktree**: `wave11a` · **Branch**: `audit/imp-wave-11a-audits`
**Headline**: Two P0 honest-chrome violations. Hardcoded green-pulse `LIVE · 24H` ignores `fetchedAt` on a surface the OPERATOR doc flags as degradation-prone, and the COLD fallback strips the freshness chrome entirely instead of rendering an honest `COLD` badge. Brand token drift (`#0085FF` instead of `--source-bluesky: #3aa4ff`) on 6 inline-style sites. Mobile tap targets on inline `↳ repo` pill below 44 px.

---

## P0 — Ship-stopping

### P0-1 · Hardcoded green-pulse LIVE label ignores freshness signal
- [`src/app/bluesky/trending/page.tsx:114-120`](../../../src/app/bluesky/trending/page.tsx) — `<LiveDot label="LIVE · 24H" />` defaults to `money` tone → pulsing green ([`LiveDot.tsx:29`](../../../src/components/ui/LiveDot.tsx), [`v4.css:103-107`](../../../src/components/ui/v4.css)). Pulse fires on every render regardless of `trendingFile.fetchedAt` age.
- **Why P0**: violates `feedback_freshness_chrome_must_be_honest.md`. OPERATOR note: bluesky scraper has prior cron drift; rendering green-pulse on stale data is the exact failure mode the memory warns about.
- **Fix**: replace with `<FreshnessBadge lastUpdatedAt={trendingFile.fetchedAt} source="bluesky" />` ([`FreshnessBadge.tsx:28`](../../../src/components/shared/FreshnessBadge.tsx)). The `bluesky` NewsSource is already wired in `SOURCE_STALE_MS` ([`src/lib/news/freshness.ts:45`](../../../src/lib/news/freshness.ts)).
- **Call**: **Mechanical** — drop-in primitive swap.

### P0-2 · Cold-state strips all freshness chrome
- [`src/app/bluesky/trending/page.tsx:79-94`](../../../src/app/bluesky/trending/page.tsx) — when `blueskyCold || allPosts.length === 0`, the `SourceFeedTemplate` renders with no `clock` slot at all. User sees title + lede + `ColdState` panel but no badge telling them this is COLD with age.
- **Why P0**: cold is exactly when honest chrome matters most. Currently the page reads "warming/no data" copy without surfacing the actual `getBlueskyFetchedAt()` ISO that distinguishes "never scraped" (epoch-zero) from "scraped 14 days ago".
- **Fix**: pass `clock={<FreshnessBadge lastUpdatedAt={getBlueskyFetchedAt()} source="bluesky" />}` to the cold branch's `SourceFeedTemplate`. Badge renders `COLD · <age>` via [`FreshnessBadge.tsx:22-26`](../../../src/components/shared/FreshnessBadge.tsx).
- **Call**: **Mechanical**.

---

## P1 — Significant

### P1-1 · Brand color drift: `#0085FF` vs canonical `--source-bluesky: #3aa4ff`
- [`src/app/bluesky/trending/page.tsx:50`](../../../src/app/bluesky/trending/page.tsx) — `const BSKY_BLUE = "#0085FF"` (Bluesky's old hex). Project tokens declare `--source-bluesky: #3aa4ff` ([`src/app/globals.css:184`](../../../src/app/globals.css)) and `--v4-src-bsky: #3aa4ff` ([`src/app/globals.css:6230`](../../../src/app/globals.css)). The KpiBand correctly references `var(--v4-src-bsky)` (line 128) but the inline rank, topic-chip, like-threshold, and ColdState header all use the local const → side-by-side rendering mismatches the brand pip in the KPI cell.
- **Used at**: page.tsx lines 200, 287, 288, 289, 316, 375, 398. Six divergent surfaces.
- **Fix**: delete `BSKY_BLUE`, swap to `"var(--v4-src-bsky)"` (or `"var(--source-bluesky)"`).
- **Call**: **Mechanical**.

### P1-2 · Inline `↳ repo` pill below 44 × 44 mobile tap target
- [`src/app/bluesky/trending/page.tsx:253-266`](../../../src/app/bluesky/trending/page.tsx) — anchor `px-1.5 py-0.5 text-[10px]` ≈ 26 × 18 px hit area. Mobile thumbs miss it; sits inline beside a longer post anchor with overlapping target zones.
- **Fix**: bump padding to `px-2 py-1.5` and add `min-h-[28px]` minimum; or hoist into row-wide context-menu pattern.
- **Call**: **Design** — touches density vs. tap-target tradeoff.

### P1-3 · `ColdState` shipping-code reveal leaks dev-only copy to prod
- [`src/app/bluesky/trending/page.tsx:407-416`](../../../src/app/bluesky/trending/page.tsx) — ColdState tells the visitor to "Run `npm run scrape:bsky` locally". This is an internal runbook leak on a public route. Users see a 6-line shell instruction.
- **Fix**: rephrase to user-facing copy ("Feed warming. Refresh shortly.") and route the runbook to an admin-only surface.
- **Call**: **Design**.

---

## P2 — Polish

### P2-1 · WindowedFeedTable lacks `tabpanel` semantics
- [`src/components/feed/WindowedFeedTable.tsx:140-166`](../../../src/components/feed/WindowedFeedTable.tsx) — `role="tablist"` + `role="tab"` + `aria-selected` but no `role="tabpanel"` wrapper around `{table}` and no `aria-labelledby` linkage. Screen readers announce tabs but not what they control.
- **Fix**: wrap `{table}` in `<div role="tabpanel" id="win-{win}" aria-labelledby="tab-{win}">` and give each tab `id="tab-{win}"`.
- **Call**: **Mechanical**.

### P2-2 · Tab strip uses `.tab.on` CSS class for active state but no keyboard arrow rotation
- [`src/components/feed/WindowedFeedTable.tsx:148-159`](../../../src/components/feed/WindowedFeedTable.tsx) — buttons rely on tab key only; APG tablist pattern wants Left/Right arrows. Missing `onKeyDown` handler + `tabIndex={isActive ? 0 : -1}` rotation.
- **Call**: **Mechanical**.

### P2-3 · Stagger animation duration 350 ms > 120–180 ms motion budget
- [`src/components/feed/TerminalFeedTable.tsx:156`](../../../src/components/feed/TerminalFeedTable.tsx) — `slide-up 0.35s cubic-bezier(0.2,0.8,0.2,1)` applied to up to 6 rows × 50 ms stagger = 600 ms total intro on a feed page. Non-bouncy curve so not jarring, but blows the token.
- **Fix**: shorten to 0.16s; keep curve.
- **Call**: **Design** — shared component, ripples to 5+ other source feeds.

### P2-4 · Clock slot stacks UTC time + "SCRAPED" + LiveDot without single hierarchy
- [`src/app/bluesky/trending/page.tsx:114-120`](../../../src/app/bluesky/trending/page.tsx) — three fragments compete: big HH:MM:SS, muted "UTC · SCRAPED", green LiveDot. After honest-chrome fix lands, simplify to: `<FreshnessBadge … />` only. Removes 3 visual elements for 1.
- **Call**: **Design**.

### P2-5 · KPI cell `TOPICS` value = matched query family count without anchor
- [`src/app/bluesky/trending/page.tsx:138-143`](../../../src/app/bluesky/trending/page.tsx) — number floats without sub-context ("matched query families" sub only). Pair with chip preview ("agents · LLMs · MCP · …") so "what's trending" answers in <3 s.
- **Call**: **Design**.

---

## P3 — Nice-to-have

### P3-1 · `EntityLogo` 20 px + 13 px snippet creates 20-px hit zone on logo
- [`src/app/bluesky/trending/page.tsx:218-228`](../../../src/app/bluesky/trending/page.tsx) — logo isn't a link, but sits inside row alongside the anchored snippet; users tap the logo expecting a deep link. Consider wrapping `<a>` around the whole flex container.
- **Call**: **Design**.

### P3-2 · Topic chip uses `${BSKY_BLUE}4D` (30 % alpha) border on dim chip background
- [`src/app/bluesky/trending/page.tsx:284-301`](../../../src/app/bluesky/trending/page.tsx) — once brand color flips to `#3aa4ff` (P1-1), retest contrast; chip text on `${BSKY_BLUE}0D` background may dip below 3:1.
- **Call**: **Design**.

### P3-3 · `metadata.alternates.canonical` set to `/bluesky/trending`
- [`src/app/bluesky/trending/page.tsx:36`](../../../src/app/bluesky/trending/page.tsx) — correct now, but there's no `/bluesky` landing; if you add one later, canonical needs to reflect.
- **Call**: **N/A** noted.

---

## Surprises

1. **`export const dynamic = "force-static"`** ([line 30](../../../src/app/bluesky/trending/page.tsx)) on a "live"-labelled feed. Static = no re-render; the green pulse is **architecturally** lying — the page is cached for ISR, so "LIVE · 24H" is the build-time fetch. P0-1 is even worse than first read.
2. **`blueskyCold` is module-init**, not request-time ([`bluesky.ts:164`](../../../src/lib/bluesky.ts)). The runtime path calls `isBlueskyCold()` (line 172) but the page reads the static export. Cold-state may render after the first refresh succeeds, until next deploy.
3. **OPERATOR.md lists this route as GREEN** ([`docs/OPERATOR.md:325`](../../OPERATOR.md)) — contradicts the prompt's "currently degraded" framing. The honest-chrome P0s stand regardless: green-pulse on static output is dishonest by construction.
4. No `bg-black`, card radii are 2 px throughout, no card shadows — those constraints already met.
5. The page never imports `FreshnessBadge` despite the lib being available and `bluesky` already in `NewsSource` enum.

---

## Summary

| Severity | Count | Themes |
|---|---|---|
| P0 | 2 | Honest chrome (LIVE pulse hardcoded; cold-state strips chrome) |
| P1 | 3 | Brand drift, mobile tap target, internal copy leak |
| P2 | 5 | A11y tabs, motion budget, KPI density |
| P3 | 3 | Polish, contrast retest, canonical |
| **Total** | **13** | — |

Mechanical : Design = **6 : 7**. The two P0s are both mechanical drop-ins that can land in one commit using primitives already in the codebase.
