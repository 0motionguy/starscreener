# Storybook — Component Library Docs

Storybook is set up for the design-system primitives in `src/components/ui/*`.

## Run locally

```bash
npm install
npm run storybook
```

Storybook starts on `http://localhost:6006`.

## Build static site

```bash
npm run storybook:build
```

Outputs a static bundle to `storybook-static/` — deployable to any static
host or to the `/docs/storybook` subpath of the main app.

## Current story coverage

Bootstrap set (AGN-826):

- `UI/Button` — variants, sizes, status dot, active segment
- `UI/Card` — panel / feature / mini variants, active state, header + body
- `UI/Badge` — tones, dot, count, `Chip` pressed state
- `UI/Input` — default, left icon, right slot, disabled
- `UI/LiveDot` — live, stale, down, no-label tones

## TODO — remaining `src/components/ui/*` components

The following primitives still need at least one story each (see issue
AGN-826 acceptance criteria — every UI component has a story):

- `ChartShell`, `Chip` (extend Badge.stories), `ChipGroup`, `ConfirmDialog`,
  `CornerDots`, `DataList`, `EntityLogo`, `FooterBar`, `GaugeStrip`,
  `KpiBand`, `Metric`, `PageHead`, `PanelHead`, `RankRow`,
  `SectionHead`, `ShareExport`, `SourcePip`, `StatStrip`, `TabBar`, `Toaster`,
  `VerdictRibbon`.

Each of these is small enough that a single `Default` story is sufficient
to satisfy the AC.

## Deploying to `/docs/storybook`

Configure your static host (Vercel, Cloudflare Pages, Netlify) to serve
the contents of `storybook-static/` under the `/docs/storybook` subpath.
For Vercel, this is typically a separate deployment with the build
command `npm run storybook:build` and output directory `storybook-static`.
