# STARSCREENER design system

V3 is the production skin: a Node/01 x Linear fusion. Dark canvas, sharp 2px
corners, hairline frames, mono uppercase labels, accent reserved for the
focused object. New work targets `--v3-*` tokens and `.v3-*` utility classes.
The older `--v2-*` names still appear in code; they are aliased to V3 in
`src/app/globals.css` so any partially migrated component inherits the V3
palette automatically. Do not introduce new `--v2-*` references.

This is the onboarding reference. The migration narrative lives in
[V2_HANDOFF.md](./V2_HANDOFF.md). The token vocabulary is defined in
[`src/app/globals.css:222-292`](../src/app/globals.css).

## Token vocabulary

### Surfaces (`--v3-bg-*`)

Six luminance stops. Page background is `bg-000`; cards / panels lift to
`bg-050`; row hover and chips sit at `bg-100`. Don't reach above `bg-200`
without a reason — depth is structural, not decorative.

| Token        | Dark hex  | Usage                                  |
| ------------ | --------- | -------------------------------------- |
| `--v3-bg-000`| `#08090a` | Page canvas, app shell                 |
| `--v3-bg-025`| `#0b0d0f` | Card-header strips, terminal eyebrows  |
| `--v3-bg-050`| `#101418` | Panels, cards, chrome                  |
| `--v3-bg-100`| `#151a20` | Row hover, neutral chip background     |
| `--v3-bg-200`| `#1d242b` | Elevated surfaces, drawer interior     |
| `--v3-bg-300`| `#2a323a` | Separator surfaces, dense chip clusters|

### Hairlines (`--v3-line-*`)

Borders are 1px and pure hairline. `line-100` is the default panel edge,
`line-200` is the standard frame, `line-300+` is reserved for hover/active
emphasis.

| Token              | Dark value                | Usage                       |
| ------------------ | ------------------------- | --------------------------- |
| `--v3-line-soft`   | `rgba(255,255,255,0.045)` | Inset shadows, dashed seams |
| `--v3-line-std`    | `rgba(255,255,255,0.08)`  | Card frames over dark bg    |
| `--v3-line-100`    | `#1b2229`                 | Inner section dividers      |
| `--v3-line-200`    | `#29323b`                 | Default panel border        |
| `--v3-line-300`    | `#3a444f`                 | Hover frame, ghost button   |
| `--v3-line-400`    | `#4d5865`                 | Active frame, focus ring    |

### Ink (`--v3-ink-*`)

Five-stop ramp. Body copy MUST use `ink-100` or `ink-200`. `ink-400` is the
deepest mute that still passes WCAG AA — the 2026-04-27 audit lifted it from
`#59636d` (3.26:1 vs `bg-000`, fails) to **`#7a8694` (5.38:1 vs `bg-000`,
4.99:1 vs `bg-050`, passes AA)**. Below `ink-400` is decorative-only.

| Token            | Dark hex  | Usage                              |
| ---------------- | --------- | ---------------------------------- |
| `--v3-ink-000`   | `#ffffff` | Primary copy on accent / hero      |
| `--v3-ink-100`   | `#eef0f2` | Default body                       |
| `--v3-ink-200`   | `#b8c0c8` | Secondary copy                     |
| `--v3-ink-300`   | `#84909b` | Tertiary, mono labels              |
| `--v3-ink-400`   | `#7a8694` | Muted body (AA floor)              |
| `--v3-ink-500`   | `#3c444d` | Decorative-only, never body text   |

### Accents (`--v3-acc*`)

The accent is themeable. The default is **Indigo `#9297f6`**. The five
production accents (Lava, Indigo, Lime, Cyan, Magenta) live in
[`src/components/v3/themes.ts`](../src/components/v3/themes.ts); the picker
writes the choice to `localStorage["trendingrepo-v3-accent"]` and rewrites
`--v3-acc / -hover / -dim / -soft / -glow` plus the legacy `--v2-acc*` and
`--color-brand*` aliases via `DesignSystemProvider`.

| Token              | Default value (Indigo)         | Usage                          |
| ------------------ | ------------------------------ | ------------------------------ |
| `--v3-acc`         | `#9297f6`                      | Active tab, focused frame, CTA |
| `--v3-acc-hover`   | `#a8acf8`                      | Hover state of `--v3-acc`      |
| `--v3-acc-dim`     | `#555bd8`                      | Pressed state, accent-on-accent|
| `--v3-acc-soft`    | `rgba(146,151,246,0.14)`       | Tinted fills, soft pills       |
| `--v3-acc-glow`    | `rgba(146,151,246,0.45)`       | Outer glow on primary buttons  |

Reserve the accent for the focused object only: active tab, top-rank hero
card, focused row, primary CTA. Do not flood entire panels with accent — the
chrome should carry visual weight via luminance + hairline, not color.

