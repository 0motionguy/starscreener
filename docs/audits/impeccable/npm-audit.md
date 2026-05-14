# /npm — Impeccable design audit

**Surface:** `/npm` (V4 SourceFeedTemplate · daily-ish cadence · npm registry adoption)
**Branch:** `audit/imp-wave-11a-audits`
**Date:** 2026-05-13
**Counts:** P0 × 2 · P1 × 3 · P2 × 4 · P3 × 3

**Headline:** Page renders rich, repo-linked package velocity in a clean V4 shell — but pairs a green pulsing `<LiveDot label="LIVE · 24H">` with a 50h-stale-threshold scraper, then doubles `linkedRepoCount` across TRACKED and LINKED REPOS KpiBand cells. Honest chrome and KpiBand semantics need the most surgery; tap targets and surface levels trail behind.

---

## P0 — Ship-blockers

### P0-1 — Green pulsing "LIVE · 24H" beside `FreshnessBadge` (honest chrome)
- [`src/app/npm/page.tsx:159`](../../../src/app/npm/page.tsx#L159)
- npm scrape cadence is daily-ish; `NPM_STALE_THRESHOLD_MS` is 50h. The page emits `<LiveDot label={`LIVE · ${activeWindow.toUpperCase()}`} />` — that renders `v4-live-dot--money` with the green `var(--v4-shadow-pulse-money)` keyframe at `var(--v4-duration-pulse)`, beside the already-honest `<FreshnessBadge source="npm" .../>` on line 160. Two contradictory chrome signals next to each other; the louder one (green pulse) wins. Direct violation of the global "hardcoded LIVE/green-pulse outside `<FreshnessBadge>`" P0 rule.
- **Fix:** Delete the `<LiveDot>` line. `FreshnessBadge` already prints FRESH/STALE/COLD + age. If a window indicator is still wanted, render `<span className="v2-mono muted">{activeWindow.toUpperCase()}</span>` after the clock — no pulse, no "LIVE" claim.
- **Call:** Mechanical (one-line delete, no design tradeoff).

### P0-2 — Clock copy `"UTC · SCRAPED"` paired with the LIVE dot reads as live-tick
- [`src/app/npm/page.tsx:157-158`](../../../src/app/npm/page.tsx#L157-L158)
- `<span className="big">{formatClock(file.fetchedAt)}</span>` + `<span className="muted">UTC · SCRAPED</span>` is fine alone, but next to the green `LIVE` dot it implies the clock is ticking. It is not — `fetchedAt` is the scrape timestamp, frozen until the next cron sweep.
- **Fix:** After P0-1, swap the sub-label from `"UTC · SCRAPED"` to `"UTC · LAST SCRAPE"`. One word, removes the live-tick implication.
- **Call:** Mechanical.

---

## P1 — Significant defects

### P1-1 — npm brand red collides with negative-delta loss color
- [`src/app/npm/page.tsx:36`](../../../src/app/npm/page.tsx#L36), [`:256`](../../../src/app/npm/page.tsx#L256), [`:435`](../../../src/app/npm/page.tsx#L435), [`:441`](../../../src/app/npm/page.tsx#L441)
- `NPM_RED = "#cb3837"` paints rank-1 numbers, the active-tab underline, and the VersionPill border/text. Same row also paints negative deltas via `var(--v4-red)`. A user scanning column-3 sees two reds (rank brand vs loss signal) inside the same row at a glance — color is doing double duty.
- **Fix:** Either (a) demote rank numerals to `var(--v4-ink-100)` and let only the active-tab underline carry `NPM_RED`, or (b) tokenize once as `--v4-src-npm` in `v4.css` and reserve `var(--v4-red)` exclusively for negative deltas. Option (a) is the surgical fix.
- **Call:** Design.

### P1-2 — TRACKED and LINKED REPOS show identical value
- [`src/app/npm/page.tsx:167-187`](../../../src/app/npm/page.tsx#L167-L187)
- `linkedRepoCount` is rendered into both `TRACKED` (line 168) and `LINKED REPOS` (line 184). Two of four KpiBand cells display the same number with different labels — wastes a quarter of the snapshot. "what npm package is moving?" answer in <3s is muddier when a cell repeats.
- **Fix:** Replace `TRACKED` with `PACKAGES` and source it from `packages.length` (or `file.packages.length` if the file holds the full corpus). Keep `LINKED REPOS` as `linkedRepoCount`. Now TRACKED = corpus size, LINKED = the share with GitHub attached.
- **Call:** Design.

### P1-3 — VersionPill hardcodes `NPM_RED` alpha hex outside CSS tokens
- [`src/app/npm/page.tsx:488-491`](../../../src/app/npm/page.tsx#L488-L491)
- `border: 1px solid ${NPM_RED}4D` / `background: ${NPM_RED}0D` / `color: NPM_RED` — three hex string concatenations on inline style. Defeats theming and conflicts with the surface-level palette. Two of three are alpha-hex tricks (`4D` = 30%, `0D` = 5%) that don't compose with future CSS-var swaps.
- **Fix:** Add `--v4-src-npm` + `--v4-src-npm-30` + `--v4-src-npm-05` to `v4.css`. Replace the three inline hex strings with `var(--v4-src-npm-*)`.
- **Call:** Mechanical (light refactor).

---

## P2 — Polish

### P2-1 — Tab buttons miss the 44×44 mobile minimum
- [`src/app/npm/page.tsx:223`](../../../src/app/npm/page.tsx#L223)
- `inline-flex min-h-[40px] items-center gap-2 px-3` — 40px tall · ~88px wide. Width passes, height is 4px shy of the 44×44 rule.
- **Fix:** Bump to `min-h-[44px]`.
- **Call:** Mechanical.

### P2-2 — Fixed column widths crush Package cell at 375px
- [`src/app/npm/page.tsx:274,283,297,312,326,341`](../../../src/app/npm/page.tsx#L274-L341)
- Even after `hideBelow: "md"` / `"lg"` strips repo + 7d + 30d + version, at 375px the surviving columns are `rank 44 + active-mobile 100 = 144px` of fixed, leaving ~231px for Package (which renders 24px logo + 2.5 gap + name + truncated description). Tight but survivable; tested at 360px and description clips to ~14 chars.
- **Fix:** Reduce `active-mobile` to `width: "84px"` and trim the rank column to `width: "32px"`. Gives Package ~30px more breathing room without losing legibility.
- **Call:** Design.

### P2-3 — Surface levels: only 2 of 6 used
- [`src/app/npm/page.tsx:509`](../../../src/app/npm/page.tsx#L509), [`:160`](../../../src/app/npm/page.tsx#L160) (via FreshnessBadge), [`:213`](../../../src/app/npm/page.tsx#L213) (TabNav border only)
- Page references `--v4-bg-025` (ColdState) and `--v4-bg-050` (via FreshnessBadge). The KpiBand cells, table rows, and SourceFeedTemplate shell all inherit further levels from the template — but `/npm`-owned chrome stays at 2. The 6-level rule asks each surface to deliberately step.
- **Fix:** Adopt `--v4-bg-075` for the TabNav strip background (currently transparent), `--v4-bg-100` for the active-tab inset, leaving 025/050 for empty + freshness chrome. Adds two levels at zero functional cost.
- **Call:** Design.

### P2-4 — `loading.tsx` references stale `--v3-*` tokens
- [`src/app/npm/loading.tsx:9-41`](../../../src/app/npm/loading.tsx#L9-L41)
- Skeletons use `var(--v3-bg-050)` / `var(--v3-bg-100)`. Page lives in V4. If `--v3-*` ever gets removed, the skeleton renders transparent.
- **Fix:** Swap to `var(--v4-bg-050)` / `var(--v4-bg-075)`.
- **Call:** Mechanical.

---

## P3 — Nice-to-have

### P3-1 — `LiveDot` announces "LIVE · 24H" via `aria-live="polite"`
- [`src/components/ui/LiveDot.tsx:35`](../../../src/components/ui/LiveDot.tsx#L35), [`src/app/npm/page.tsx:159`](../../../src/app/npm/page.tsx#L159)
- Even sighted users get a misleading chrome; screen readers get the literal announcement "LIVE · 24H" on every page load. Resolved automatically once P0-1 lands.
- **Fix:** Falls out of P0-1.
- **Call:** Mechanical.

### P3-2 — `formatClock` returns the seconds-precision timestamp every render
- [`src/app/npm/page.tsx:85-88`](../../../src/app/npm/page.tsx#L85-L88)
- `.slice(11, 19)` renders `HH:MM:SS` — three digits past the cadence resolution (1 day). Implies precision the data doesn't support.
- **Fix:** `.slice(11, 16)` → `HH:MM`. Visual quiet; matches cadence honesty.
- **Call:** Design.

### P3-3 — `<EntityLogo size={24}>` next to 13px font is logo-heavy
- [`src/app/npm/page.tsx:365`](../../../src/app/npm/page.tsx#L365)
- 24px logo paired with 13px package name + 11px description. Logo takes the visual lead over the name on a feed whose answer is "which package is moving?". Standard feed-row pattern across the repo is 20px.
- **Fix:** `size={20}`. One token down, hierarchy reads cleaner.
- **Call:** Design.

---

## Out of scope but noted

- `error.tsx` mixes `var(--v2-sig-red)` / `var(--v2-ink-*)` with the surrounding V4 page. Tracked under the V4-token-sweep meta issue, not this audit.
- `NpmBadge.tsx` uses `var(--red)` + `rgba(255, 77, 77, 0.4)` — only rendered on repo cards elsewhere; not on the `/npm` page itself. Out of scope.

---

## Verification checklist for the fix PR

- [ ] `<LiveDot>` removed from `/npm`; only `<FreshnessBadge source="npm">` carries freshness state.
- [ ] KpiBand TRACKED and LINKED REPOS show distinct numbers.
- [ ] Tab nav: `min-h-[44px]` at 375px viewport.
- [ ] No `--v3-*` token reference remains under `src/app/npm/`.
- [ ] `rg "NPM_RED" src/app/npm/page.tsx` → only the active-tab underline reference (P1-1 option a).
