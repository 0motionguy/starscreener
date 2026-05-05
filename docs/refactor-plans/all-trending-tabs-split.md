# AllTrendingTabs split plan (AGN-482)

## Scope
- Target: `src/components/reddit-trending/AllTrendingTabs.tsx` (current 918 LOC)
- Goal: reduce coupling and improve module depth without changing behavior for `/reddit/trending`.
- Constraint: plan-only artifact, coordinated with H1 pagination/SSR workstream ([K3-P2-7](/AGN/issues/K3-P2-7)).

## Architectural diagnosis

1. **God module / concern leakage**
- `AllTrendingTabs.tsx` mixes query-state parsing (`:L252-L343`), feed derivation (`:L268-L373`), tab-strip UI (`:L375-L463`), empty-state UI (`:L508-L562`), canonical row renderer (`:L571-L738`), grouped renderer (`:L740-L810`), and compact row renderer (`:L812-L918`).
- Cost: any feed-rule change forces edits inside a presentation-heavy file, increasing regression surface and review cost.

2. **Shallow utility cluster co-located with view**
- Data/window/sort helpers (`:L207-L250`) and percentile math (`:L175-L205`) are bound to UI file placement.
- Cost: callsites cannot reuse or test these rules independently from React rendering seams.

3. **Duplicated render logic between row variants**
- `PostRow` (`:L571-L738`) and `PostRowCompact` (`:L812-L918`) duplicate velocity gating, tier selection, author/age/baseline rendering.
- Cost: style/logic drift risk when one row evolves and the other is missed.

4. **UI + URL state mutation tightly coupled**
- Tab/topic/sub mutations are in the same module as layout and item rendering (`:L326-L343`, `:L387-L399`, `:L451-L455`).
- Cost: H1 changes to pagination/search params collide with the visual module.

## Target module boundaries

1. `src/components/reddit-trending/all-tabs/model.ts`
- Owns: `TrendingTab`, tab constants, parsing, and feed derivation pure functions.
- Exports:
  - `parseTab(raw)`
  - `deriveFeed({ posts, activeTab, activeTopic, activeChips, showAll, nowMs })`
  - `computeTabCounts(...)`
  - `computeVelocityStats(...)`

2. `src/components/reddit-trending/all-tabs/useTrendingTabsQueryState.ts`
- Owns URL/search-param read/write seam.
- Exports normalized state + actions:
  - `activeTab`, `activeTopic`, `activeChips`, `showAll`
  - `setTab(tab)`, `clearTopic()`, `setSubFilter(sub)`

3. `src/components/reddit-trending/all-tabs/TrendingTabsHeader.tsx`
- Owns tab strip, counts, active topic chip, framer-motion indicator.
- No feed logic.

4. `src/components/reddit-trending/all-tabs/FeedEmptyState.tsx`
- Owns empty-window suggestion UI currently in `EmptyWindow`.

5. `src/components/reddit-trending/all-tabs/PostCard.tsx`
- Shared primitive for row shell and common metadata blocks.
- `PostRow` and compact variant become thin wrappers or variant props.

6. `src/components/reddit-trending/all-tabs/SubredditGroupedList.tsx`
- Owns grouping + top-3 rendering and uses compact row variant.

7. `src/components/reddit-trending/AllTrendingTabs.tsx`
- Becomes orchestration shell only: hook state -> derive data -> compose header/list components.

## Sequenced split steps

1. **Step A: isolate pure model first (no JSX edits)**
- Move helpers from `:L59-L250` and tab-count derivation from `:L359-L373` into `model.ts` with stable signatures.
- Keep behavior identical; add focused tests for sort/window/default-filter degrade rules.

2. **Step B: extract URL query seam**
- Move `searchParams/pathname/router` reads+writes (`:L254-L343`) into `useTrendingTabsQueryState`.
- Required to deconflict with H1 pagination parameter changes.

3. **Step C: extract header + empty-state UI**
- Move tab strip and empty state (`:L375-L473`, `:L508-L562`) into dedicated components.
- Keep existing class names and motion behavior unchanged.

4. **Step D: consolidate row duplication**
- Extract shared post-card primitives and keep standard/compact variants as composition wrappers.
- Keep DOM semantics and analytics/links unchanged.

5. **Step E: extract grouped list module**
- Move `SubredditGroupView` (`:L740-L810`) into its own file using shared row variant.

6. **Step F: final orchestrator trim + budget guard**
- Reduce `AllTrendingTabs.tsx` to target <=250 LOC.
- Gate with size check in PR notes and diff-based snapshot verification for no visual regressions.

## H1 dependency coordination

1. **Must land before or with H1 query-param work**
- Step B (`useTrendingTabsQueryState`) defines the single seam for URL param ownership to avoid merge conflicts with H1 SSR/pagination param rollout.

2. **Must not block H1 bandwidth fix rollout**
- Steps C-E are UI-structure only and can ship after H1 if needed.
- If H1 is urgent, prioritize A+B first and defer C-E as follow-up child issues.

## Risk and rollback

- Primary risk: subtle ordering/filter regressions in feed derivation.
- Mitigation: lock pure model behavior with fixtures before JSX refactor.
- Rollback: each step is file-scoped; revert per-step PR without reverting entire chain.

## Deliverable from this issue

- Plan artifact only. No implementation in this issue.
- Execution should be split into follow-up child issues aligned to Steps A-F.
