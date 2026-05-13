# /twitter audit — 2026-05-13

## Files audited
- [src/app/twitter/page.tsx](../../../src/app/twitter/page.tsx)
- [src/app/twitter/TwitterTabSwitcher.tsx](../../../src/app/twitter/TwitterTabSwitcher.tsx)
- [src/app/twitter/loading.tsx](../../../src/app/twitter/loading.tsx)
- [src/app/twitter/error.tsx](../../../src/app/twitter/error.tsx)
- [src/components/twitter/TwitterMentionBadge.tsx](../../../src/components/twitter/TwitterMentionBadge.tsx)
- [src/components/twitter/TwitterSignalPanel.tsx](../../../src/components/twitter/TwitterSignalPanel.tsx) (lives under /twitter but consumed by `/repo/[owner]/[name]`)
- [src/components/twitter/XSignalBadge.tsx](../../../src/components/twitter/XSignalBadge.tsx)
- [src/components/templates/SourceFeedTemplate.tsx](../../../src/components/templates/SourceFeedTemplate.tsx) (consumed)
- [src/components/ui/PageHead.tsx](../../../src/components/ui/PageHead.tsx) (consumed)
- [src/components/ui/KpiBand.tsx](../../../src/components/ui/KpiBand.tsx) (consumed)
- [src/components/ui/InventoryBand.tsx](../../../src/components/ui/InventoryBand.tsx) (consumed)
- [src/components/shared/FreshnessBadge.tsx](../../../src/components/shared/FreshnessBadge.tsx) (consumed)
- [src/lib/news/freshness.ts](../../../src/lib/news/freshness.ts) (threshold source)
- [src/app/globals.css#L5691-5697](../../../src/app/globals.css) (`.v2-live-dot` definition)

## P0 findings (dishonest / broken / a11y blocker)

- **Hardcoded `v2-live-dot` green pulse on the X signal panel** — [TwitterSignalPanel.tsx:38](../../../src/components/twitter/TwitterSignalPanel.tsx#L38). The terminal-bar renders `<span className="block h-1.5 w-1.5 rounded-full v2-live-dot" />` (CSS = `var(--v2-sig-green)` + 6px green glow, [globals.css:5691](../../../src/app/globals.css#L5691)) regardless of `panel.summary.lastScannedAt`. The next slot at line 58 honestly reports `REFRESHED {getRelativeTime(...)}`, so the green pulse is permanently green while the timestamp says "4 hours ago". This is the exact `feedback_freshness_chrome_must_be_honest` defect cleaned out of `/`, `/signals`, `/funding` in waves 3a/3b/3c. Component renders only on `/repo/[owner]/[name]`, but it lives on the /twitter audit perimeter and is owned by this surface. Fix: drop the `v2-live-dot` class and let the `REFRESHED …` slot encode age — or swap that header slot for `<FreshnessBadge source="twitter" lastUpdatedAt={panel.summary.lastScannedAt} />`. **Mechanical.**
- **`"warming"` masquerades as a UTC clock** — [page.tsx:67, 330, 390](../../../src/app/twitter/page.tsx#L67). When `stats.lastScannedAt` is null/missing, `formatClock` returns the string `"warming"` and is rendered in the `.big` slot of the PageHead clock column under a `UTC · SCRAPED` muted line. The visible read is `warming · UTC · SCRAPED` — operator-friendly debug copy that reads "data is about to land" when reality is the source is OFFLINE or the bucket was never populated. Identical pattern to wave-3c funding-audit P0 #2. Fix: render `"—"` or `"OFFLINE"` and let `<FreshnessBadge>` own the COLD verdict. **Mechanical.**

## P1 findings (visible regression)

- **Tab `<button>` 40px min-height — sub-44 tap target** — [TwitterTabSwitcher.tsx:46-48](../../../src/app/twitter/TwitterTabSwitcher.tsx#L46) `min-h-[40px]`. WCAG 2.5.5 + project mobile rule require 44×44. Fix: bump `min-h-[40px]` → `min-h-[44px]` and add `align-items: center`. Same drift in the unused server-side `TwitterTabNav` at [page.tsx:275](../../../src/app/twitter/page.tsx#L275). **Mechanical.**
- **Tab `<button role>` and panel association missing** — [TwitterTabSwitcher.tsx:36-55](../../../src/app/twitter/TwitterTabSwitcher.tsx#L36). The `<nav aria-label="Twitter leaderboard tabs">` contains plain buttons with `aria-pressed` but no `role="tablist"` / `role="tab"` / `aria-controls`, and no surrounding `role="tabpanel"` / `aria-labelledby` around the rendered table. Screen readers can't tie selection to panel content. Same defect closed in wave-3d /skills audit. Fix: convert to `role="tab"` with `id`s + wrap `{activeTab === "global" ? globalTable : trendingTable}` in `<section role="tabpanel" aria-labelledby={selectedTabId}>`. **Mechanical.**
- **RepoActionLinks buttons are 24×24** — [page.tsx:131, 147, 159](../../../src/app/twitter/page.tsx#L131). `inline-flex h-6 w-6 items-center justify-center rounded-full` on the X / GitHub / website link triplet. Each row has three; on mobile they form a 96px-wide cluster of sub-44 tap targets sitting inside a 12.5em row. Fix: bump to `h-9 w-9` (36×36) at minimum, or to `h-11 w-11` (44×44) on touch viewports via `[@media(pointer:coarse)]`. **Mechanical.**
- **MentionAuthorBubbles 20×20 avatar links overlap (-ml-1.5)** — [page.tsx:204-206](../../../src/app/twitter/page.tsx#L204). Each `<Link>` is `h-5 w-5` with `-ml-1.5` overlap; the second through fifth bubbles have ~6px of independent click area before the next bubble eclipses them. Active tap targets are far below 44px. Fix: enlarge to `h-7 w-7` with `-ml-2` overlap, OR render the stack as a single button that opens the strongest author and downgrade the rest to decorative. **Design call** (mobile interaction pattern).
- **Cold-state lede leaks internal API endpoint to the public surface** — [page.tsx:670-674](../../../src/app/twitter/page.tsx#L670). `<code>/api/internal/signals/twitter/v1/ingest</code>` rendered to anyone hitting /twitter when the dataset is cold. Operator copy on a user-facing surface. Fix: replace with "Twitter scan is cold — fresh data lands every 3 hours." and gate the dev hint behind `process.env.NODE_ENV === "development"`. **Mechanical.**
- **`<MarkVisited routeKey="twitter">` references `stats.reposWithMentions` not row count** — [page.tsx:319, 378](../../../src/app/twitter/page.tsx#L319). In the cold branch the count is whatever the lifetime aggregate is, even though no rows render. Side-effect: the global "new since last visit" badge in the nav under-reads true freshness on /twitter. Fix: pass `rows.length` (the visible count) so the visit indicator reflects what the user actually saw. **Design call** (semantics of "visited" — operator confirms whether the marker tracks lifetime or surface-visible volume).
- **Row stagger animation ignores `prefers-reduced-motion`** — [page.tsx:529-531](../../../src/app/twitter/page.tsx#L529) `animation: slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both; animationDelay: stagger`. 200 rows × 50ms stagger capped at 6 = up to 300ms of staggered motion on initial paint with no reduced-motion guard. Fix: wrap the `animation` inline-style in a media-query class (`@media (prefers-reduced-motion: reduce) { .v2-row { animation: none !important; } }` already broadly applies if the row uses a class, but the inline style here overrides). Move the animation into a class so the reduce-motion rule applies. **Mechanical.**

## P2 findings (polish / drift)

- **Author-bubble tones are 5 hardcoded RGBA palettes — drift from OKLCH tokens** — [page.tsx:70-96](../../../src/app/twitter/page.tsx#L70). Per DESIGN.md the production palette uses `--v3-*` / `--v4-*` tokens. These hash-keyed tones bypass the token system and the runtime accent picker — switching accent from Lava to Cyan won't ripple into the author bubbles. Fix: source the 5 tones from `var(--v4-src-x)`, `var(--v4-money)`, `var(--v4-magenta)`, `var(--v4-amber)`, `var(--v4-violet)` (or commit the 5 palette tones as new tokens). **Design call.**
- **KPI pip colors mix source vs accent vs money vs blue** — [page.tsx:409, 416, 422, 429](../../../src/app/twitter/page.tsx#L409). TWEETS pip = `--v4-src-x` (X blue), TOP LIKES pip = `--v4-acc` (Liquid Lava), KOLS pip = `--v4-money` (green), FRESH NOW pip = `--v4-blue`. Functional sense (source / activity / unique / freshness) is plausible, but the FRESH NOW pip is `--v4-blue` not `--v4-money` — green is the freshness semantic everywhere else (FreshnessBadge `live`, InventoryBand `fresh`). Fix: FRESH NOW pip → `--v4-money` for consistency. **Design call.**
- **Mobile compact summary uses `|` separator without `aria-hidden`** — [page.tsx:586-590](../../../src/app/twitter/page.tsx#L586). The `<span className="md:hidden">…likes | rts | score</span>` row reads to a screen reader as "X likes pipe Y rts pipe Z score". Mostly aesthetic — pipes are usually ignored by SR — but worth swapping for `·` to match the rest of the surface, or wrapping pipes in `<span aria-hidden>`. **Mechanical.**
- **`badgeState === "x_fire"` hardcoded RGBA fills** — [page.tsx:508-510](../../../src/app/twitter/page.tsx#L508). `rgba(245, 110, 15, 0.4)` / `rgba(245, 110, 15, 0.1)` are inlined; if the accent picker switches from Lava to Cyan, the X-FIRE badge stays orange. Fix: `color-mix(in oklab, var(--v4-acc) 40%, transparent)` derivations. **Mechanical.**
- **Row hover lacks focus-visible state** — [page.tsx:524, globals.css:4382](../../../src/app/twitter/page.tsx#L524). `.v2-row:hover` sets background but no `:focus-within` for the row when keyboard-tabbing through the repo link or action chips. Keyboard users can't see which row contains the focused element. Fix: add `.v2-row:focus-within { background: var(--bg-050); }`. **Mechanical.**

## What's working well

- **FreshnessBadge wired correctly in both branches** — [page.tsx:337-340, 396-399](../../../src/app/twitter/page.tsx#L337). The comment block at 332-336 explicitly documents the prior LiveDot defect and why FreshnessBadge replaced it — exactly the honest-chrome contract.
- **`buildTwitterInventoryStats` closes the "23 of 6,000" gap** — [page.tsx:362-374, InventoryBand.tsx:145-178](../../../src/app/twitter/page.tsx#L362). Tweets observed / Repos with buzz / Fresh now / Stale tiles make the collected-vs-rendered delta legible.
- **Cold-state branch is real** — [page.tsx:314-346](../../../src/app/twitter/page.tsx#L314). No "fake empty grid" pattern; the surface actually swaps to a `// no X findings yet` block with the badge attached.
- **Initial-letter fallback behind the avatar img** — [page.tsx:212-228](../../../src/app/twitter/page.tsx#L212). Comment explains the rationale (unavatar.io 429); robust against image failures.
- **`export const dynamic = "force-static"` + 5-min ISR** — [page.tsx:41-42](../../../src/app/twitter/page.tsx#L41). Matches the 3h scrape cadence with appropriate slack; not over-revalidated.
- **`aria-label` on every interactive Link** — RepoActionLinks (X, GitHub, website), MentionAuthorBubbles, repo title link all carry descriptive `aria-label`s.

## Verify-in-context

- The two P0 honest-chrome lies are cousins of the funding-audit / signals-audit / home-audit findings already closed in waves 3a–3c.
- 4 of 6 P1s are mechanical fixes touching ≤3 lines each.
- No mobile-reflow ENOENT issues at 375px — fixed-col grid math (244px + 32px padding = 276px) leaves ~100px for the 1fr column, tight but renders.

## Mechanical fixes ready to ship

1. **TwitterSignalPanel honest chrome** — drop `v2-live-dot` at [TwitterSignalPanel.tsx:38](../../../src/components/twitter/TwitterSignalPanel.tsx#L38), replace the terminal-bar timestamp slot with `<FreshnessBadge source="twitter" lastUpdatedAt={panel.summary.lastScannedAt} />`.
2. **`formatClock` cold path** — return `"OFFLINE"` instead of `"warming"` at [page.tsx:67](../../../src/app/twitter/page.tsx#L67).
3. **Tab tap targets** — `min-h-[40px]` → `min-h-[44px]` at [TwitterTabSwitcher.tsx:48](../../../src/app/twitter/TwitterTabSwitcher.tsx#L48) and [page.tsx:275](../../../src/app/twitter/page.tsx#L275).
4. **Tab a11y** — add `role="tab"` + `id` + `aria-controls`, wrap panels in `role="tabpanel"` / `aria-labelledby`.
5. **RepoActionLinks tap targets** — `h-6 w-6` → `h-9 w-9` (or `h-11 w-11` on coarse pointer) at [page.tsx:131, 147, 159](../../../src/app/twitter/page.tsx#L131).
6. **Cold lede copy** — replace `<code>/api/internal/signals/twitter/v1/ingest</code>` with operator-neutral copy at [page.tsx:670-674](../../../src/app/twitter/page.tsx#L670).
7. **Row reduce-motion** — promote inline `animation:` to a class so the global reduced-motion rule applies.
8. **KPI FRESH NOW pip** — `--v4-blue` → `--v4-money` at [page.tsx:429](../../../src/app/twitter/page.tsx#L429).
9. **X_FIRE badge token mapping** — swap inline `rgba(245, 110, 15, …)` to `color-mix(in oklab, var(--v4-acc) …, transparent)` at [page.tsx:508-510](../../../src/app/twitter/page.tsx#L508).
10. **Row focus-visible** — add `.v2-row:focus-within { background: var(--bg-050); }` at [globals.css:4411](../../../src/app/globals.css#L4411).

## Quick-fix patches (optional)

### P0 #1 — TwitterSignalPanel honest chrome

Before ([TwitterSignalPanel.tsx:37-60](../../../src/components/twitter/TwitterSignalPanel.tsx#L37)):
```tsx
<span aria-hidden className="flex items-center gap-1.5">
  <span className="block h-1.5 w-1.5 rounded-full v2-live-dot" />
  ...
</span>
<span className="flex-1 truncate" style={{ color: "var(--v2-ink-200)" }}>
  {"// X · SIGNAL · 24H"}
</span>
<span className="v2-stat shrink-0" style={{ color: "var(--v2-ink-300)" }}>
  REFRESHED {getRelativeTime(panel.summary.lastScannedAt).toUpperCase()}
</span>
```

After:
```tsx
<span aria-hidden className="flex items-center gap-1.5">
  <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-line-200)" }} />
  ... // two more neutral dots
</span>
<span className="flex-1 truncate" style={{ color: "var(--v2-ink-200)" }}>
  {"// X · SIGNAL · 24H"}
</span>
<FreshnessBadge source="twitter" lastUpdatedAt={panel.summary.lastScannedAt} />
```

### P0 #2 — formatClock cold path

Before ([page.tsx:65-68](../../../src/app/twitter/page.tsx#L65)):
```tsx
function formatClock(iso: string | undefined | null): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}
```

After:
```tsx
function formatClock(iso: string | undefined | null): string {
  if (!iso) return "OFFLINE";
  return new Date(iso).toISOString().slice(11, 19);
}
```

### P1 #1 — tab tap targets

Before ([TwitterTabSwitcher.tsx:48](../../../src/app/twitter/TwitterTabSwitcher.tsx#L48)):
```tsx
className="v2-mono inline-flex min-h-[40px] shrink-0 items-center gap-2 px-3 ..."
```

After:
```tsx
className="v2-mono inline-flex min-h-[44px] shrink-0 items-center gap-2 px-3 ..."
```
