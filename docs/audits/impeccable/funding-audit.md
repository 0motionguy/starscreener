# /funding audit — 2026-05-13

## Files audited
- [src/app/funding/page.tsx](../../../src/app/funding/page.tsx)
- [src/app/funding/loading.tsx](../../../src/app/funding/loading.tsx)
- [src/app/funding/error.tsx](../../../src/app/funding/error.tsx)
- [src/components/funding/MoverRow.tsx](../../../src/components/funding/MoverRow.tsx)
- [src/components/funding/WindowedFundingBoard.tsx](../../../src/components/funding/WindowedFundingBoard.tsx)
- [src/components/shared/FreshnessBadge.tsx](../../../src/components/shared/FreshnessBadge.tsx)
- [src/components/ui/PageHead.tsx](../../../src/components/ui/PageHead.tsx) (consumed)
- [src/components/ui/KpiBand.tsx](../../../src/components/ui/KpiBand.tsx) (consumed)
- [src/components/ui/SectionHead.tsx](../../../src/components/ui/SectionHead.tsx) (consumed)
- [src/components/ui/VerdictRibbon.tsx](../../../src/components/ui/VerdictRibbon.tsx) (consumed)
- [src/components/ui/Card.tsx](../../../src/components/ui/Card.tsx) (consumed)
- [src/lib/funding-news.ts](../../../src/lib/funding-news.ts) (chrome inputs)
- [src/lib/news/freshness.ts](../../../src/lib/news/freshness.ts) (threshold source)
- [src/app/globals.css#L3302-3557](../../../src/app/globals.css) `.funding-page` block
- [src/components/ui/v4.css#L1038-1157](../../../src/components/ui/v4.css) `.v4-mover-row` block

## P0 findings (dishonest / broken / a11y blocker)

- **Confidence chip always rendered green** — [page.tsx:474-477](../../../src/app/funding/page.tsx#L474). `<span className="delta up">{signal.extracted?.confidence ?? "none"}<span className="lbl">confidence</span></span>` — `.up` class forces `--sig-green` for *every* row regardless of value. `none` / `low` confidence reading green is a chrome lie. Fix: branch class on confidence (`high`→`up`/green, `medium`→amber, `low`/`none`→ink-400 or `.dn`). **Mechanical.**
- **`"warming"` masquerades as a clock** — [page.tsx:107-112, 209, 295](../../../src/app/funding/page.tsx#L107). When `file.fetchedAt` is the EPOCH_ZERO sentinel (cold), `formatClock` returns `"warming"` and is rendered in the `.big` slot of the PageHead clock column. "Warming" implies *about to be live*; reality is the source is dead. Fix: render `"—"` or `"OFFLINE"` and let `FreshnessBadge` own the COLD verdict. **Mechanical.**
- **`VerdictRibbon tone="money"` is locked** — [page.tsx:346](../../../src/app/funding/page.tsx#L346). Tone is `"money"` (green rail + green eyebrow + green stamp) regardless of freshness or signal count. When the underlying data is COLD per `FreshnessBadge`, the celebratory green verdict ribbon still ships. Mirror the FreshnessBadge tone: cold→`amber`, fresh→`money`. **Design call** (operator: confirm tone mapping table).
- **`<MoverRow href={signal.sourceUrl}>` opens in same tab** — [page.tsx:262](../../../src/app/funding/page.tsx#L262), MoverRow itself ([MoverRow.tsx:103-104](../../../src/components/funding/MoverRow.tsx#L103)) doesn't pass `target="_blank" rel="noreferrer"`. Clicking the headline navigates away from /funding without warning. The sister `sp-row` News tape ([page.tsx:466-468](../../../src/app/funding/page.tsx#L466)) and `funding-bar` ([page.tsx:415-417](../../../src/app/funding/page.tsx#L415)) DO set `target="_blank"` — inconsistent and a user-trap. **Mechanical.**

## P1 findings (visible regression)

- **Tab tap targets are ~36px** — [WindowedFundingBoard.tsx:43-52](../../../src/components/funding/WindowedFundingBoard.tsx#L43) + [globals.css#L2305-2314](../../../src/app/globals.css#L2305). `.tabs .tab` `padding: 9px 14px` + `font-size: 10px` → ~34-36px height. WCAG 2.5.5 + project mobile rule require 44×44. Fix: bump padding to `12px 16px` or set `min-height: 44px`. **Mechanical.**
- **Tab `tablist` missing tabpanel association** — [WindowedFundingBoard.tsx:38, 69](../../../src/components/funding/WindowedFundingBoard.tsx#L38). `role="tablist"` is set, tabs have `aria-selected` and `role="tab"`, but the rendered `<section className="board funding-board">` lacks `role="tabpanel"`, `id`, and `aria-labelledby`. Screen readers can't tie selection to panel content. Fix: give each tab an `id`, give the section `role="tabpanel"` + `aria-labelledby={selectedTabId}` + `id={panelId}`. **Mechanical.**
- **`funding-bar` track gradient mixes semantic roles** — [globals.css#L3385-3389](../../../src/app/globals.css#L3385). `linear-gradient(90deg, var(--sig-green), var(--acc))` — green→orange gradient on capital bars. Green is the funding semantic (per `--v4-money`/sig-green role); brand-orange tail double-encodes "hot" on a chart that's already encoding "biggest". Fix: solid `--v4-money` or `var(--sig-green)`. **Design call.**
- **Source-mix pip colors are decorative rotation, not source-keyed** — [page.tsx:434](../../../src/app/funding/page.tsx#L434) + [globals.css#L3323-3351](../../../src/app/globals.css#L3323). `sd-f${(index % 6) + 1}` rotates through green/orange/blue/violet/amber/cyan regardless of which source the row represents. Per project rule, source-color-keys should encode source identity (X = blue, HN = orange, etc. — `--source-x`, `--source-hackernews` tokens already exist in globals.css). Fix: map each `signal.sourcePlatform` to its `--source-*` token. **Mechanical.**
- **`<EmptyState>` not interactive — but reads like a debug log** — [page.tsx:194-200](../../../src/app/funding/page.tsx#L194). Cold copy "Funding data has not landed yet. Run the scraper to populate the radar." talks to the operator, not the user. Public surface should read "Funding feed is cold — last scan failed. Live data will return shortly." **Design call.**
- **VerdictRibbon `actionHref="/feeds/funding.xml"` opens RSS in-place** — [page.tsx:363-364](../../../src/app/funding/page.tsx#L363). XML files open as raw text in most browsers — same-tab navigation kicks the user out of /funding into an XML doc. Add `target="_blank" rel="noreferrer"` (or extend `VerdictRibbon` to accept that). **Mechanical.**

## P2 findings (polish / drift)

- **KPI pip colors don't match value tone** — [page.tsx:316-320](../../../src/app/funding/page.tsx#L316). `THIS WEEK` cell has `tone: "acc"` (orange value) with `pip: "var(--v4-blue)"` (blue pip). Visually noisy; tone and pip should agree or one should be ink-300. **Design call.**
- **Multiple competing row primitives on one page** — `.v4-mover-row`, `.funding-bar`, `.sp-row`, `.stock-row` all coexist with slightly different padding/typography/grid templates. Long-term tech debt against the V4 corpus consolidation work. **Design call.**
- **`sourceName` fallback returns kebab→space without title-casing** — [page.tsx:122-124](../../../src/app/funding/page.tsx#L122). Unknown source `"sec-form-d"` is in SOURCE_LABELS, but a genuinely new source ships as `"some-new-feed"` lowercase mid-row. Fix: title-case the fallback. **Mechanical.**
- **`<span className="muted">` inside `<span className="right">`** — [WindowedFundingBoard.tsx:55-66](../../../src/components/funding/WindowedFundingBoard.tsx#L55). Inline styles re-declare font-family/letter-spacing/text-transform that the parent `.tabs .right` already sets. Redundant; drop the inline style. **Mechanical.**
- **Loading skeleton uses `--v3-bg-050` / `--v3-bg-100`** — [loading.tsx:11, 15, 23, 30, 39](../../../src/app/funding/loading.tsx#L11). Page renders under `.funding-page` (V2 + V4 tokens). Generation mismatch between skeleton and shipped page; visually fine but drifts during theme swaps. **Design call.**
- **`EntityLogo alt=""` is correct but commented as decorative-only** — [MoverRow.tsx:135](../../../src/components/funding/MoverRow.tsx#L135). The company name IS rendered as text adjacent, so empty alt is right per WCAG decorative-image rule. No action; flagging only because audit checklists tend to false-positive this. **Working as intended.**
- **`FreshnessBadge source="skills"`** — [page.tsx:293](../../../src/app/funding/page.tsx#L293). `"funding"` is not a `NewsSource` variant in `freshness.ts`; the page borrows `"skills"` (→ NPM_STALE_THRESHOLD_MS = 50h). Funding-news cron cadence isn't documented here — the 50h budget is plausible but unverified. Either add `"funding"` to `NewsSource` with its own threshold, or document the intentional reuse in a comment at the call site. **Verify-in-context.**

## What's working well

- Real `FreshnessBadge` is wired (line 293) — no inline hardcoded "FRESH · 1H" lie. Honest chrome contract is mostly upheld.
- `isFundingCold(file)` + `EmptyState` empty-state path exists (page.tsx:208, 367).
- `isLikelyRoundup` filter (lines 170-177) catches "Software" / "Exclusive: ..." extraction garbage from chart inputs.
- Stage→class regex is anchored end-of-string (MoverRow.tsx:187-195), fixing the earlier "everything is orange" bug.
- 2px radii throughout — terminal feel preserved.
- KPI band collapses to 2-up grid at 768px (v4.css:729-743).
- `--v4-money` semantic green for capital, distinct from brand orange.
- First-row left-rail uses `border-left: 2px solid var(--v4-money)` — *functional* color key (the #1 row), not decorative side-tab.
- No card shadows; ramp-stacking via `--v4-bg-050` hover surfaces.
- Tabs do set `role="tablist"`, `role="tab"`, `aria-selected` — half the a11y contract is honored, just incomplete.
- Outbound News-tape rows correctly use `target="_blank" rel="noreferrer"`.
- KPI cells use tabular-nums for stable column widths.

## Verify-in-context
- **VerdictRibbon tone mapping** when data is cold/stale (P0 #3) — operator to confirm: should the ribbon flip `money`→`amber`→`red` as `FreshnessBadge` does, or stay green and let the badge be the only freshness signal?
- **`FreshnessBadge source="skills"` reuse** (P2 #6) — confirm intentional or add a dedicated `funding` source with its own threshold reflecting the actual funding-news cron cadence.
- **`sd-f1..f6` decorative rotation vs source-keyed colors** (P1 #4) — palette already exists (`--source-*`); confirm we want per-source identity here.

## Mechanical fixes ready to ship

1. P0 #1 — branch `delta` class on confidence value (not always `up`).
2. P0 #2 — replace `"warming"` sentinel with `"—"` or `"OFFLINE"`; let FreshnessBadge own the verdict.
3. P0 #4 — add `target="_blank" rel="noreferrer"` to `<MoverRow href={signal.sourceUrl} ...>` (either at the call site or by defaulting inside MoverRow when the href is external).
4. P1 #1 — tab `padding: 12px 16px` or `min-height: 44px` on `.tabs .tab`.
5. P1 #2 — wire `id` + `role="tabpanel"` + `aria-labelledby` on the `<section className="board funding-board">`.
6. P1 #6 — `target="_blank"` on the RSS action link in VerdictRibbon.
7. P2 #3 — title-case the `sourceName` fallback.
8. P2 #4 — drop the redundant inline-style override inside `.tabs .right`.

## Quick-fix patches

### P0 #1 — honest confidence chip

Before ([page.tsx:474-477](../../../src/app/funding/page.tsx#L474)):
```tsx
<span className="delta up">
  {signal.extracted?.confidence ?? "none"}
  <span className="lbl">confidence</span>
</span>
```

After:
```tsx
{(() => {
  const c = signal.extracted?.confidence ?? "none";
  const cls = c === "high" ? "delta up" : c === "medium" ? "delta" : "delta dn";
  return (
    <span className={cls}>
      {c}
      <span className="lbl">confidence</span>
    </span>
  );
})()}
```

### P0 #2 — drop the "warming" lie

Before ([page.tsx:107-112](../../../src/app/funding/page.tsx#L107)):
```ts
function formatClock(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(11, 19)
    : "warming";
}
```

After:
```ts
function formatClock(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  if (value.startsWith("1970-")) return "—"; // EPOCH_ZERO sentinel
  return date.toISOString().slice(11, 19);
}
```

### P0 #4 — outbound MoverRow opens in new tab

Before ([page.tsx:262](../../../src/app/funding/page.tsx#L262)):
```tsx
href={signal.sourceUrl}
```

Apply at MoverRow.tsx:103-104 instead so every consumer is safe:
```tsx
<Tag
  {...(href ? { href, target: "_blank", rel: "noreferrer" } : {})}
  ...
```

### P1 #1 — 44px tabs

Before ([globals.css#L2305-2314](../../../src/app/globals.css#L2305)):
```css
.tabs .tab {
  margin-bottom: -1px;
  padding: 9px 14px;
  ...
}
```

After:
```css
.tabs .tab {
  margin-bottom: -1px;
  padding: 12px 16px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  ...
}
```
