# LiveTopTable split plan (home critical path)

Issue: AGN-483  
Target: `src/components/home/LiveTopTable.tsx` (547 LOC)

## Scope
Plan-only refactor for the home-page table module. No behavior changes. Keep current UI contract and CSS classnames stable.

## Current structural findings

1. **God module / shallow module mix**  
   `src/components/home/LiveTopTable.tsx:L1-L577` mixes at least five concerns in one file:
   - domain/view types (`LiveRow`, `CategoryFacet`, source-key types)
   - numeric formatting + delta math
   - sparkline geometry helpers + gradient id management
   - watch/compare action behavior coupled to zustand + toasts
   - full table rendering (filters, headers, row rendering)

2. **Leaky abstraction: compare-cap policy split across modules**  
   `src/components/home/LiveTopTable.tsx:L237` gates UI with `compareCount >= 4`, while canonical cap is `COMPARE_CAP = 5` in `src/lib/store.ts:L88-L131`. The UI currently owns store policy details.

3. **Duplicated logic with divergence risk across top tables**  
   Near-identical helpers/components exist in:
   - `src/components/home/LiveTopTable.tsx:L114-L216`
   - `src/components/mcp/LiveMcpTable.tsx:L102-L213`
   - `src/components/skills/SkillsTopTable.tsx:L65-L178`
   This includes `formatCompact`, delta formatters, sparkline path math, sortable header rendering, and similar filter toolbar structure.

4. **Home critical-path coupling to persisted zustand stores**  
   `LiveTopTable` imports and subscribes to persisted stores via `useCompareStore` / `useWatchlistStore` (`src/components/home/LiveTopTable.tsx:L26`, `L228-L237`), which brings client persistence concerns into the largest home table module.

## Target architecture (deepening seams)

Create a feature-local module surface under `src/components/home/live-top/`:

- `types.ts`
  - owns `LiveRow`, `CategoryFacet`, `LiveSourceKey`
- `formatters.ts`
  - `formatCompact`, `formatDelta`, `formatPct`
- `sparkline.ts`
  - `sparkPath`, `sparkEnd`, stable gradient-id helper
- `sort.ts`
  - `SortKey`, `SortDir`, `compareNumeric`, `getSortValue`
- `SortHeader.tsx`
  - reusable sortable `<th>`
- `ActionCell.tsx`
  - watch/compare UI only; receives actions/state through a narrow hook seam
- `useRepoActions.ts`
  - adapter seam to zustand + toast side effects
- `LiveTopTable.tsx`
  - orchestration shell only (filters + table assembly)
- `index.ts`
  - stable export boundary

## Suspense + boundary plan

Goal is to keep table rows/data visible early while deferring interaction wiring.

1. **Boundary A: action controls island**
   - Convert row action controls into lazy client chunk:
     - `const ActionCell = dynamic(() => import("./ActionCell"), { ssr: false })`
   - Fallback: fixed-width ghost action cell to avoid layout shift.
   - Reason: this isolates zustand + toast + icon actions from first paint of core table content.

2. **Boundary B: optional sparkline island (conditional fallback)**
   - If profiling confirms sparkline SVG math is non-trivial, lazy-load sparkline renderer as a row-level presentation component with static numeric fallback.
   - Keep default as inline if profiling shows no meaningful gain; this remains a plan checkpoint, not mandatory split.

3. **No Suspense around table data shell**
   - Keep filter chips, headers, and numeric cells in primary render path so home board remains instantly informative.

## First-load-JS reduction estimate

Estimate is directional (no analyzer snapshot in this issue), based on module decoupling:

- **Immediate critical-path reduction (home route): ~6–12 KB gzip**
  - from isolating action-cell behavior + store subscriptions + toast wiring into lazy chunk.
- **Potential additional reduction: ~2–5 KB gzip**
  - if sparkline rendering is also deferred.
- **Total expected range: ~8–17 KB gzip** first-load JS improvement on `/`.

Validation method after implementation:
- run route-level bundle report (`next build` + analyzer)
- compare `app/page` first-load JS before/after
- verify no CLS from action-cell fallback width.

## Sequenced implementation plan

1. Extract pure helpers/types (no behavior change).
2. Introduce `useRepoActions` seam so `ActionCell` stops reading store internals directly.
3. Replace hardcoded compare cap gate with store-owned `isFull()` only.
4. Lazy-load `ActionCell` with stable fallback cell width.
5. Optional: profile and decide sparkline lazy boundary.
6. Run focused UI regression checks on home table interactions.

## Guardrails

- Preserve current `LiveTopTable` props and existing CSS class names.
- Keep row ordering/filter semantics unchanged.
- No changes to store persistence keys in `src/lib/store.ts`.
- No cross-feature abstraction extraction in this issue; only feature-local seams.

## Things that look bad but are actually fine

- `src/components/home/LiveTopTable.tsx:L495` gradient id counter looks odd, but it intentionally avoids SVG gradient id collisions across many mounted rows. Keep behavior; move helper into `sparkline.ts`.
- `src/components/home/LiveTopTable.tsx:L446-L451` tooltip text indicates `(7d)` while source data map is keyed by per-source counts; this is a content contract decision, not an architectural blocker for this split.

## Follow-up opportunities (separate issues)

1. Shared `TopTablePrimitives` package for Home/MCP/Skills once at least three concrete consumers have converged on stable contracts.
2. Normalize compare-cap UX and copy across Home + Skills top tables after cap ownership is centralized.
3. Add bundle-budget check for home route to lock in first-load JS gains.
