---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# SubredditMindshareCanvas split plan

Source file: `src/components/reddit-trending/SubredditMindshareCanvas.tsx` (876 LOC)

## Scope and objective

Split `SubredditMindshareCanvas.tsx` into deeper modules with explicit seams so UI controls, SVG rendering, label layout, and physics/pointer orchestration can evolve independently. This is plan-only and preserves current behavior.

## Current structural findings

1. **God module / concern leakage** � `SubredditMindshareCanvas.tsx:L1-L876`
   UI controls, legend aggregation, gradient dedupe, physics orchestration, pointer event plumbing, tooltip positioning, label collision layout, and SVG paint order are all co-located. This makes each change load-bearing because unrelated concerns share one state surface.

2. **Shallow module boundary** � `SubredditMindshareCanvas.tsx:L338-L876`
   The top-level component exposes almost all implementation details directly in one render path instead of hiding complexity behind narrower interfaces.

3. **Cross-cutting interaction coupling** � `SubredditMindshareCanvas.tsx:L392-L511` + `:L656-L746`
   Navigation/filter mutation (`router.push`), drag/hover semantics, and tooltip state transitions are interleaved, so interaction tweaks risk regressions across URL state and pointer behavior.

4. **Computation mixed with view assembly** � `SubredditMindshareCanvas.tsx:L452-L654`
   Label collision/layout, viewport clamping, and render order are colocated with JSX assembly, increasing cognitive load and reducing test seam clarity.

5. **Animation provider hard dependency** � `SubredditMindshareCanvas.tsx:L32` + `:L248-L266`
   `framer-motion` is imported at module top and used in `BubbleNode`, forcing the bundle path to pay motion runtime cost even when reduced motion is enabled or chart is offscreen.

## Target module seams (split map)

1. `src/components/reddit-trending/mindshare/types.ts`
- Move: `SubredditWindowKey`, `ScaleMode`, `SubredditSeed`, `SubredditWindowSeedSet` (`:L40-L78`)
- Purpose: single vocabulary source for all extracted modules.

2. `src/components/reddit-trending/mindshare/constants.ts`
- Move: tabs, legend constants, label constants (`:L86-L127`)
- Purpose: remove non-behavioral noise from orchestration component.

3. `src/components/reddit-trending/mindshare/LegendBar.tsx`
- Move: legend JSX + count props contract (`:L366-L380`, `:824-L855`)
- Interface: `LegendBar({ breakoutPosts, aboveAvgPosts })`.

4. `src/components/reddit-trending/mindshare/CanvasControls.tsx`
- Move: scale/window tab controls (`:87-L94`, `:785-L823`)
- Interface: controlled props only (`scale`, `activeTab`, setters, counts).

5. `src/components/reddit-trending/mindshare/layout/outsideLabelLayout.ts`
- Move: `OutsidePos`, overlap helper, greedy placement pass (`:128-L134`, `:551-L654`)
- Interface: pure function with `seeds,width,height,labeledIds` input.

6. `src/components/reddit-trending/mindshare/hooks/useTooltipState.ts`
- Move: tooltip state + clamping + hover move/leave handlers (`:523-L550`, `:656-L746`)
- Interface: returns event handlers and tooltip view model.

7. `src/components/reddit-trending/mindshare/BubbleNode.tsx`
- Move: memoized bubble render unit (`:144-L336`)
- Interface: keep current prop set initially; shrink later by passing precomputed presentation fields.

8. `src/components/reddit-trending/mindshare/defs/useGradientDefs.ts`
- Move: gradient dedupe map computation (`:381-L410`)
- Interface: `useGradientDefs(seeds)` returns `{defs, idBySeed}`.

9. `src/components/reddit-trending/mindshare/hooks/useMindsharePhysics.ts`
- Move: target-preserving reset logic + `usePhysicsBubbles` wiring + URL filter toggle callback (`:412-L511`)
- Interface: receives `seeds,width,height,activeSub,searchParams,router,pathname`.

10. `src/components/reddit-trending/SubredditMindshareCanvas.tsx`
- Keep as orchestration shell composing seams above (`<250 LOC` target).

## Framer-motion lazy-load strategy

### Problem
`framer-motion` is eagerly loaded from the top-level module (`:32`) although only two animated circles in `BubbleNode` require it (`:248-L266`).

### Strategy
1. Add a local motion adapter component:
- `src/components/reddit-trending/mindshare/motion/MotionCircle.tsx`
- Uses `next/dynamic` to lazy-load an internal `MotionCircleImpl` (client-only, `ssr: false`).

2. Move motion dependency into `MotionCircleImpl.tsx`:
- `import { motion, useReducedMotion } from "framer-motion"` only in impl file.
- Expose minimal prop surface: `r`, `hovered`, `dragging`, `active`, `fill`, `stroke`, `strokeWidth`.

3. Keep a zero-cost fallback while loading:
- `loading` renderer returns plain `<circle>` with current radius/stroke to avoid visual pop.

4. Gate animation work:
- If `useReducedMotion` true, short-circuit transition to duration 0 (same behavior as current logic).
- Optionally defer lazy chunk request until first pointer interaction or `IntersectionObserver` visible state.

5. Validation target:
- Initial chart route bundle excludes framer-motion chunk until chart is visible/interactive.
- Visual parity for drag, hover halo, active stroke.

## Execution sequence (small, reversible PRs)

1. **PR1: Types/constants extraction**
- Move domain types/constants only; no behavior changes.

2. **PR2: Pure computation seams**
- Extract `useGradientDefs` and `computeOutsideLabelLayout` with snapshot/unit checks.

3. **PR3: View seams**
- Extract `CanvasControls`, `LegendBar`, `BubbleNode`.

4. **PR4: Interaction seam**
- Extract `useTooltipState` and `useMindsharePhysics` to isolate pointer + URL coupling.

5. **PR5: Motion lazy-load**
- Introduce `MotionCircle` adapter and deferred framer-motion import.

## Acceptance checklist

- Orchestrator file reduced to composition shell and state wiring only.
- `BubbleNode` no longer imports app navigation or physics internals.
- Outside-label layout and gradient logic are pure seams callable independently.
- Framer-motion moved out of initial static import path.
- No behavioral changes to drag, hover tooltip, URL filter, or legend totals.