### Signal palette (`--v3-sig-*`)

Sentiment / freshness signals only. Never use these for chrome.

| Token             | Hex       | Usage                   |
| ----------------- | --------- | ----------------------- |
| `--v3-sig-green`  | `#22c55e` | Up, positive, healthy   |
| `--v3-sig-amber`  | `#ffb547` | Warning, mid-tier heat  |
| `--v3-sig-red`    | `#ff4d4d` | Down, error, alert      |
| `--v3-sig-cyan`   | `#3ad6c5` | Info, neutral signal    |

Note the amber drift: V1 shipped `#f59e0b` which read as orange against the
brand color and lost legibility on `bg-000`. V3 is `#ffb547`.

## Utility classes

Defined in [`src/app/globals.css:1304-1477`](../src/app/globals.css). Each
class is small, stable, and additive — never inject your own surface
gradients when one of these exists.

| Class                | Purpose                                                          | Use when                                              | Don't use when                                  |
| -------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `.v3-root`           | App-shell wrapper. Sets every `--color-*` Tailwind token to V3.  | The root of a V3 page or shell.                       | Inside an existing `.v3-root` (already covered).|
| `.v3-chrome`         | Header / toolbar surface (gradient + bottom hairline).           | Sticky page chrome.                                   | A floating panel — use `.v3-panel`.             |
| `.v3-panel`          | Card / panel — gradient bg, 1px frame, 2px corners.              | Default card frame.                                   | Inline-block badges (use `.v3-tag`/CategoryPill).|
| `.v3-button`         | Ghost button — mono uppercase, hairline frame, 36px tall.        | Secondary actions.                                    | Primary CTA (use `.v3-button-primary`).         |
| `.v3-button-primary` | Filled accent button + glow.                                     | The single primary action on a screen.                | Multiple times per screen — accent is scarce.   |
| `.v3-label`          | 9px mono uppercase label, `ink-400`.                             | Field labels, axis labels, micro-eyebrows.            | Body or interactive text (too small for AA).    |
| `.v3-wordmark`       | 12px mono uppercase, `ink-100`.                                  | Brand tag, system mark, sidebar titles.               | Long strings — designed for short identifiers.  |
| `.v3-swatch`         | Square swatch button — used by Bg / Accent pickers.              | Color / theme pickers.                                | Generic toggles.                                |
| `.v3-cursor-rail`    | Pointer-tracking horizontal hover rail. See `CursorRail.tsx`.    | Sidebar nav, dense lists.                             | Tables (handled by `row-hover`).                |
| `.v3-barcode-wrap`   | 3-column grid for barcode + label flank. Used by `SystemBarcode`.| Status / version strips.                              | Anywhere else — it's pattern-specific.          |

## Component vocabulary

Every V3 surface is built from four repeating patterns. Reference the cited
files when building a new one.

**Terminal-bar headers.** Mono uppercase, 9-11px, three small color squares
(accent + 2 hairline) on the left, `// SECTION · STATUS` text, optional
right-aligned tabular-nums status. Reference:
[`src/components/news/NewsTopHeaderV3.tsx:259-294`](../src/components/news/NewsTopHeaderV3.tsx)
(`CardHeader`).

**Hero feature cards.** `CardShell` with four 5px accent squares pinned at
the corners. Top-rank slot gets `inset 3px 0 0 var(--v3-acc)` left rail and
the FEATURED tag; ranks 2-3 fall back to `--v3-line-300` corners and `#02 /
#03` labels. Reference:
[`src/components/news/NewsTopHeaderV3.tsx:191-256`](../src/components/news/NewsTopHeaderV3.tsx).

**Bar charts.** Left-rail 56px label column (mono uppercase, truncate),
flexible bar fill normalized against `Math.max(...values)`, right-rail
tabular-nums count, optional secondary hint column hidden on `<sm`. Bars
get a `${color}33` glow when nonzero. Reference:
[`src/components/news/NewsTopHeaderV3.tsx:378-477`](../src/components/news/NewsTopHeaderV3.tsx).

**Status / category pills.** 2px corners, mono uppercase, color-coded 1.5x1.5
square dot in the left rail. Two variants: `default` (hairline frame,
`ink-200` text, dot carries dataset color) and `brand` (accent-soft fill,
accent border, accent dot with glow). Reference:
[`src/components/shared/CategoryPill.tsx`](../src/components/shared/CategoryPill.tsx).

## Background themes

Five `html[data-bg-theme]` palettes ride above the accent. The picker
([`BgThemePicker.tsx`](../src/components/v3/BgThemePicker.tsx)) writes
`localStorage["trendingrepo-v3-bg"]` and toggles the attribute; globals.css
overrides `--v3-bg-*`, `--v3-line-*`, and (for light themes) `--v3-ink-*`.

