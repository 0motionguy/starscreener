# Impeccable design audit — `/arxiv/trending`

**Surface**: `/arxiv/trending` (no separate `/arxiv` landing — directory only contains `trending/`).
**Date**: 2026-05-13 · **Worktree**: `wave11a` · **Branch**: `audit/imp-wave-11a-audits`
**Counts**: P0 × 2 · P1 × 3 · P2 × 4 · P3 × 3

**Headline**: Two P0 honest-chrome violations. A hardcoded `<LiveDot label="FRESH · 3H" />` pulses green every render regardless of `file.fetchedAt`, on a feed whose cadence is daily-ish + scraped on a 3h cron — and the cold branch strips freshness chrome entirely. arXiv brand `#B22234` (Cornell crimson) collides visually with `--v4-red` (loss semantics) on rank numerals + momentum bar. NewsSource enum has no `arxiv` member, so `FreshnessBadge` cannot drop in without a one-line enum extension (mechanical).

---

## P0 — Ship-stopping

### P0-1 · Hardcoded green-pulse "FRESH · 3H" outside FreshnessBadge
- [`src/app/arxiv/trending/page.tsx:125`](../../../src/app/arxiv/trending/page.tsx#L125) — `<LiveDot label="FRESH · 3H" />` resolves to default `tone="money"` ([`LiveDot.tsx:29`](../../../src/components/ui/LiveDot.tsx#L29)) → `v4-live-dot--money` green pulse via `var(--v4-shadow-pulse-money)` at `var(--v4-duration-pulse)` ([`v4.css:100-107`](../../../src/components/ui/v4.css#L100-L107)). Pulse fires on every render with **zero coupling to `file.fetchedAt`**. arXiv enrichment is daily-ish; the scraper cron is 3h. Either way the label is a fixed string baked into JSX, not derived from `classifyFreshness()`.
- **Why P0**: direct violation of project rule (`feedback_freshness_chrome_must_be_honest.md`): "Never inline hardcoded `FRESH · 1H` / green-pulse `LiveDot`. Wire `lastUpdatedAt` to `FreshnessBadge` via `classifyFreshness()`."
- **Fix**: (a) Add `arxiv` to `NewsSource` + `SOURCE_STALE_MS` in [`src/lib/news/freshness.ts:18-28,42-59`](../../../src/lib/news/freshness.ts#L18-L59). Cadence guidance: arXiv scraper runs every 3h, so reuse `NPM_STALE_THRESHOLD_MS` (50h) for the slow-cron daily-ish profile, or define `ARXIV_STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000`. (b) Swap line 125 to `<FreshnessBadge lastUpdatedAt={file.fetchedAt} source="arxiv" />`.
- **Call**: **Mechanical** — one enum entry + one primitive swap.

### P0-2 · Cold-state strips all freshness chrome
- [`src/app/arxiv/trending/page.tsx:84-100`](../../../src/app/arxiv/trending/page.tsx#L84-L100) — when `cold` is true, the `SourceFeedTemplate` is rendered with no `clock` slot at all. User sees title + lede + the `ColdState` panel but no badge distinguishing "never scraped" from "scraped 14 days ago, source down".
- **Why P0**: cold is exactly when honest chrome matters most. `file.fetchedAt` is present even when `papers.length === 0` (only `count` is zero); the page is throwing away a signal that would tell the user whether to wait 30 minutes or contact an operator.
- **Fix**: pass `clock={<FreshnessBadge lastUpdatedAt={file.fetchedAt} source="arxiv" />}` to the cold branch's `SourceFeedTemplate`. After P0-1's enum patch this drops in.
- **Call**: **Mechanical**.

---

## P1 — Significant

### P1-1 · Brand red collides with `--v4-red` negative-delta semantics
- [`src/app/arxiv/trending/page.tsx:36`](../../../src/app/arxiv/trending/page.tsx#L36), [`:252`](../../../src/app/arxiv/trending/page.tsx#L252), [`:363`](../../../src/app/arxiv/trending/page.tsx#L363), [`:412`](../../../src/app/arxiv/trending/page.tsx#L412), [`:443`](../../../src/app/arxiv/trending/page.tsx#L443)
- `ARXIV_BRAND = "#B22234"` (Cornell crimson) is painted on: rank numerals 01–10, the momentum-bar fill + glow `boxShadow: 0 0 6px ${accent}66`, the ColdState H2 header, the enrichment banner `// HEADS-UP` prefix. The file header (lines 32-36) is honest about why — `--v4-red` is reserved for negative deltas — but the comment doesn't solve the perceptual collision: rank-1 crimson + a future drop arrow (`var(--v4-red)`) in the same row reads as the same signal.
- The code header explicitly anticipates this: "No `--v4-src-arxiv` token exists yet, so hardcode the brand color rather than fall back to the generic `--v4-red` (which is reserved for negative-delta semantics)." Verified absent in [`globals.css:6226-6233`](../../../src/app/globals.css#L6226-L6233) — only `hn / gh / x / reddit / bsky / dev / claude / openai` exist.
- **Fix**: Tokenize once: add `--v4-src-arxiv: #B22234` and `--v4-src-arxiv-glow: rgba(178, 34, 52, 0.4)` to [`src/components/ui/v4.css`](../../../src/components/ui/v4.css) (alongside the other `--v4-src-*` tokens). Replace the 5 inline `ARXIV_BRAND` references with `var(--v4-src-arxiv)`. Bonus: rank-2 through rank-10 demote to `var(--v4-ink-100)` so only rank-1 carries the brand mark — same hierarchy, half the red density.
- **Call**: **Design** (tokenization + density call).

### P1-2 · `defaultWindow="7d"` doesn't match the "trending today" reading
- [`src/app/arxiv/trending/page.tsx:195`](../../../src/app/arxiv/trending/page.tsx#L195) — `WindowedFeedTable defaultWindow="7d"`. The KpiBand surfaces `NEW THIS WEEK` (line 145) implying 7d is the headline window; that's fine for a weekly digest, but the page title says "trending" and the lede says "Domain-scored arXiv paper feed" — neither anchors to a window. A first-load reader sees 7d already implied by the KPI, and the tab strip is the only signal that 24h/30d even exist.
- **Fix**: Either (a) Move the active window into the URL via the opt-in `tableActive` + `activeWindow` mode already supported by [`WindowedFeedTable.tsx:64-93`](../../../src/components/feed/WindowedFeedTable.tsx#L64-L93) (page becomes dynamic, shareable links), or (b) Promote the active count to the KpiBand title (`PAPERS · 7D`) so the answer-in-3s question — "which papers are trending in this window?" — has a window labeled on the snapshot. Option (b) is the surgical fix.
- **Call**: **Design**.

### P1-3 · `ColdState` leaks operator runbook to public route
- [`src/app/arxiv/trending/page.tsx:452-458`](../../../src/app/arxiv/trending/page.tsx#L452-L458) — ColdState tells the visitor: "The arXiv scraper hasn't run yet. Run `npm run scrape:arxiv` locally to populate `data/arxiv-recent.json`, then refresh this page." This is a dev-only runbook on a public URL. Same pattern as the `/bluesky/trending` P1-3 audit finding.
- **Fix**: User-facing copy ("Feed warming. arXiv refreshes every 3h — check back shortly.") and move the runbook into the admin/ops surface.
- **Call**: **Design**.

---

## P2 — Polish

### P2-1 · `tab` buttons miss the 44×44 mobile target
- [`src/components/feed/WindowedFeedTable.tsx:148-159`](../../../src/components/feed/WindowedFeedTable.tsx#L148-L159) (legacy mode used by `/arxiv/trending`) — `<button className="tab">24h|7d|30d</button>` inherits `.tabs .tab` from [`globals.css:2305-2314`](../../../src/app/globals.css#L2305-L2314): `padding: 9px 14px` ≈ ~36–40 px tall depending on font metrics, ~52 px wide for "24h". Height ≤40 px — 4 px shy of the 44 × 44 rule at 375 px.
- **Fix**: Add `min-h: 44px` to `.tabs .tab` in globals.css (touches every feed table, not just arxiv) OR bump padding to `12px 14px`. The first is the right cross-feed fix.
- **Call**: **Mechanical**.

### P2-2 · Enrichment banner `border-radius: 2` correct, but lives on the wrong surface level
- [`src/app/arxiv/trending/page.tsx:204-220`](../../../src/app/arxiv/trending/page.tsx#L204-L220) — banner uses `background: var(--v4-bg-025)` + `border: 1px dashed var(--v4-line-200)`. It's the only chrome between the KpiBand and the feed table, so it ought to step UP from the snapshot row, not match it. Both KpiBand (template inheritance) and this banner land near `--v4-bg-025/050`; the user's eye has no surface-step cue saying "the table starts here". The 6-surface-level rule is meant to ladder; this collapses two.
- **Fix**: Bump banner background to `var(--v4-bg-075)` and keep the dashed border for the "advisory" semantic. Adds one of the missing 6 levels.
- **Call**: **Design**.

### P2-3 · Inline `↳ linked-repo` pill below 44 × 44 tap target & not a link
- [`src/app/arxiv/trending/page.tsx:296-309`](../../../src/app/arxiv/trending/page.tsx#L296-L309) — pill is `px-1.5 py-0.5 text-[9px]` ≈ ~24 × 18 px. It's also rendered as a `<span>` (not an anchor) even though the data exposes `linkedRepos[0].fullName`. A user who scans the feed for "paper linked to a repo" (the explicit success criterion of this audit) can SEE the pill but can't click it.
- **Fix**: Render as `<a href={`https://github.com/${linkedRepo}`} target="_blank" rel="noopener noreferrer">↳ {linkedRepo}</a>`, bump padding to `px-2 py-1.5` and add `min-h-[28px]` (touch target sits inside the row's clickable space, so 28 is the local minimum here, 44 is across the row).
- **Call**: **Design**.

### P2-4 · `loading.tsx` references stale `--v3-*` tokens
- [`src/app/arxiv/trending/loading.tsx:9-41`](../../../src/app/arxiv/trending/loading.tsx#L9-L41) — skeletons use `var(--v3-bg-050)` / `var(--v3-bg-100)`. Page lives in V4. Same defect as the `/npm` audit P2-4.
- **Fix**: Swap to `var(--v4-bg-050)` / `var(--v4-bg-075)`.
- **Call**: **Mechanical**.

---

## P3 — Nice-to-have

### P3-1 · `LiveDot` announces "FRESH · 3H" via `aria-live="polite"`
- [`src/components/ui/LiveDot.tsx:35`](../../../src/components/ui/LiveDot.tsx#L35), [`src/app/arxiv/trending/page.tsx:125`](../../../src/app/arxiv/trending/page.tsx#L125) — screen readers announce the literal string "FRESH · 3H" on page load regardless of actual freshness. Resolves automatically once P0-1 lands (FreshnessBadge announces verdict in `title`, not via `aria-live`).
- **Fix**: Falls out of P0-1.
- **Call**: **Mechanical**.

### P3-2 · `formatClock` returns `HH:MM:SS` for daily-cadence data
- [`src/app/arxiv/trending/page.tsx:72-75`](../../../src/app/arxiv/trending/page.tsx#L72-L75) — `.slice(11, 19)` renders seconds precision on a feed whose cadence is 3h. Implies live-tick freshness the data doesn't support. Identical defect to `/npm` audit P3-2.
- **Fix**: `.slice(11, 16)` → `HH:MM`.
- **Call**: **Design**.

### P3-3 · `EntityLogo size={20}` paired with hostname favicon at 32px request resolution
- [`src/app/arxiv/trending/page.tsx:236-237,272-278`](../../../src/app/arxiv/trending/page.tsx#L236-L278) — `paperFaviconUrl(p.absUrl, 32)` requests a 32 px favicon but `EntityLogo size={20}` renders it at 20 px. Wastes ~36% of the bytes per row × 100 rows. With reduced motion off, the staggered table entrance animation amplifies the visual cost.
- **Fix**: Pass `size={20}` to `paperFaviconUrl` to match render size; google s2 supports 16 px the most common arxiv.org case.
- **Call**: **Mechanical**.

---

## Out of scope but noted

- The `momentum` bar at [`page.tsx:393-424`](../../../src/app/arxiv/trending/page.tsx#L393-L424) renders a `boxShadow: 0 0 6px ${accent}66` halo on a fill bar — that's an effect not a card, so the "no card shadows" rule doesn't apply. Read it carefully if the rule is later expanded to "no shadows of any kind on V4 content surfaces"; currently scoped to cards.
- `error.tsx` references `var(--v2-sig-red)` + `var(--v2-ink-*)` tokens — same V2/V4 mix as the `/npm` audit's parallel finding. Tracked under the V4-token-sweep meta issue.
- Citation column header says `"Cits"` (line 341) but every value is 0 in the MVP — the enrichment banner already explains this. After enrichment lands the column will earn its keep; until then it could be hidden, but the explicit banner makes the trade legible. Keep.

---

## Verification checklist for the fix PR

- [ ] `arxiv` added to `NewsSource` + `SOURCE_STALE_MS` in `src/lib/news/freshness.ts`.
- [ ] `<LiveDot>` removed from `/arxiv/trending`; only `<FreshnessBadge source="arxiv">` carries freshness state.
- [ ] Cold branch renders the same `FreshnessBadge` in its `clock` slot.
- [ ] `--v4-src-arxiv` token added to `v4.css`; 5 inline `ARXIV_BRAND` references swapped.
- [ ] Linked-repo pill is an `<a>` to the GitHub repo, with `min-h-[28px]`.
- [ ] No `--v3-*` token reference remains under `src/app/arxiv/`.
- [ ] `.tabs .tab` has `min-h: 44px` at 375 px viewport (cross-feed fix).
