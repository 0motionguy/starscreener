# V4 Component Inventory

> The complete list of components needed to render the 11 V4 mockups. Each
> entry has: status (existing / upgrade / new), target path, API sketch,
> and which mockup section first introduces it. Worktrees in Phase 2 only
> consume components from this inventory. Anything missing → STOP and add
> to this list before building.

**Status legend:**
- ✅ **EXISTS** — production-ready, V4-compatible (or only needs token swap)
- 🔧 **UPGRADE** — exists but needs visual revision to match V4 mockup
- 🆕 **NEW** — must be built in Phase 1.2
- 📦 **TEMPLATE** — composite layout primitive used by multiple pages

---

## 1. Layout shell

| Status | Component | Path | First seen in | API sketch |
|---|---|---|---|---|
| 🔧 | `Topbar` | `src/components/layout/Header.tsx` | every mockup | `<Topbar variant="default" />` |
| 🔧 | `Sidebar` | `src/components/layout/Sidebar.tsx` | every mockup | `<Sidebar groups={[...]} active="/signals" />` |
| 🔧 | `AppShell` | `src/components/layout/AppShell.tsx` | every mockup | `<AppShell><Topbar/><Sidebar/><Main/></AppShell>` |
| 🆕 | `PageHead` | `src/components/ui/PageHead.tsx` | every mockup | `<PageHead crumb="SIGNAL · TERMINAL" h1="..." lede="..." clock={iso} />` |
| 🆕 | `SectionHead` | `src/components/ui/SectionHead.tsx` | every mockup `// 01` etc. | `<SectionHead num="// 01" title="..." meta="..." />` |

---

## 2. Surfaces (panel chrome)

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| 🔧 | `Panel` (Card) | `src/components/ui/Card.tsx` | every mockup | `<Card variant="panel">…</Card>` |
| 🆕 | `PanelHead` | `src/components/ui/PanelHead.tsx` | every panel | `<PanelHead corner k="// 01 SIGNAL VOLUME" sub="STACKED · 24H" right={<Live/>} />` |
| 🆕 | `CornerDots` | `src/components/ui/CornerDots.tsx` | inside PanelHead | `<CornerDots />` — 3 × 4px squares decoration |
| ✅ | `LiveDot` | `src/components/ui/LiveDot.tsx` (extract from FreshBadge) | panel-head right meta | `<LiveDot />` |
| 🆕 | `VerdictRibbon` | `src/components/ui/VerdictRibbon.tsx` | repo-detail.html, consensus.html, funding.html top | `<VerdictRibbon stamp="..." text={ReactNode} actionHref="..." tone="acc|money|amber" />` |

---

## 3. Data display

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| 🆕 | `KpiBand` | `src/components/ui/KpiBand.tsx` | every flagship page | `<KpiBand cells={[{label, value, delta, sub, tone, pip}]} />` |
| 🆕 | `KpiCell` | inside KpiBand | every flagship page | private |
| 🔧 | `Sparkline` | `src/components/shared/Sparkline.tsx` | many | `<Sparkline data={[]} color={"--v4-money"} fillId="..." />` |
| 🆕 | `SourcePip` | `src/components/ui/SourcePip.tsx` | signals filter, consensus, funding strips | `<SourcePip src="hn" size="sm|md" />` |
| 🆕 | `GaugeStrip` | `src/components/ui/GaugeStrip.tsx` | consensus 8-cell row, repo-detail firing strip | `<GaugeStrip cells={[{src, intensity}]} />` |
| 🆕 | `RankRow` | `src/components/ui/RankRow.tsx` | top10, hero category panels | `<RankRow rank={1} title nm desc score sparkline delta />` |
| ✅ | `RankBadge` | `src/components/shared/RankBadge.tsx` | top10 #N badge | `<RankBadge n={1} tier="gold|silver|bronze" />` |
| ✅ | `DeltaBadge` | `src/components/shared/DeltaBadge.tsx` | every delta | `<DeltaBadge value={+18} percent />` |
| ✅ | `MomentumBadge` | `src/components/shared/MomentumBadge.tsx` | row meta | `<MomentumBadge level="firing|hot|warm|cool" />` |
| ✅ | `LetterAvatar` | `src/components/shared/LetterAvatar.tsx` | repo rows, KOL feed | `<LetterAvatar text="anthropic/skills" />` |
| ✅ | `CategoryPill` | `src/components/shared/CategoryPill.tsx` | tag chips | `<CategoryPill label="AI · agents" />` |

---

