# V4 Migration Plan

> Maps the existing V3 codebase to the V4 contract. Three sections:
> token diff, component status, page-by-page worktree assignment.

---

## 1. Token diff: V3 → V4

### 1.1 Strategy

**No big-bang rename.** Introduce `--v4-*` tokens as the canonical names
(see `tokens.css`). Add aliases in `src/app/globals.css` so `--color-*` and
`--v3-*` still resolve to the same hex during the migration. Each
worktree's commits replace consumers of legacy names with `--v4-*` names.
After all worktrees land, a final cleanup commit drops the aliases.

### 1.2 Existing → V4 mapping

The current `src/app/globals.css` `@theme` block defines ~140 tokens. Map:

| V3 token (existing) | V4 token (canonical) | Notes |
|---|---|---|
| `--color-bg-canvas`        (#08090a) | `--v4-bg-000` | identical hex |
| `--color-bg-shell`         (#0b0d0f) | `--v4-bg-025` | |
| `--color-bg-raised`        (#101418) | `--v4-bg-050` | |
| `--color-bg-muted`         (#151a20) | `--v4-bg-100` | |
| `--color-bg-fill`          (#1d242b) | `--v4-bg-200` | |
| `--color-bg-strong`        (#2a323a) | `--v4-bg-300` | |
| `--color-border-subtle`    (#1a2026) | `--v4-line-100` | |
| `--color-border-default`   (#222a32) | `--v4-line-200` | |
| `--color-border-strong`    (#2f3942) | `--v4-line-300` | |
| `--color-border-hover`     (#4d5865) | `--v4-line-400` | |
| `--color-text-default`     (#eef0f2) | `--v4-ink-100` | |
| `--color-text-muted`       (#b8c0c8) | `--v4-ink-200` | |
| `--color-text-subtle`      (#84909b) | `--v4-ink-300` | |
| `--color-text-faint`       (#909caa) | `--v4-ink-400` | |
| `--color-text-disabled`    (#3c444d) | `--v4-ink-500` | |
| `--color-accent`           (#ff6b35) | `--v4-acc` | |
| `--color-accent-hover`     (#ff8458) | `--v4-acc-hover` | |
| `--color-accent-dim`       (#c44a1f) | `--v4-acc-dim` | |
| `--color-accent-soft`                | `--v4-acc-soft` | |
| `--color-accent-glow`                | `--v4-acc-glow` | |
| `--color-positive`         (#22c55e) | `--v4-money` | renamed for clarity |
| `--color-positive-soft`              | `--v4-money-soft` | |
| `--color-negative`         (#ff4d4d) | `--v4-red` | |
| `--color-warning`          (#ffb547) | `--v4-amber` | |
| `--color-cyan`             (#3ad6c5) | `--v4-cyan` | |
| `--color-violet`           (#a78bfa) | `--v4-violet` | |
| `--color-blue`             (#60a5fa) | `--v4-blue` | |
| `--color-pink`             (#f472b6) | `--v4-pink` | |
| `--color-gold`             (#ffd24d) | `--v4-gold` | |
| `--color-silver`           (#c0c5cc) | `--v4-silver` | |
| `--font-mono`                        | `--v4-mono` | |
| `--font-sans`                        | `--v4-sans` | |

### 1.3 Source channel tokens (NEW)

V3 has piecemeal `--source-{name}` tokens scattered across page CSS files.
V4 consolidates them under `--v4-src-*`:

```
--source-hackernews → --v4-src-hn
--source-github     → --v4-src-gh
--source-x          → --v4-src-x
--source-reddit     → --v4-src-reddit
--source-bluesky    → --v4-src-bsky
--source-dev        → --v4-src-dev
--source-claude     → --v4-src-claude
--source-openai     → --v4-src-openai
```

Aliases preserved in globals.css until VolumeAreaChart, ConsensusRadar,
SourceFilterBar, SourceFeedPanel are all migrated.

### 1.4 Tokens to deprecate (no V4 use)

Several V3 tokens have no V4 consumer once mockups land:

- `--color-bg-graphite`, `--color-bg-charcoal` (V3 multi-bg-theme system)
- `--color-functional-*` (V3 dual-accent — V4 doesn't have this concept)
- `--color-bg-overlay` (no modal in V4 yet)
- `--color-bg-row-hover` (V4 uses bg-050 with transition directly)

Plan: keep them for now, mark with `/* V3-only — drop in cleanup */`,
remove in the post-V4-launch sweep.

---

## 2. Component status (extract from COMPONENT_INVENTORY.md)

| Bucket | Existing | Upgrade | New | Total |
|---|---|---|---|---|
| Layout shell | 3 | 3 | 2 | 8 |
| Surfaces | 1 | 0 | 4 | 5 |
| Data display | 5 | 1 | 4 | 10 |
| Charts | 5 | 2 | 5 | 12 |
| Tables/rows | 2 | 1 | 4 | 7 |
| Cards | 2 | 0 | 4 | 6 |
| Filters/chips | 2 | 0 | 3 | 5 |
| Live/ticker | 2 | 0 | 1 | 3 |
| Source feeds | 1 | 1 | 0 | 2 |
| Templates | 0 | 0 | 3 | 3 |
| Alerts | 0 | 0 | 5 | 5 |
| Brand/export | 0 | 0 | 2 | 2 |
| **TOTAL** | **23** | **8** | **37** | **68** |

Phase 1.2 builds the 37 new + 8 upgrade components. The 23 existing
components only need token swaps (covered by aliases until each consumer
migrates).

---

## 3. Page-by-page worktree assignment

Mirrors the route coverage matrix from the parent plan
(`~/.claude/plans/so-i-i-give-keen-crystal.md`). Reproduced here for
worktree authors to scan without flipping tabs.

### W1: trend-v4-home (LOW risk)
- `/`, `/top`, `/top10`, `/top10/[date]`, `/embed/top10`
- Consumes: `Topbar`, `Sidebar`, `AppShell`, `PageHead`, `KpiBand`,
  `CategoryPanel × 3`, `SectionHead`, `Panel`, `PanelHead`, `BubbleMap`,
  `FeaturedCard × 3`, `Terminal`, `Sparkline`, `RankRow`, `Chip`,
  `ChipGroup`, `TabBar`
- W1 owns the **layout shell** (`Topbar`, `Sidebar`, `AppShell`) — all
  other worktrees consume after W1 merges to main.
- Mockups: home.html, polish-pass index.html

### W2: signals-v4-newsroom (LOW risk, post-Phase-0)
- `/signals`
- Consumes: layout shell, `PageHead`, `SourceFilterBar`, `KpiBand`,
  `VolumeAreaChart`, `ConsensusRadar`, `SourceFeedPanel × 8`, `SectionHead`,
  `TagMomentumHeatmap`, `LiveTicker`, `LiveClock`
- Mockup: signals.html
- **Phase 0 already restored the page**; W2 polishes against tokens.

### W3: consensus-v4 (LOW risk)
- `/consensus`, `/consensus/[owner]/[name]`
- Consumes: `VerdictRibbon`, `KpiBand`, `SourceStrip` (upgrade),
  `AgreementMatrix`, `DailyVerdictPanel`, `ConsensusBandHeader × 5`,
  `GaugeStrip`, `RankRow` (with band variant)
- Mockup: consensus.html
- ProfileTemplate consumer for `/consensus/[owner]/[name]`.

### W4: funding-v4 (HIGH risk — data layer work)
- `/funding`, `/revenue`, `/tools/revenue-estimate`, `/submit/revenue`
- Consumes: `VerdictRibbon`, `KpiBand`, `SourceStrip` (funding variant),
  `CapitalFlowChart`, `StockSparkline × 12`, `MoverRow × N`,
  `ARRClimberRow × N`, `SectorHeatmap`, `LiveTape`, `DealTapeRow × N`
- Net new data: `FundingEvent` aggregate type, `src/lib/funding/aggregate.ts`,
  `src/app/api/funding/events/route.ts`, `src/app/api/funding/sectors/route.ts`
- Out of scope: Pitchbook, Tracxn (rendered as "external · phase 2")
- Mockup: funding.html

### W5: repo-detail-v4 (LOW risk)
- `/repo/[owner]/[name]`, `/repo/[owner]/[name]/star-activity`
- Consumes: `PageHead`, `VerdictRibbon`, `GaugeStrip` (firing strip),
  `KpiBand`, `CrossSignalBreakdown`, `ProjectSurfaceMap`, `RepoDetailChart`
  (upgrade to SSR SVG), `MentionRow × N`, `MaintainerCard`,
  `RelatedRepoCard × 6`
- ProfileTemplate consumer.
- Mockup: repo-detail.html

### W6: tools-creator-v4 (MEDIUM risk)
- `/tools` (NEW hub), `/tools/star-history` (NEW), `/tools/treemap` (NEW),
  `/tools/mindshare` (move from `/mindshare`), `/tierlist`,
  `/tierlist/[shortId]`, `/compare`, `/mindshare` (302 redirect)
- Consumes: `ToolTile × 4`, `CompareChart` (upgrade), `BubbleMap`,
  `Treemap`, `TierListEditor`, `Top10Page`, `MiniListCard × 6`,
  `StarHistoryThemes`
- Mockups: tools.html, top10.html, star-history-themes.html

### W7: source-feeds-v4 (MEDIUM risk — volume of pages)
- `/hackernews/trending`, `/reddit`, `/reddit/trending`, `/bluesky/trending`,
  `/devto`, `/lobsters`, `/producthunt`, `/twitter`, `/npm`,
  `/arxiv/trending`, `/papers`, `/huggingface`, `/huggingface/trending`,
  `/huggingface/datasets`, `/huggingface/spaces`, `/breakouts`
- Consumes: `SourceFeedTemplate` (NEW, build first), then each route is
  ~50-100 lines mapping its data lib to template props.
- Mockup: sub-pages.html § /hackernews defines the template.

### W8: ecosystem-leaderboards-v4 (LOW risk — also volume)
- `/skills`, `/mcp`, `/mcp/[slug]`, `/agent-repos`, `/agent-commerce`,
  `/agent-commerce/[slug]`, `/model-usage`, `/categories`,
  `/categories/[slug]`, `/collections`, `/collections/[slug]`
- Consumes: `LeaderboardTemplate` (NEW, build first); detail pages reuse
  `ProfileTemplate`.

### W9: user-surfaces-v4 (MEDIUM risk — auth touchpoints)
- `/watchlist`, `/you`, `/u/[handle]`, `/search`, `/digest`,
  `/digest/[date]`
- Consumes: `ProfileTemplate` (NEW, build first), `AlertToggle` (from W10)

### W10: alerts-feature (HIGH complexity)
- `/alerts` (NEW)
- Net new: data model in `src/lib/alerts/types.ts`, worker job at
  `apps/trendingrepo-worker/src/fetchers/alerts/index.ts`, 5 API routes,
  Redis storage, `AlertBadge`, `AlertInbox`, `AlertTriggerCard`,
  `AlertEventRow`, `AlertToggle`
- Cross-cuts: sidebar badge from W1, watchlist toggle from W9, repo-detail
  CTA from W5.

### Out of scope (token swap only, mechanical pass)
- `/admin/*` (7 routes), `/cli`, `/demo`, `/pricing`, `/research`,
  `/predict`, `/portal/docs`, `/ideas`, `/ideas/[id]`, `/submit`,
  `/s/[shortId]`
- Plus programmatic surfaces (sitemap, llms.txt, robots, feeds, indexnow)

---

## 4. Sequencing

```
Phase 0  ✅  signals restored from bisect (commit 78086df8)
Phase 1.1 ⏳  design/v4/* source-of-truth (this commit)
Phase 1.2     primitives + templates (15+ components, 1 day each)
              ↓
Phase 2       parallel worktree merges:
              W2 (already current branch)
                ↓
              W1 (layout shell — main rebase point)
                ↓ ↓
              W3 ║ W5 (parallel — different routes, no conflict)
                ↓
              W7 (template-driven, 16 pages, single PR)
                ↓ ↓
              W6 ║ W8 (parallel)
                ↓
              W9
                ↓
              W10 (alerts feature, cross-cuts but lands last)
                ↓
              W4 (funding, highest risk, ETL work)
                ↓
Phase 3       polish, brand, QA, ship
```

---

## 5. Verification per worktree (reproduce in each PR)

```bash
npm run typecheck
npm run lint
npm run lint:guards
npm test          # baseline 1158 + worktree's added tests
npm run build
npm run dev       # smoke each route in browser, no console.error
```

Plus screenshot diff each route's hero against mockup. ≤ 5% drift = pass.

---

## 6. Accepted deviations log

(Fill in as we go. Format: `route — what was deviated — why`.)

_Empty._
