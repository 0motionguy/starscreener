# /skills audit — 2026-05-13

Target: `/skills` after PR #828 (5-tab awesome-* curator taxonomy, commit `f2145d044`). Audit focuses on the inline `ListTaxonomyTabs` strip and the freshness chrome it ships with.

## Files audited

- [src/app/skills/page.tsx](../../../src/app/skills/page.tsx)
- [src/components/skills/SkillsTopTable.tsx](../../../src/components/skills/SkillsTopTable.tsx)
- [src/lib/skills/taxonomy.ts](../../../src/lib/skills/taxonomy.ts)
- [src/components/shared/FreshnessBadge.tsx](../../../src/components/shared/FreshnessBadge.tsx)
- [src/components/ui/TabBar.tsx](../../../src/components/ui/TabBar.tsx) (V4 primitive — unused by /skills)
- [src/components/ui/v4.css](../../../src/components/ui/v4.css) (`.v4-tab-bar` at L516)
- [data/awesome-skills.json](../../../data/awesome-skills.json) (4 lists, fetched 2026-05-12, ~8k rows)

---

## P0 findings

### P0-1 — Hardcoded "live" green-pulse pip in SkillsTopTable [Mechanical]

[src/components/skills/SkillsTopTable.tsx:313](../../../src/components/skills/SkillsTopTable.tsx#L313) renders `<span className="live-pip">live</span>` — a literal "live" label with a green pulse dot ([globals.css:2623-2641](../../../src/app/globals.css#L2623)). Violates the project rule: every freshness signal MUST route through `<FreshnessBadge>` + `classifyFreshness()`. Memory: `feedback_freshness_chrome_must_be_honest`.

**Fix**: Replace the `live` span with `<FreshnessBadge source="skills" lastUpdatedAt={fetchedAt} />` (the page already imports the badge and renders one in `PageHead`; pass the same `data.combined.fetchedAt` down to the table or drop the in-table pip entirely — the badge in the header already covers freshness for this surface).

### P0-2 — Tab tap targets fail 44×44 minimum [Mechanical]

[src/app/skills/page.tsx:644](../../../src/app/skills/page.tsx#L644) — tab links render with `padding: "5px 10px"` and `fontSize: 11`, resulting in ~22px tall, ~70px wide hit boxes. PRODUCT.md mandates "44×44 minimum tap targets on every interactive element". 5 tabs on 375px are individually un-tappable for a thumb.

**Fix**: Either (a) swap to the existing V4 `<TabBar>` primitive at [src/components/ui/TabBar.tsx](../../../src/components/ui/TabBar.tsx) which renders `height: 42px` + adequate horizontal padding and bumps to 44px on touch, or (b) raise inline padding to `12px 14px` minimum. See P1-1 for the consolidation play.

---

## P1 findings

### P1-1 — Inline tab strip duplicates V4 `<TabBar>` primitive [Design]

[src/app/skills/page.tsx:597-674](../../../src/app/skills/page.tsx#L597) inlines a 78-line `ListTaxonomyTabs` component with bespoke styling. The codebase already has [src/components/ui/TabBar.tsx](../../../src/components/ui/TabBar.tsx) backed by `.v4-tab-bar` in [v4.css:516](../../../src/components/ui/v4.css#L516) that ships: `height: 42px`, `overflow-x: auto` for mobile scroll, `border-bottom: 2px var(--v4-acc)` active indicator, hover transitions, the `__count` slot, and `hrefFor` link-mode for server-driven nav. Reinventing it creates drift (mobile-scroll fail per P1-2, tap-target fail per P0-2, missing focus-visible outline).

**Fix**: Replace `ListTaxonomyTabs` body with `<TabBar items={…} active={activeListSlug ?? "all"} hrefFor={…}/>`. The `hrefFor` link-mode is exactly what's needed for `?list=<slug>` URL-driven tabs.

### P1-2 — Tab strip wraps to 2 rows on 375px instead of horizontal scroll [Mechanical]

[src/app/skills/page.tsx:626](../../../src/app/skills/page.tsx#L626) sets `flexWrap: "wrap"` with no `overflow-x: auto`. Worst-case tab label "Awesome Claude Code · 1.2k" is ~190px; 5 tabs + counts at 11px = ~700px nominal width, so 375px viewports get a 2-line stacked wrap that pushes the leaderboard down the page. The V4 `.v4-tab-bar` (L521 `overflow-x: auto; scrollbar-width: thin`) is the canonical scannable-on-mobile pattern.

**Fix**: Switch to V4 `<TabBar>` (resolves with P1-1) OR add `flexWrap: "nowrap"; overflowX: "auto"; scrollbarWidth: "thin"` and remove `flexWrap: "wrap"`.

### P1-3 — Top-N constants ignored on tab change; "Top skills" copy lies [Design]

[src/app/skills/page.tsx:217-219](../../../src/app/skills/page.tsx#L217) renders `top {trendingItems.length} of {items.length}` — when a tab has fewer than `TRENDING_CAP` (1000) items, the section header reads "top 47 of 47" which is a misleading "top N" framing for what's actually "all 47 filtered rows". Confusing on the smaller tabs (e.g. `wong2-mcp` likely <100 items).

**Fix**: When `trendingItems.length === items.length`, render `all {trendingItems.length} ranked` instead of `top N of M`. One-line guard in `SectionHead meta` prop at [skills/page.tsx:377-381](../../../src/app/skills/page.tsx#L377).

### P1-4 — Inline styles bypass the design-token CSS layer [Design]

`ListTaxonomyTabs`, `SkillsEmpty`, `SkillAvatar`, and the "Most-cited" grid use ~30 inline `style={{}}` blocks ([skills/page.tsx:436-562](../../../src/app/skills/page.tsx#L436)) instead of v4.css selectors. This forks the maintenance surface (theme-swap, accent recolor, density-mode `data-surface` will not affect these), and the `border-left: 3px solid` color-key pattern documented in DESIGN.md for compare/news is impossible to apply here.

**Fix**: Move inline styles into a new `.v4-skills-*` block in [v4.css](../../../src/components/ui/v4.css) (or extract a `<MostCitedGrid>` component). At minimum, the empty-state inline block at [skills/page.tsx:686-700](../../../src/app/skills/page.tsx#L686) duplicates the home-page mono-caps empty state and should be the `<EmptyState>` primitive from [src/components/ui/EmptyState.tsx](../../../src/components/ui/EmptyState.tsx).

---

## P2 findings

### P2-1 — `borderRadius: 3` on tab links exceeds `--radius-button` (2px) [Mechanical]

[src/app/skills/page.tsx:645](../../../src/app/skills/page.tsx#L645) hardcodes `borderRadius: 3`. DESIGN.md spec: buttons + tabs use `--radius-button: 0.125rem` (2px) for terminal-feel. Same on pager buttons [globals.css:2663](../../../src/app/globals.css#L2663). Minor visual drift; impeccable's "sharp 2px corners" rule.

**Fix**: Drop to `var(--radius-button)` (2px) — single token swap.

### P2-2 — Skills table border-radius drift across sections [Mechanical]

Section 02 (breakout) `<section borderRadius: 4>` at [skills/page.tsx:441](../../../src/app/skills/page.tsx#L441), Section 03 (most-cited) `<Link borderRadius: 3>` at [skills/page.tsx:526](../../../src/app/skills/page.tsx#L526), `<SkillAvatar borderRadius: 3>` at [skills/page.tsx:721](../../../src/app/skills/page.tsx#L721). Three different radii on one page — should all be `var(--radius-card)` (2px) per DESIGN.md.

**Fix**: Replace literal radii with `var(--radius-card)` (or kill via P1-4 consolidation).

### P2-3 — Page sets `revalidate = 60` but page reads from in-memory store [Design]

[src/app/skills/page.tsx:59](../../../src/app/skills/page.tsx#L59) sets `revalidate = 60`. Each `refreshXxxFromStore()` call has its own 30s internal rate-limit, so the page can serve content as much as 90s stale while still appearing "fresh". The `<FreshnessBadge>` will surface this honestly IF the upstream `fetchedAt` is correct — but it would be cheaper / more honest to pin `revalidate = 120` and align with the source classifyFreshness threshold (NPM_STALE_THRESHOLD_MS).

**Fix**: Leave as-is unless the FreshnessBadge starts reporting STALE too early; track in a follow-up.

### P2-4 — `aria-current="page"` on filter chips is non-standard [Design]

[src/app/skills/page.tsx:639](../../../src/app/skills/page.tsx#L639) — `aria-current="page"` typically denotes the current full-page route. These tabs only change a query-string filter; AT users may hear "current page" on every filter tab, false. ARIA APG suggests `aria-current="true"` for in-page filter state OR `aria-pressed` if treated as toggles.

**Fix**: `aria-current={isActive ? "true" : undefined}` (or migrate to V4 `<TabBar>` which uses `aria-selected` correctly — P1-1).

---

## What's working well (5-tab pattern — what to keep)

- **Server-driven URL filter via `<Link href="?list=…">`** ([skills/page.tsx:618](../../../src/app/skills/page.tsx#L618)) — bookmark-able, share-able, no client JS for the tab swap. Right pattern.
- **`listCounts` computed from `allItems` (unfiltered)** ([skills/page.tsx:170-180](../../../src/app/skills/page.tsx#L170)) — counts stay stable as user tabs through, no flicker. Correct.
- **Defensive `isListSlug` guard** ([skills/page.tsx:164](../../../src/app/skills/page.tsx#L164) + [taxonomy.ts:44](../../../src/lib/skills/taxonomy.ts#L44)) — unknown `?list=` collapses to All instead of empty. Right.
- **`resolveSkillLists()` returns multi-slug membership** ([taxonomy.ts:55](../../../src/lib/skills/taxonomy.ts#L55)) — a skill in both `awesome-claude-code` AND `antigravity` is counted in both tab buckets. Right model.
- **Top-of-page `<FreshnessBadge source="skills" lastUpdatedAt={data.combined.fetchedAt} />`** ([skills/page.tsx:292](../../../src/app/skills/page.tsx#L292)) — honest chrome already wired. The P0-1 in-table pip is the only freshness lie.
- **Per-author cap (`PER_AUTHOR_CAP = 3`)** ([skills/page.tsx:71](../../../src/app/skills/page.tsx#L71)) — prevents one repo (e.g. `anthropics/skills` with 10+ child SKILL.md) from monopolising the leaderboard. Sharp call.

---

## Verify-in-context

- Tab strip on `xs` (480px) and **375px**: confirm horizontal scroll vs 2-line wrap. Currently wraps — P1-2.
- Each tab's empty path: visit `/skills?list=wong2-mcp` and verify `SkillsEmpty` renders if count is 0. Code path looks correct.
- Keyboard tab order: `<Link>` chain in `<nav>` is natively keyboard-traversable. No tab-trap risk.
- Color-blind verify: active tab uses `var(--v4-acc)` (brand orange) for the count color, on `var(--v4-bg-200)` background. Contrast OK but consider that **task rules suggested `--color-functional` (green) for active**. The V4 TabBar primitive itself uses `--v4-acc` (orange) — see [v4.css:556](../../../src/components/ui/v4.css#L556). This is design-system canonical; deviating from task brief, not the codebase. **Recommendation: keep brand-accent active** per system convention; do not switch to green.

---

## Mechanical fixes ready to ship

In rough order of pickup:

1. **P0-1** — delete `<span className="live-pip">live</span>` at [SkillsTopTable.tsx:313](../../../src/components/skills/SkillsTopTable.tsx#L313). One-line removal; the page header already renders the honest badge.
2. **P0-2 + P1-1 + P1-2** — single substitution: replace inline `ListTaxonomyTabs` (~78 lines) with V4 `<TabBar items={…} active={activeListSlug ?? "all"} hrefFor={(id) => id === "all" ? "/skills" : `/skills?list=${id}`}/>`. Resolves three findings.
3. **P1-3** — guard `SectionHead` meta to render `all N ranked` when `trendingItems.length === items.length`. Two-line change at [skills/page.tsx:377-381](../../../src/app/skills/page.tsx#L377).
4. **P2-1 / P2-2** — token-swap radii literals to `var(--radius-button)` / `var(--radius-card)`. Mechanical replace_all in the file.
5. **P2-4** — `aria-current="page"` → `aria-current="true"` (or drop entirely once on V4 TabBar).

## Quick-fix patches (optional)

**P0-1 quick patch**:

```diff
- <span className="live-top-spacer" />
- <span className="live-top-meta">
-   showing <b>{rangeStart}-{rangeEnd}</b> / {sorted.length}
-   <span className="live-pip">live</span>
- </span>
+ <span className="live-top-spacer" />
+ <span className="live-top-meta">
+   showing <b>{rangeStart}-{rangeEnd}</b> / {sorted.length}
+ </span>
```

**P1-1 quick patch** (skills/page.tsx body of `ListTaxonomyTabs`):

```tsx
import { TabBar } from "@/components/ui/TabBar";

const items: TabItem[] = [
  { id: "all", label: "ALL", count: allCount },
  ...LIST_SLUGS.map((slug) => ({
    id: slug,
    label: LIST_LABELS[slug].toUpperCase(),
    count: listCounts[slug],
  })),
];
return (
  <TabBar
    items={items}
    active={activeSlug ?? "all"}
    hrefFor={(id) => (id === "all" ? "/skills" : `/skills?list=${id}`)}
    className="v4-tab-bar--skills"
  />
);
```

---

**Severity totals**: 2 P0 · 4 P1 · 4 P2. The 5-tab pattern itself is correct — URL-driven, defensive, stable counts. Two real defects (in-table live pip, missing mobile scroll/tap targets) and one consolidation lever (use the V4 `<TabBar>` primitive) close the polish gap.