## 4. Charts (SSR SVG)

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| 🔧 | `VolumeAreaChart` | `src/components/signals-terminal/VolumeAreaChart.tsx` | signals.html § 01 | already V4-clean (SVG, post-Phase-0) |
| ✅ | `TagMomentumHeatmap` | `src/components/signals-terminal/TagMomentumHeatmap.tsx` | signals.html § 05 | mockup-correct |
| ✅ | `ConsensusRadar` | `src/components/signals-terminal/ConsensusRadar.tsx` | signals.html § 02 | mockup-correct |
| ✅ | `AgreementMatrix` | `src/components/consensus/AgreementMatrix.tsx` | consensus.html scatter | 881 lines, complete |
| 🔧 | `RepoDetailChart` | `src/components/repo-detail/RepoDetailChart.tsx` | repo-detail.html star history | strip Recharts, port to SSR SVG |
| 🔧 | `CompareChart` | `src/components/compare/CompareChart.tsx` | tools.html star history | strip Recharts, port to SSR SVG |
| ✅ | `BubbleMap` | `src/components/terminal/BubbleMap.tsx` (canvas) | home.html signal map, tools.html mindshare | reused by both, repath to `/tools/mindshare` |
| 🆕 | `Treemap` | `src/components/tools/Treemap.tsx` | tools.html § treemap | `<Treemap cells={[{label, sub, size, color, opacity}]} />` |
| 🆕 | `CapitalFlowChart` | `src/components/funding/CapitalFlowChart.tsx` | funding.html § 01 | stacked area, sectors × 30 days |
| 🆕 | `SectorHeatmap` | `src/components/funding/SectorHeatmap.tsx` | funding.html § 03 | sector × stage matrix |
| 🆕 | `StockSparkline` | `src/components/funding/StockSparkline.tsx` | funding.html stocks list | mini sparkline + ticker + delta |
| 🆕 | `StarHistoryThemes` | `src/components/exports/StarHistoryThemes.tsx` | star-history-themes.html | 3 export themes (Blueprint, Neon, Editorial) |
| 🆕 | `ChannelHeatStrip` | `src/components/breakouts/ChannelHeatStrip.tsx` | sub-pages.html § breakouts | 24-cell per-row hourly heatmap |

---

## 5. Tables / list rows

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| ✅ | `Terminal` | `src/components/terminal/Terminal.tsx` | home.html § 05 | sortable table base, 507 lines |
| ✅ | `TerminalRow` | `src/components/terminal/TerminalRow.tsx` | home.html § 05 | row in Terminal |
| 🔧 | `ColumnGroupHeader` | inside Terminal | home.html STARS / MOMENTUM / TREND | grouped table header |
| 🆕 | `ConsensusBandHeader` | `src/components/consensus/ConsensusBandHeader.tsx` | consensus.html banded leaderboard | `<ConsensusBandHeader band="cons" title count />` |
| 🆕 | `MoverRow` | `src/components/funding/MoverRow.tsx` | funding.html § 02 biggest rounds | `<MoverRow rank co stage amount investors />` |
| 🆕 | `ARRClimberRow` | `src/components/funding/ARRClimberRow.tsx` | funding.html § 02 ARR climbers | `<ARRClimberRow rank co arr deltaPct mom />` |
| 🆕 | `DealTapeRow` | `src/components/funding/DealTapeRow.tsx` | funding.html § 04 live tape | `<DealTapeRow ts company stage amt source highlight={fresh} />` |
| 🆕 | `MentionRow` | `src/components/repo-detail/MentionRow.tsx` | repo-detail.html § 03 evidence feed | `<MentionRow source author title text age engagement href />` |

---

## 6. Cards

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| ✅ | `FeaturedCard` | `src/components/terminal/FeaturedCard.tsx` | home.html § 04 | hero / sec variants exist |
| ✅ | `RepoCard` | `src/components/feed/RepoCard.tsx` | various | listing card |
| 🆕 | `CategoryPanel` | `src/components/home/CategoryPanel.tsx` | home.html § 01 (REPOS / SKILLS / MCP) | `<CategoryPanel title rows footer color />` |
| 🆕 | `RelatedRepoCard` | `src/components/repo-detail/RelatedRepoCard.tsx` | repo-detail.html § 04 | similar-repo card with sim score |
| 🆕 | `ToolTile` | `src/components/tools/ToolTile.tsx` | tools.html hub | `<ToolTile num title desc preview live ar />` |
| 🆕 | `MiniListCard` | `src/components/tools/MiniListCard.tsx` | top10.html "other lists" mini cards | `<MiniListCard cat icon items={[{rank, name, val}]} />` |

---

## 7. Filters / chips

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| ✅ | `SourceFilterBar` | `src/components/signals-terminal/SourceFilterBar.tsx` | signals.html | mockup-correct |
| 🆕 | `Chip` | `src/components/ui/Chip.tsx` | filters everywhere | `<Chip on={bool} icon={ReactNode} count={n}>label</Chip>` |
| 🆕 | `ChipGroup` | `src/components/ui/ChipGroup.tsx` | filters everywhere | `<ChipGroup label="WINDOW" options={[]} value onChange />` |
| ✅ | `Tab` | inside Top10Page | top10.html category tabs | `<Tab on em ct>label</Tab>` |
| 🆕 | `TabBar` (V4) | `src/components/ui/TabBar.tsx` | top10.html, breakouts, mention feed | reusable horizontal tabs |

