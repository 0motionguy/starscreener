# DESIGN FUSION — Node/01 × Linear

V2 design system for TrendingRepo. Live preview at `/v2`. The current
landing at `/` is unchanged.

## What this is

A fusion of two reference systems applied to the existing TrendingRepo
information architecture:

- **Node/01** (`Designsystem test-handoff/designsystem-test/project/Design System.html`) —
  Claude-Design "operator-grade" system. Dark dot-field canvas, lime
  accent reserved for the active node, Geist + Geist Mono, sharp 0–4px
  radii, hairline borders, terminal blocks, spider/network SVGs,
  bracket selection markers, ASCII pattern, mono labels with `//` and
  `→` prefixes. Voice: operator-grade, direct, lowercase commands,
  numbers with units.
- **Linear** (`Desktop/DESIGN-linear.app.md`) — dark-mode-native,
  Inter Variable with cv01/ss03, signature 510 weight, aggressive
  negative letter-spacing on display sizes, brand indigo, luminance-
  stacked surfaces (no shadows on dark — backgrounds step
  0.02 → 0.04 → 0.05), semi-transparent white borders, 8px grid.

**The fusion:** Linear gives us the clean shapes, restrained palette,
and typographic precision. Node/01 gives us the scanning environment —
dot-field, brackets, terminal chrome, ASCII textures, spider node
graphs. Result: a Linear-quality marketing surface where the page
itself reads like an instrument the visitor is operating.

## Brand decision

The Liquid Lava orange (`#f56e0f`) **stays.** Node/01's reference
uses lime, but the fusion is about *discipline*, not the literal color.
Orange is now the "one bright node" — reserved for the active object
on each section (top idea, top repo, current breakout, focused stat).
It is no longer applied decoratively.

The functional green (`#22c55e`) stays for status/up. Lime is not
introduced.

## Files

```
src/app/v2/
  layout.tsx              # Geist + Geist Mono fonts, .v2-root wrapper
  page.tsx                # V2 landing — server component, real data

src/components/today-v2/
  HeroV2.tsx              # Display headline, spec card, spider node, stat tiles
  ActivityStripV2.tsx     # 4 stage cards, bracket markers on highest-energy stage
  TabsV2.tsx              # Sticky scroll-anchor tabs (client)
  IdeasRepoSplitV2.tsx    # Ideas (left) + Repos (right) — same shape as TodayHero
  IdeaCardV2.tsx          # Featured (rank 1) gets brackets
  RepoCardV2.tsx          # Featured (rank 1) gets brackets
  SignalRadarV2.tsx       # Wraps existing BubbleMap with terminal-bar chrome
  LaunchSectionV2.tsx     # Stat tiles + repo cards + barcode ticker
  AsciiInterstitial.tsx   # ASCII texture divider, decorative restraint

  primitives/
    TerminalBar.tsx       # Three-dot live indicator + mono caption + status
    BracketMarkers.tsx    # 4-corner Sentinel-style selection markers
    MonoLabel.tsx         # `// LABEL` mono operator label
    BarcodeTicker.tsx     # Industrial barcode + edge labels
    SpiderNode.tsx        # SVG hero illustration — center node + 8 peripherals

src/app/globals.css
  --v2-* tokens           # Added inside @theme, additive only
  .v2-root, .v2-canvas    # Background + dot-field
  .v2-frame, .v2-card     # Container + surface
  .v2-term-bar, .v2-bracket  # Chrome primitives
  .v2-display, .v2-h1, .v2-h2  # Type ramp
  .v2-btn, .v2-tag, .v2-stat   # Components
  .v2-ticker, .v2-barcode      # Industrial motifs
  .v2-ascii                    # ASCII texture utility

DESIGN-FUSION-README.md   # this file
```

## Tokens (excerpt)

```css
/* Surfaces */
--v2-bg-000: #08090a;   /* page canvas */
--v2-bg-050: #0d0f10;   /* card */
--v2-bg-100: #13161a;   /* well */
--v2-bg-200: #1a1e23;   /* hover */
--v2-bg-300: #23282e;   /* stroke / raised */

/* Hairlines */
--v2-line-100: #1c2024;
--v2-line-200: #272c33;
--v2-line-300: #363c44;
--v2-line-400: #4a5159;

/* Ink ramp */
--v2-ink-000: #ffffff;
--v2-ink-100: #e6e7e8;
--v2-ink-200: #aab0b6;
--v2-ink-300: #7d848c;
--v2-ink-400: #565d65;
--v2-ink-500: #3a4047;

/* Accent — Liquid Lava */
--v2-acc:      #f56e0f;
--v2-acc-soft: rgba(245,110,15,0.14);
--v2-acc-glow: rgba(245,110,15,0.45);

/* Type */
--v2-tracking-display: -0.035em;
--v2-tracking-h1:      -0.022em;
--v2-tracking-mono:    0.18em;
```

## Principles (the four rules)

1. **Field first.** A grid of dots is the canvas. Composition reveals
   itself only where the cursor goes.
2. **One bright node.** Liquid Lava is reserved for the active object.
   Never for accent or decoration.
3. **Operator language.** Mono labels. Tags with `→` arrows. The
   product narrates itself like a shell. No exclamation marks.
   Lowercase commands.
4. **Sharp by default.** Hairline borders. 0–4px radius. Pills only
   for binary toggles.

## Voice

```
DO  → rate-limit blocked. 100/30s on ip_default.
DO  → contact sales
DO  → 4.2B threats blocked

DON'T → Oops! Something went wrong 😬
DON'T → Get started today!
DON'T → Trusted by billions
```

## Reusing primitives outside V2

All primitives are pure presentational components. They depend on the
`--v2-*` tokens (which sit in the global `@theme`) and the Geist font
variables (which are scoped to `.v2-root`). To use a primitive on a
non-V2 route:

1. Wrap the section in `.v2-root` so Geist resolves.
2. Or load Geist on the route and re-target the primitive's font stack.

The recommended path is to keep V2 contained until the design is
approved, then migrate `/` by replacing `src/app/page.tsx` with the V2
composition.

## Migration path (when ready to ship to /)

1. Approve V2 visually at `/v2`.
2. Move `src/app/v2/layout.tsx`'s Geist loaders up into the root
   `src/app/layout.tsx`.
3. Replace the body of `src/app/page.tsx` with the body of
   `src/app/v2/page.tsx`.
4. Delete `src/app/v2/` (or keep as a permalink for the design
   reference).
5. Delete `src/components/today/*` (the original Today components) if
   not used elsewhere — `git grep` the old component names first.
6. Remove the `--v2-` prefix from tokens (or keep the prefix to make
   the design system inheritable as a theme).

## Verification

```
npm run dev          # http://localhost:3023/v2
npm run build        # confirm no TS errors
```

Visual diff against the reference HTML at
`Designsystem test-handoff/designsystem-test/project/Design System.html`.
