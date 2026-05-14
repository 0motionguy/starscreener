# /mcp audit — 2026-05-13

Focus: TRENDING THIS WEEK hero shipped in PR #829 (66cdc72e4). Audited the hero pattern, the surrounding page, and the LiveMcpTable it sits above.

## Files audited

- [src/app/mcp/page.tsx](../../../src/app/mcp/page.tsx) — page + `TrendingThisWeek` component (inlined)
- [src/components/mcp/LiveMcpTable.tsx](../../../src/components/mcp/LiveMcpTable.tsx) — the leaderboard below the hero
- [src/components/shared/FreshnessBadge.tsx](../../../src/components/shared/FreshnessBadge.tsx) — confirmed routed via `classifyFreshness()`
- [src/lib/news/freshness.ts](../../../src/lib/news/freshness.ts) — `mcp` source uses `NPM_STALE_THRESHOLD_MS` (12h)
- [src/app/globals.css](../../../src/app/globals.css) — `.live-pip`, `.fchip`, `.home-surface`, `.v4-kpi-band`
- [src/components/ui/v4.css](../../../src/components/ui/v4.css) — V4 tokens used by the hero

## P0 findings

- **[P0] Undefined `--v4-up` token; arrow falls back to hardcoded `#4ade80`** — [page.tsx:569](../../../src/app/mcp/page.tsx#L569). The hero's delta arrow uses `color: "var(--v4-up, #4ade80)"`. `--v4-up` is not declared anywhere in `v4.css` / `globals.css` — confirmed via grep. Every mover row renders the hardcoded green, bypassing the theme system. Theme-switch + accent re-skin breaks here. Mechanical fix: replace with `var(--v4-money)` (canonical positive-delta token used elsewhere on the page).

## P1 findings

- **[P1] `.live-pip` violates honest-chrome rule — hardcoded "live" + green pulse glow** — [LiveMcpTable.tsx:279](../../../src/components/mcp/LiveMcpTable.tsx#L279) and [globals.css:2623-2641](../../../src/app/globals.css#L2623). The string `"live"` and a `box-shadow: 0 0 6px var(--sig-green)` pulse are literally inlined. This is the exact "hardcoded `LIVE` / green-pulse `LiveDot`" pattern the project memory `feedback_freshness_chrome_must_be_honest` flags. Page already renders a real `<FreshnessBadge>` in the PageHead — second source of truth contradicts it. Fix: delete the `.live-pip` span (or swap for a non-pulsing static count chip). Pre-existing pattern reused on `/skills` and home — note in the shared remediation.
- **[P1] `.fchip` filter chips fail 44×44 tap target** — [globals.css:2565-2580](../../../src/app/globals.css#L2565). Padding is `4px 10px` ≈ 22-24px tall, below the 44px mobile minimum (PRODUCT.md mobile posture rule). Affects the four registry filters on /mcp and the All chip. Mechanical fix: raise to `padding: 10px 14px` or add `min-height: 44px` under `@media (max-width: 640px)`.
- **[P1] Inline-styled hero ignores the V4 surface ramp & 2px radius rules** — [page.tsx:438-441](../../../src/app/mcp/page.tsx#L438) (`borderRadius: 4`) and [page.tsx:518](../../../src/app/mcp/page.tsx#L518) (`borderRadius: 3`). DESIGN.md says cards are 2px (`--radius-card: 0.125rem`) — these are 3/4px ad-hoc literals. Same surface (`--v4-bg-050`) repeated inside RAW PAYLOAD footer with no radius, creating inconsistent corner treatment within 30px of each other. Fix: extract to `.mcp-hero` class with `border-radius: var(--radius-card)` so it reads as one surface system.

## P2 findings

- **[P2] Hero `<ol>` minmax(220px, 1fr) wastes mobile vertical space** — [page.tsx:494](../../../src/app/mcp/page.tsx#L494). At 375px (16px page padding × 2 = 343px content) 220px renders exactly 1 column — correct — but stacks 5 movers vertically with logo+title+delta each on its own row. Result: the hero alone consumes ~280px before the table. Drop to `minmax(160px, 1fr)` to allow 2 columns at 343px wide, or to a single-line condensed mobile layout. Mechanical fix.
- **[P2] Hero anchor row ~32px tall — sub-44px tap target** — [page.tsx:510-522](../../../src/app/mcp/page.tsx#L510). `padding: "8px 10px"` + 20px logo = ~36px effective tap height. Each mover link is the primary CTA into the MCP detail surface — must hit 44×44 on mobile. Mechanical fix: bump padding to `12px 10px`.
- **[P2] Hero status string uses real-but-buried counts as a single-line wrap** — [page.tsx:469](../../../src/app/mcp/page.tsx#L469). `"5 movers · 7d window · across 1,234 servers"` lives on the right of the header with `flexWrap: "wrap"`. On 375px the status wraps to a second line that visually competes with the H3. Better: move the count next to the H3 (e.g. `// TRENDING THIS WEEK · 5/1,234`) and drop the standalone string.
- **[P2] Empty-state copy is a developer log note in user position** — [page.tsx:481-486](../../../src/app/mcp/page.tsx#L481). The empty-state literally reads "the mcp-usage-snapshot cron writes a daily snapshot to Redis at 03:30 UTC; the 7d delta becomes computable once a snapshot from 7 days ago exists." That's internal infra detail. Per PRODUCT.md "honest-by-default" doesn't mean "leak the cron schedule" — keep the honesty but rewrite as "// no 7d movers yet. Daily snapshots are still warming up; sort the table by 24h for short-window movement."
- **[P2] `// MCP TAPE` ribbon "source · auto · revalidate 60s" exposes implementation detail** — [page.tsx:323](../../../src/app/mcp/page.tsx#L323). The sub-stamp surfaces ISR cadence to users. Honest-chrome rule wants freshness; users don't need the revalidate window. Move to a `title` tooltip on the FreshnessBadge or drop.

## What's working well (the new hero pattern — keep)

- **`delta7d` is honest.** The `topMovers` filter requires `delta7d > 0 && deltaUnit !== null` ([page.tsx:295](../../../src/app/mcp/page.tsx#L295)) — no synthesized numbers, no placeholder "+12%" / "+34%" anywhere. When snapshots haven't accrued, the empty-state shows zero movers rather than fake-positive data. **This is the right pattern; the project memory explicitly warned about hardcoded delta placeholders and the hero avoids them.**
- **`deltaUnit` distinguishes installs vs stars in the tooltip** — [page.tsx:572](../../../src/app/mcp/page.tsx#L572). Tooltip reads `+1.2k installs · 7d` or `+340 stars · 7d`. Honest about provenance, expensive to fake; replicate this pattern on /skills.
- **FreshnessBadge wired correctly** — [page.tsx:314](../../../src/app/mcp/page.tsx#L314). `<FreshnessBadge source="mcp" lastUpdatedAt={data.fetchedAt} />` routes through `classifyFreshness()` with the right NewsSource enum. This is the one canonical freshness signal on the page.
- **Compact-number formatting (`Intl.NumberFormat`)** — [page.tsx:500-505](../../../src/app/mcp/page.tsx#L500). Thresholds at 1000 with `notation: "compact"` keep deltas readable.
- **Hero stays out of the table's information space.** The H3 and 5 movers consume < 220px on desktop; the table headline (sortable 24h/7d/30d columns) remains the primary scan surface. <3-second scan-time rule respected.

## Verify-in-context

Run before shipping fixes:
- `npm run dev` → load `http://localhost:3023/mcp` at 375px and 1440px
- Devtools network throttle "Slow 3G" → confirm `topMovers` populated (snapshot dependency)
- Check `data-theme="blue"` / `data-theme="green"` swap the `↑` color (P0 verifier — undefined `--v4-up` will stay green on every theme)
- Tab through hero anchors → focus ring uses `--v4-acc` (V4 primitive); confirm visible

## Mechanical fixes ready to ship

1. **P0** [page.tsx:569](../../../src/app/mcp/page.tsx#L569) — `var(--v4-up, #4ade80)` → `var(--v4-money)`
2. **P1** [LiveMcpTable.tsx:279](../../../src/components/mcp/LiveMcpTable.tsx#L279) + [globals.css:2623](../../../src/app/globals.css#L2623) — delete `.live-pip` (3 surfaces affected; coordinate with /skills + home)
3. **P1** [globals.css:2569](../../../src/app/globals.css#L2569) — `.fchip` padding `4px 10px` → `min-height: 44px; padding: 10px 14px;` (or behind `@media (max-width: 640px)` only)
4. **P1** [page.tsx:441](../../../src/app/mcp/page.tsx#L441) — `borderRadius: 4` → `borderRadius: 2` (or `var(--radius-card)`)
5. **P1** [page.tsx:518](../../../src/app/mcp/page.tsx#L518) — `borderRadius: 3` → `borderRadius: 2`
6. **P2** [page.tsx:494](../../../src/app/mcp/page.tsx#L494) — `minmax(220px, 1fr)` → `minmax(160px, 1fr)`
7. **P2** [page.tsx:514](../../../src/app/mcp/page.tsx#L514) — anchor padding `8px 10px` → `12px 10px`

## Quick-fix patches

### P0 — replace undefined token

```diff
- color: "var(--v4-up, #4ade80)",
+ color: "var(--v4-money)",
```

### P1 — kill `.live-pip` lie

In [LiveMcpTable.tsx:277-280](../../../src/components/mcp/LiveMcpTable.tsx#L277):

```diff
- <span className="live-top-meta">
-   showing <b>{rendered.length}</b> / {totalCount ?? rows.length}
-   <span className="live-pip">live</span>
- </span>
+ <span className="live-top-meta">
+   showing <b>{rendered.length}</b> / {totalCount ?? rows.length}
+ </span>
```

(Page already renders the real `<FreshnessBadge>` next to the H1 — the "live" pip is duplicate + dishonest chrome.)

### P1 — fchip tap target

In [globals.css:2565-2580](../../../src/app/globals.css#L2565):

```diff
  .live-top-filters .fchip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
-   padding: 4px 10px;
+   padding: 10px 14px;
+   min-height: 44px;
    border: 1px solid var(--line-200);
    border-radius: var(--radius-xs);
```