---

## 8. Live / ticker

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| ✅ | `LiveTicker` | `src/components/signals-terminal/LiveTicker.tsx` | signals.html | mockup-correct |
| ✅ | `LiveClock` | `src/components/signals-terminal/LiveClock.tsx` | signals.html | mockup-correct |
| 🆕 | `LiveTape` (funding variant) | `src/components/funding/LiveTape.tsx` | funding.html § 04 | virtual-scroll list of DealTapeRow |

---

## 9. Source / panel feeds

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| ✅ | `SourceFeedPanel` | `src/components/signals-terminal/SourceFeedPanel.tsx` | signals.html § 03/04 | renders list / tweet / rss variants |
| 🔧 | `SourceStrip` | `src/components/consensus/SourceStrip.tsx` | consensus.html | upgrade for funding-source variant |

---

## 10. Layout templates (consumed by Phase 2 worktrees)

| Status | Component | Path | Used by | API |
|---|---|---|---|---|
| 🆕📦 | `SourceFeedTemplate` | `src/components/templates/SourceFeedTemplate.tsx` | W7 (13 pages) | `<SourceFeedTemplate source meta snapshot volume topics featured listRows />` |
| 🆕📦 | `LeaderboardTemplate` | `src/components/templates/LeaderboardTemplate.tsx` | W8 (8 pages) | `<LeaderboardTemplate title kpiCells filterChips bandedRows />` |
| 🆕📦 | `ProfileTemplate` | `src/components/templates/ProfileTemplate.tsx` | W9 (5 pages) | `<ProfileTemplate identity verdict kpiBand panels related />` |

---

## 11. Alerts feature (W10)

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| 🆕 | `AlertBadge` | `src/components/alerts/AlertBadge.tsx` | sidebar nav badge | `<AlertBadge count={3} />` |
| 🆕 | `AlertTriggerCard` | `src/components/alerts/AlertTriggerCard.tsx` | /alerts triggers list | `<AlertTriggerCard trigger onToggle onDelete />` |
| 🆕 | `AlertEventRow` | `src/components/alerts/AlertEventRow.tsx` | /alerts inbox | `<AlertEventRow event onMarkRead />` |
| 🆕 | `AlertInbox` | `src/components/alerts/AlertInbox.tsx` | /alerts main | `<AlertInbox events grouped />` |
| 🆕 | `AlertToggle` | `src/components/alerts/AlertToggle.tsx` | watchlist row, repo detail | `<AlertToggle target enabled onChange />` |

---

## 12. Brand / export

| Status | Component | Path | First seen | API |
|---|---|---|---|---|
| 🆕 | `StarTickLogo` | `src/components/brand/StarTickLogo.tsx` | logo-lab.html § concept 02 | reusable SVG symbol (deferred to Phase 3) |
| 🆕 | `OgCard` | `src/app/api/og/[surface]/route.tsx` | OG share images | edge route, @vercel/og |

---

## 13. Build order (Phase 1.2)

Dependency-ordered. Each commits independently.

1. `tokens.css` ← already done (Phase 1.1)
2. `CornerDots`
3. `LiveDot`
4. `PanelHead`
5. `SectionHead`
6. `PageHead`
7. `Chip`, `ChipGroup`, `TabBar`
8. `SourcePip`
9. `GaugeStrip`
10. `KpiBand` (uses LiveDot, takes `KpiCell[]`)
11. `RankRow`
12. `VerdictRibbon`
13. Funding family: `MoverRow`, `ARRClimberRow`, `DealTapeRow`, `StockSparkline`, `LiveTape`, `CapitalFlowChart`, `SectorHeatmap`
14. Tools family: `ToolTile`, `MiniListCard`, `Treemap`
15. Home family: `CategoryPanel`
16. Repo-detail family: `MentionRow`, `RelatedRepoCard`, `ChannelHeatStrip`
17. Alerts family: `AlertBadge`, `AlertToggle`, `AlertTriggerCard`, `AlertEventRow`, `AlertInbox`
18. Templates: `SourceFeedTemplate`, `LeaderboardTemplate`, `ProfileTemplate`
19. Exports: `StarHistoryThemes` (Blueprint, Neon, Editorial)

Each component's commit includes:
- The component itself
- 1-3 unit tests under `src/components/**/__tests__/` (where existing convention)
- A demo entry in `/_design-lab/primitives` (added to a single demo page;
  removed before ship)

---

## 14. Verification per primitive

After each primitive lands:
```bash
npm run typecheck            # must be green
npm run lint -- src/components/ui/<Component>.tsx
npm test                     # baseline +N (N = new tests)
```

Each commit message follows: `feat(ui): <component> — V4 primitive (<role>)`.
