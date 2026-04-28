# Design System V3

V3 is the production skin for TrendingRepo. It is not the old V2 demo branch.

## Source Of Truth

- Tokens and utilities: `src/app/globals.css`
- Production primitives: `src/components/v3`
- Production shell integration: `src/app/layout.tsx`, `src/components/layout/*`

## Rules

- Use `--v3-*` tokens for new UI.
- Keep `--v2-*` only as compatibility aliases while older components migrate.
- Do not copy pages wholesale from the `3024` demo worktree.
- Borrow only visual behaviors from the demo: accent picker, bracket markers, terminal bars, cursor rail, barcode, dense news cards.
- Keep production data, routes, auth, and API behavior from `main`.

## Accent Themes

The five production accents are Lava, Indigo, Lime, Cyan, and Magenta. The picker writes `trendingrepo-v3-accent` to `localStorage` and updates:

- `--v3-acc`
- `--v3-acc-hover`
- `--v3-acc-dim`
- `--v3-acc-soft`
- `--v3-acc-glow`

The provider also maps those values to legacy `--v2-acc*` and `--color-brand*` variables so partially migrated surfaces inherit the active accent.

## Migration Pattern

1. Keep the current production component.
2. Replace local hardcoded V2 styling with `v3-*` classes and `--v3-*` variables.
3. Keep existing data fetches and route names.
4. Validate with `npm run lint`, `npm run typecheck`, and `npm run build`.
