---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# Storybook Component Library Docs

This document defines the minimum Storybook documentation contract for the `src/components/ui/*` library and related reusable surface components.

## Scope

- In scope: component stories, usage docs, and visual QA workflow.
- Out of scope: redesigns, token refactors, and backend/data changes.

## Current Baseline (2026-05-04)

- No `.storybook/` directory exists in this repository.
- The internal route `/design-lab/primitives` is the active primitive showcase and is marked as temporary.
- Primary UI primitives currently live under `src/components/ui/`.

## Storybook Coverage Requirements

For initial docs completion, each component below must have at least one story with realistic props and one edge state where applicable.

- `Badge`
- `Button`
- `Card`
- `Chip`
- `ChipGroup` / `FilterBar`
- `CornerDots`
- `DataList`
- `EntityLogo`
- `GaugeStrip`
- `Input`
- `KpiBand`
- `LiveDot`
- `Metric`
- `PageHead`
- `PanelHead`
- `RankRow`
- `SectionHead`
- `SourcePip`
- `StatStrip`
- `TabBar`
- `VerdictRibbon`

## Mapping From Design-Lab

Use `src/app/design-lab/primitives/page.tsx` as the source of truth for first-pass story examples:

- Chrome: `CornerDots`, `LiveDot`, `PanelHead`
- Filters: `Chip`, `ChipGroup`, `FilterBar`, `TabBar`
- Data display: `SourcePip`, `GaugeStrip`, `KpiBand`, `RankRow`, `VerdictRibbon`

Non-`ui` components shown there (funding/tools/alerts/repo-detail) should be documented after the `ui` set is complete.

## Definition of Done

- Storybook runs locally and all required `ui` stories render.
- Each required component has at least one `Default` story.
- Components with clear variants include explicit variant stories (`tone`, `state`, or empty/loading variants).
- Internal reviewers can validate parity by comparing stories to `/design-lab/primitives`.

## Verification Commands

Run these commands once Storybook is wired:

```bash
npm run storybook
npm run build-storybook
```

If scripts are named differently, update this document and keep one dev command plus one static-build command.