| `data-bg-theme` | Family | Mood                                | Defined in `globals.css`         |
| --------------- | ------ | ----------------------------------- | -------------------------------- |
| (default)       | dark   | Void `#08090a` — Linear black       | `:root` block, lines 222-292     |
| `graphite`      | dark   | Cool blue-leaning `#0c0c12`         | lines 305-337                    |
| `charcoal`      | dark   | Neutral `#14141c`                   | lines 339-371                    |
| `slate`         | dark   | Warm-gray dashboard `#1a1a1f`       | lines 376-408                    |
| `creme`         | light  | Warm dark + flipped creme ink ramp  | lines 413-486, 564-582           |
| `linen`         | light  | Soft beige paper, flipped ink       | lines 491-562, 587-629           |

The dark themes share the standard ink ramp. **`creme` and `linen` flip the
ramp** — `--v3-ink-000` becomes near-black, `--v3-ink-400` becomes a warm
mid-tan, and the brand `--color-brand` is darkened for AA. Linen also
flattens the surface ramp so sidebar/header/main share one cream tone;
structure comes from hairlines, not luminance.

## Anti-patterns / what V1 looked like

If you see this in a diff, replace it with the V3 form.

| V1 / legacy                        | V3 replacement                              |
| ---------------------------------- | ------------------------------------------- |
| `rounded-full`, `rounded-xl` chrome| `rounded-[2px]` (live dots are the only exception) |
| `shadow-card` on a dark surface    | none — let `bg-050` over `bg-000` carry depth |
| `bg-bg-card border-border-primary` | `var(--v3-bg-050)` + `var(--v3-line-200)`   |
| `text-up`, `text-warning`          | `var(--v3-sig-green)`, `var(--v3-sig-amber)`|
| `bg-functional`, `text-functional` | `var(--v3-acc)` if focus, `--v3-sig-green` if signal |
| Emoji icons in chrome              | mono uppercase + color-coded square dot     |
| Arbitrary hex (`#7a8694` inline)   | `var(--v3-ink-400)` — never inline tokens   |

## Doing it right — checklist for new components

1. **Sharp 2px corners.** `rounded-[2px]` or `border-radius: 2px`. Live
   dots and accent corners are the only exceptions.
2. **1px hairline borders.** Frames are `var(--v3-line-200)`, hover lifts
   to `--v3-line-300`. No 2px borders, no `box-shadow` chrome.
3. **Mono uppercase + tabular-nums.** Labels use `.v3-label` or `.v2-mono`;
   numeric columns add `.tabular-nums` so digits don't reflow on tick.
4. **Accent reserved for active state.** Top rank, focused tab, primary
   CTA, focused frame. Never decorate.
5. **Reduced-motion is already covered.** The
   `@media (prefers-reduced-motion: reduce)` block in globals.css
   ([line 1099](../src/app/globals.css)) collapses every animation /
   transition to 0.001ms. Don't override it in your component.

## Tools

- `npm run lint:tokens` — fails on grayscale Tailwind regressions
  (`text-gray-*`, `bg-zinc-*`, etc.) that should be V3 tokens.
- `node scripts/check-v3-token-budget.mjs` — fails when a V1 alias count
  (`bg-up`, `text-functional`, etc.) rises above the baseline in
  `scripts/_v3-token-baseline.json`. Snapshot after a real cleanup with
  `--snapshot`.
- `tests/e2e/json-ld.spec.ts` and the other Playwright smokes — visual
  contract tests (FAQ JSON-LD, TerminalBar, BubbleMap presence). Run via
  `npm test`.

## References

- Tokens: [`src/app/globals.css:222-292`](../src/app/globals.css) (V3 tokens),
  [`:1304-1477`](../src/app/globals.css) (V3 utilities),
  [`:305-629`](../src/app/globals.css) (background themes).
- V3-native components:
  [`src/components/v3/`](../src/components/v3/) — `AccentPicker`,
  `BgThemePicker`, `BgThemes.ts`, `CursorRail`, `DesignSystemProvider`,
  `SystemBarcode`, `SystemMark`.
- Canonical pattern:
  [`src/components/news/NewsTopHeaderV3.tsx`](../src/components/news/NewsTopHeaderV3.tsx)
  — terminal-bar header, snapshot card, bars body, hero feature card.
- Canonical chip:
  [`src/components/shared/CategoryPill.tsx`](../src/components/shared/CategoryPill.tsx).
- Migration narrative & history: [`docs/V2_HANDOFF.md`](./V2_HANDOFF.md),
  [`docs/HANDOFF_2026-04-27_V3.md`](./HANDOFF_2026-04-27_V3.md).
