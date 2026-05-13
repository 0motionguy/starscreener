# Impeccable Design Audit — `/devto`

Branch: `audit/imp-wave-11a-audits` · Worktree: `wave11a` · Date: 2026-05-13

## Files audited

- [src/app/devto/page.tsx](../../../src/app/devto/page.tsx)
- [src/app/devto/loading.tsx](../../../src/app/devto/loading.tsx)
- [src/app/devto/error.tsx](../../../src/app/devto/error.tsx)
- [src/components/devto/DevtoBadge.tsx](../../../src/components/devto/DevtoBadge.tsx)
- Shared: [SourceFeedTemplate](../../../src/components/templates/SourceFeedTemplate.tsx), [KpiBand](../../../src/components/ui/KpiBand.tsx), [LiveDot](../../../src/components/ui/LiveDot.tsx), [FreshnessBadge](../../../src/components/shared/FreshnessBadge.tsx), [TerminalFeedTable](../../../src/components/feed/TerminalFeedTable.tsx), [WindowedFeedTable](../../../src/components/feed/WindowedFeedTable.tsx)

## Counts

| Sev | Count |
|---|---|
| P0 | 3 |
| P1 | 5 |
| P2 | 4 |

---

## P0 — must-fix before next ship

### P0-1 · Honest chrome: hardcoded `<LiveDot label="LIVE · 7D">` outside `<FreshnessBadge>`
**File:** [src/app/devto/page.tsx:141](../../../src/app/devto/page.tsx#L141)
**Finding:** `<LiveDot label={\`LIVE · ${trendingFile.windowDays}D\`} />` is rendered unconditionally in the PageHead clock slot. The default `tone="money"` triggers `v4-pulse` animation, so the page reads "FRESH" green even when `fetchedAt` is 4d old (the 24h tab already renders 0 rows and a "Last scrape Xh ago" empty-state hint, which is exactly the dishonest-chrome scenario the rule names). Three sister pages (`/agent-repos`, `/breakouts`, `/categories`) already route through `<FreshnessBadge source="..." lastUpdatedAt={...} />`.
**Fix:** Replace `<LiveDot …/>` with `<FreshnessBadge source="devto" lastUpdatedAt={trendingFile.fetchedAt} />`. `NewsSource` already includes `"devto"` and `SOURCE_STALE_MS.devto` = `DEVTO_STALE_THRESHOLD_MS`.
**Mechanical vs Design:** **Mechanical** — swap the import + the JSX expression.

### P0-2 · Brand-color drift: `DEVTO_BLUE = "#6699ff"` contradicts `--source-dev: #b08bff`
**File:** [src/app/devto/page.tsx:38](../../../src/app/devto/page.tsx#L38)
**Finding:** Page hardcodes blue `#6699ff` for the table accent (line 410) and rank top-10 (line 286), but the KPI band on the same page uses `var(--v4-src-dev)` purple (line 151), and `DevtoBadge.tsx` uses `var(--source-dev)` purple. Three colors claiming to be "dev.to" on a single route. Per DESIGN rule "dev.to brand purple/violet (`--source-dev: #b08bff`)". The side-tab/column-key signal becomes incoherent because top-10 ranks and table accent disagree with the per-source color-key everywhere else.
**Fix:** Delete `DEVTO_BLUE`. Use `var(--source-dev)` (or `var(--v4-src-dev)`) for `accent={…}` and the rank-color ternary. Keep KpiBand pip as-is — it's already correct.
**Mechanical vs Design:** **Mechanical** — one constant, two call sites.

### P0-3 · `DevtoBadge.DEVTO_BRAND_COLOR` exports `#0a0a0a` (black) as the "channel-dot" source of truth
**File:** [src/components/devto/DevtoBadge.tsx:36,93](../../../src/components/devto/DevtoBadge.tsx#L36)
**Finding:** Component comment says "channel-dot indicator can use the same source-of-truth without drifting on a brand refresh" — but the constant is `#0a0a0a`, not the purple already used three lines below for fill/border. Any downstream consumer that imports this gets pitch-black instead of `--source-dev`. Future drift guaranteed.
**Fix:** Set `DEVTO_BRAND_COLOR = "#b08bff"` (or, better, re-export a token like `"var(--source-dev)"` and let consumers resolve at render).
**Mechanical vs Design:** **Mechanical**.

---

## P1 — should-fix this sprint

### P1-1 · Cold-state path also missing freshness chrome
**File:** [src/app/devto/page.tsx:97-119](../../../src/app/devto/page.tsx#L97)
**Finding:** When `cold === true`, the SourceFeedTemplate renders with no `clock` slot at all — yet `trendingFile.fetchedAt` IS available and is passed to `EmptyState.lastSuccessAt`. The user sees no badge telling them *how* cold cold is.
**Fix:** Render `<FreshnessBadge source="devto" lastUpdatedAt={trendingFile.fetchedAt} />` in `clock={…}` even on the cold branch — that's the single most useful signal at that moment.
**Mechanical vs Design:** **Mechanical**.

### P1-2 · Mobile reflow: `<span class="big">` UTC clock + `LiveDot` collide at 375px
**File:** [src/app/devto/page.tsx:137-143](../../../src/app/devto/page.tsx#L137); CSS [v4.css:378-396](../../../src/components/ui/v4.css#L378)
**Finding:** PageHead media query collapses clock under headline at ≤640px, but the clock slot still renders three children (`<span class="big">`, `<span class="muted">`, `<LiveDot>`) inline with no explicit wrap/gap on mobile. On a 375px iPhone SE column the LiveDot pip + label wraps awkwardly, producing a 4-line clock stack that competes visually with the H1.
**Fix:** Wrap the three spans in `display:flex; flex-wrap:wrap; gap:6px` (or a `v4-page-head__clock-stack` class). Once P0-1 collapses LiveDot into FreshnessBadge, this still applies to the badge layout.
**Mechanical vs Design:** **Design** — needs a small layout primitive.

### P1-3 · Top-row tap target = 28px ('Cmts' header on mobile)
**File:** [src/app/devto/page.tsx:354-365](../../../src/app/devto/page.tsx#L354)
**Finding:** Hidden ≥md only (`hideBelow: "md"`), but the visible columns on mobile — title link (`text-[13px]`) and reactions chip — sit in `px-3 py-2.5` cells (line 164 of TerminalFeedTable) yielding ~36–40px row heights. The article-title `<a>` is the primary tap and clips at ~36px on the densest rows. Rule: 44×44 mobile tap targets.
**Fix:** Bump row vertical padding to `py-3` at ≤md, OR add `min-height: 44px` to `<tr>` at mobile breakpoint.
**Mechanical vs Design:** **Mechanical**.

### P1-4 · `EntityLogo size={20}` author avatar fails 44px touch contract on mobile
**File:** [src/app/devto/page.tsx:310](../../../src/app/devto/page.tsx#L310)
**Finding:** 20×20 avatar — fine for icon density but the whole row's only avatar-sized interactive cluster is the title link. Avatar is decorative (`alt=""`) and not clickable; but the visual density makes mobile users unsure if the avatar is itself a tap target.
**Fix:** Either bump to 24px and keep decorative, or make the avatar tap-route to the author profile (then bump to 32px with a wrapping `<a aria-label="@username">`).
**Mechanical vs Design:** **Design** — interaction-contract decision.

### P1-5 · Tag chip lacks `aria-label`; first tag only is exposed
**File:** [src/app/devto/page.tsx:371-388](../../../src/app/devto/page.tsx#L371)
**Finding:** Tag chip renders `#{tag}` with `title={a.tags.join(", ")}` — tooltip is mouse-only. Screen readers get `#nextjs` and never learn the other tags. Static chip with no `role` either.
**Fix:** Add `aria-label={\`tag ${tag}\${a.tags.length > 1 ? \`, plus \${a.tags.length - 1} more\` : ''}\`}`. Keep `title` for sighted hover.
**Mechanical vs Design:** **Mechanical**.

---

## P2 — polish

### P2-1 · Loading skeleton drifts from real layout
**File:** [src/app/devto/loading.tsx](../../../src/app/devto/loading.tsx)
**Finding:** Renders 4 KPI cells + 10 row skeletons, but real page renders the KPI band + tab-strip (3 windows) + 50 row table. The tab strip is unrepresented, so the layout shifts ~32px when content arrives.
**Fix:** Add a 36px-tall skeleton block between the KPI grid and the row stack.
**Mechanical vs Design:** **Mechanical**.

### P2-2 · `formatClock()` shows `HH:MM:SS` UTC but never ticks (static after SSR)
**File:** [src/app/devto/page.tsx:76-79](../../../src/app/devto/page.tsx#L76)
**Finding:** "11:32:04 UTC · SCRAPED" with a LIVE pulse pip next to it implies live wall-clock. The value is frozen at SSR + ISR cache time. Either it's not "live" (drop the pulse — already covered by P0-1) or use `<LiveClock/>` like sister pages.
**Fix:** Subsumed by P0-1; once FreshnessBadge replaces LiveDot the "SCRAPED" semantic is honest.
**Mechanical vs Design:** **Design**.

### P2-3 · Motion: row stagger uses `0.35s` — outside 120-180ms band
**File:** [src/app/devto/page.tsx:504](../../../src/app/devto/page.tsx#L504); [TerminalFeedTable.tsx:156](../../../src/components/feed/TerminalFeedTable.tsx#L156)
**Finding:** `slide-up 0.35s cubic-bezier(0.2,0.8,0.2,1)` row-entry animation. Easing curve matches the spec but duration is 2x the 180ms ceiling. Reduced-motion media query in globals.css zeroes it out, so the only impact is "feels heavy" for users without that preference.
**Fix:** Drop to `0.18s` (or pull the duration into a `--v4-duration-feed-row` token shared across feed tables — this lives in the TerminalFeedTable shared component so any fix lands across HN/Lobsters/Bluesky/Reddit/Devto at once).
**Mechanical vs Design:** **Design** — touches shared primitive, needs design-system call.

### P2-4 · `LiveDot` ARIA on cold state mislabels
**File:** [src/components/ui/LiveDot.tsx:33-35](../../../src/components/ui/LiveDot.tsx#L33)
**Finding:** Component always sets `role="status" aria-live="polite"` — so a `<LiveDot tone="none">` still announces as a status region. Not a /devto-specific bug but relevant once we route LiveDot through FreshnessBadge anyway.
**Fix:** Out-of-scope for this audit; flag for shared-component sprint.
**Mechanical vs Design:** **Design**.

---

## Working well

- KPI band uses `var(--v4-src-dev)` correctly for the TRACKED pip — proves the page knows the right color.
- 24h-empty failure mode handled gracefully via `emptyHint(activeWindow)` — names scrape-lag in minutes/hours/days and routes user to the populated window. This is exactly the "honest empty state" pattern the project rules call for.
- `<EntityLogo>` fallback chain documented inline (lines 297-308) explaining why `dev.to/<user>.png` was dropped (CORB) — good forensic comment.
- Reactions ≥50 highlighted in `--v4-money` — single-glance signal density done well.
- `dynamic = "force-static"` + ISR `revalidate=300` is the right cache-contract choice.
- Tab strip server-renders all 3 windows but uses `WindowedFeedTable`'s legacy mode — fine for top-50 capped rows.

## Verify-in-context (run with Vercel preview)

- Visit `/devto` at 375px width — confirm clock-region wrap behaviour and that title-cell tap zone hits 44px.
- Throttle `data/devto-trending.json` `fetchedAt` to >2 days ago — confirm LIVE pulse correctly degrades to STALE/COLD (proves P0-1 is wired right after fix).
- Hover the rank "01" cell — confirm it's purple `#b08bff` post-P0-2 fix, not blue.
- Screen-reader walk the table — confirm tag chip announces tag-count after P1-5.

## Mechanical fixes (low-risk, ship-now)

1. **P0-1** — Replace LiveDot with FreshnessBadge in clock slot (3-line diff).
2. **P0-2** — Delete `DEVTO_BLUE`, swap to `var(--source-dev)` in 2 places (4-line diff).
3. **P0-3** — Fix `DEVTO_BRAND_COLOR` export to `#b08bff` (1-line diff).
4. **P1-1** — Add FreshnessBadge to cold-state clock slot (3-line diff).
5. **P1-3** — Bump row padding to `py-3` at mobile (1-line diff on TerminalFeedTable, lands cross-source).
6. **P1-5** — Add `aria-label` to tag chip (1-line diff).
7. **P2-1** — Add tab-strip skeleton in `loading.tsx` (5-line diff).

## Quick patches

```tsx
// P0-1 + P0-2 in one pass
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
// delete: const DEVTO_BLUE = "#6699ff";
// in clock slot:
clock={<FreshnessBadge source="devto" lastUpdatedAt={trendingFile.fetchedAt} />}
// in rank cell:
style={{ color: i < 10 ? "var(--source-dev)" : "var(--v4-ink-400)" }}
// in TerminalFeedTable accent prop:
accent="var(--source-dev)"
```

```tsx
// P1-5 — tag chip a11y
aria-label={`tag ${tag}${a.tags.length > 1 ? `, plus ${a.tags.length - 1} more` : ""}`}
```

Design-call items (P1-2, P1-4, P2-3) need product/design sign-off before patch.
