# agent-commerce split plan

## 1) Current state map (LOC per concern)

Target file: `src/app/agent-commerce/page.tsx` (measured 2238 LOC in current checkout).

- Route contract + metadata + param normalization: ~67 LOC (`L54-L120`)
- Reusable local UI primitives/helpers (`Sparkline`, `MiniBoard`, synthetic sparkline seeder): ~153 LOC (`L144-L296`)
- Refresh, filter parse, tab count orchestration: ~53 LOC (`L298-L350`)
- Data derivation + ranking + ticker/view-model shaping: ~236 LOC (`L352-L587`)
- Section rendering shell + sections 00-07 + cold state: ~1651 LOC (`L588-L2238`)
- Approximate share of rendering responsibility: 73.8%

Architectural diagnosis:
- The file is a god module: derivation seams and section rendering are interleaved inside one route entrypoint.
- Multiple deepening opportunities exist: derivation can be hidden behind one typed view-model seam; section rendering can be split by concern boundaries (overview vs settlements/browse).

## 2) Proposed 4-module split

### Module A — Route shell
- Path: `src/app/agent-commerce/page.tsx`
- Responsibility: RSC entrypoint only (metadata, refresh lifecycle, URL filter parse, cold/warm branching, compose section modules).
- Public seam: imports one builder from Module B and renders Modules C/D.

### Module B — View-model builder
- Path: `src/app/agent-commerce/_view-model.ts`
- Responsibility: all pure transforms from (`all`, `stats`, `filter`, `file`) to a typed `AgentCommercePageViewModel`.
- Includes: tab counts, sorted slices, pricing/flag/category breakdowns, score buckets, token boards, ticker rows, opportunities.

### Module C — Overview/top sections
- Path: `src/app/agent-commerce/_sections-overview.tsx`
- Responsibility: top shell and sections 00-03 plus token board `04b`; owns `Sparkline`.
- Inputs: precomputed view-model slices from Module B.

### Module D — Settlements + browse sections
- Path: `src/app/agent-commerce/_sections-settlements-and-browse.tsx`
- Responsibility: sections 04, 04c, 04c-sol, 04d, 05, 06, 07; owns `MiniBoard`.
- Inputs: precomputed view-model slices from Module B.

## 3) Migration order (NO behavior changes)

### Phase 1 — Extract Module B (`_view-model.ts`)
- Move pure derivation logic first (`L323-L587` + nested derivation helpers).
- Route continues rendering existing JSX, now fed by builder output.
- Estimated LOC moved: ~236.

### Phase 2 — Extract Module C (`_sections-overview.tsx`)
- Move top shell and sections 00-03 + 04b.
- Keep prop contract shallow: no direct data reads in section module.
- Estimated LOC moved: ~760.

### Phase 3 — Extract Module D (`_sections-settlements-and-browse.tsx`)
- Move 04/04c/04c-sol/04d/05/06/07 and `MiniBoard` rendering.
- Leave `page.tsx` as composition-only.
- Estimated LOC moved: ~891.

### Phase 4 — Stabilize contracts + cleanup
- Remove dead in-file helpers, tighten exported types, ensure zero behavior drift.
- Estimated LOC moved: ~80 (net cleanup/re-homing only).

Total estimated LOC moved across phases: ~1967.

## 4) Risk register

1. Derivation/render coupling risk
- Current render blocks reference local helper closures; extraction can accidentally reorder evaluation.
- Mitigation: freeze view-model interface first, then migrate JSX as pure consumer.

2. Query/filter semantic drift risk
- `tabCounts` and `applyFilter` behavior can drift if filter defaults are copied inconsistently across modules.
- Mitigation: preserve parser usage and snapshot `tabCounts` + representative query permutations.

3. On-chain panel regressions risk
- Sections 04c / 04c-sol / 04d are data-shape-sensitive and heavily inline-styled.
- Mitigation: move as-is first, then refactor style/shape separately in another issue.

## 5) Test impact

- Unit tests to add around Module B builder (pure deterministic outputs):
  - tab count consistency by tab/filter
  - score bucket allocations
  - ticker assembly limits/order
- Render parity checks (existing route-level smoke):
  - same cold/warm branching
  - unchanged section order and headings
  - unchanged card/grid counts for fixed fixture input
- No database/network test expansion required for this split; data refresh remains in route shell.
