# TrendingRepo Design System — single source of truth

**Status:** Active. Adopted 2026-05-23 from the "Trendingrepo Revive" asset
package. Supersedes every prior visual contract (V1–V5, the slim v6 shell
without atmosphere/fonts, `design/v4/tokens.css`).

**Aesthetic:** Premium open-source intelligence terminal. Dark Void canvas,
Liquid Lava `#ff6b35` accent, Bloomberg-density tabular data, sharp 2-4px
radii, hairline borders, atmospheric depth (radial accent glows + 48px
grid texture + 3px scanlines).

**Pixel-faithful contract** (decision 2026-05-20): every surface implements
what is described here. Visual changes go through this doc first, the
canonical CSS file second, the component third — never the other way
around. If you find yourself wanting to inline a hex value, stop and add
it to the token table here.

---

## 0. Read-order for new contributors

1. This file (top to bottom).
2. [public/shell.css](../public/shell.css) — the canonical stylesheet.
3. [docs/UI-V6-SHELL.md](UI-V6-SHELL.md) — `window.TR.*` runtime API + markup
   contracts (sparklines, clocks, share menus, repo hover popover).
4. [docs/UI-REBUILD-CONTRACT.md](UI-REBUILD-CONTRACT.md) — the data-spine
   surface (lib accessors, API endpoints, Zustand stores) the design plugs
   into.

If a section in this doc contradicts a section in those, this doc wins —
they get updated to match.

---

## 1. Source-of-truth file map

| Concern | Canonical file | Notes |
|---|---|---|
| Tokens (colors, type, radii, motion, layout) | [public/shell.css](../public/shell.css) `:root` block | Loaded by [src/app/layout.tsx](../src/app/layout.tsx) via `<link rel="stylesheet" href="/shell.css">`. Every component reads `var(--token)` — never inline hex. |
| Body atmosphere (gradients + grid + scanlines) | [public/shell.css](../public/shell.css) `body` + `body::before` + `body::after` | Adopted from Trendingrepo Revive. Adds depth without elevation. |
| Tailwind preflight + utilities | [src/app/globals.css](../src/app/globals.css) | `@import "tailwindcss"` only. No `@theme` bindings yet — components reach tokens via `var(--name)` or via shell.css classes. |
| Webfonts | [src/app/layout.tsx](../src/app/layout.tsx) via `next/font/google` | Geist + Geist Mono + Space Grotesk. `--font-geist`, `--font-geist-mono`, `--font-space-grotesk` bound on `<html>`. Shell.css `--font-sans/-mono/-display` chain through these. |
| Icon SVG masters | [public/icons/](../public/icons/) | 132 lucide-style icons, 24×24, 1.5 stroke, currentColor. Source: Trendingrepo Revive `assets/icons/`. |
| Icon React component | [src/components/icon/Icon.tsx](../src/components/icon/Icon.tsx) | Inline-SVG renderer with `name` + `size` props. The only canonical way to render an icon in TSX. |
| Lucide re-export shim | [src/lib/icons.ts](../src/lib/icons.ts) | Backwards-compat alias surface — existing imports keep working while names migrate to `Icon`. Marked `@deprecated` per symbol. |
| Brand marks | [public/brand/](../public/brand/) — `trendingrepo.svg`, `trendingrepo-mark.svg`, `trendingrepo-wordmark.svg` | Picked from the new package. The previous `trendingrepo-mark-{black,white,circle-orange}.svg` files stay for legacy export use; the Sidebar uses the new `trendingrepo.svg`. |
| Source brand logos | [public/brand/sources/](../public/brand/sources/) | 24 SVGs (github, openai, anthropic, hf, etc.) sourced from Trendingrepo Revive `assets/logos/`. Used by `MentionSourcePips`, `.logo-chip`, signal headers. |
| Chart theme | [src/lib/charts/theme/](../src/lib/charts/theme/) → ECharts | Series palette + axis colors flow from token vars. |
| Sparkline / MicroBars | [public/shell.js](../public/shell.js) renders DOM-based `.spark[data-points]`; React-side Chart primitives in [src/components/charts/](../src/components/charts/) follow the same color contract. | Two render paths, one color contract — both read `--accent`, `--up`, `--down`, `--info` via CSS vars. |
| Clerk appearance | [src/lib/auth/clerk-appearance.ts](../src/lib/auth/clerk-appearance.ts) | Sourced from this token table. Hex literals there must be kept in sync — preferred: use CSS vars where Clerk's API allows. |

**Forbidden:** inline hex values in TSX/CSS. New tokens land in shell.css
`:root` first, then everyone reads `var(--token)`.

---

## 1.1 Mobile app (`mapp-`) layer

The phone experience is a first-class app shell layered over the same v6 tokens — **not** a new design language. Full contract: [docs/mobile-app/MOBILE-APP-SPEC.md](mobile-app/MOBILE-APP-SPEC.md) + [MOBILE-APP-ROUTE-MATRIX.md](mobile-app/MOBILE-APP-ROUTE-MATRIX.md).

- **Prefix:** every mobile-app class/token is `mapp-`, grouped in one section at the end of [public/shell.css](../public/shell.css). No inline hex, no `--v4-*` (defunct), no Tailwind grayscale (`bg-zinc-*` fails `lint:tokens`).
- **New tokens** (shell.css `:root`, derived only from existing tokens + `env()`): `--mapp-nav-h`, `--mapp-header-h` (`= var(--topbar-h)`), `--mapp-safe-top`/`-bottom` (`= env(safe-area-inset-*)`), `--mapp-content-bottom` (`= var(--mapp-nav-h) + var(--mapp-safe-bottom)`).
- **Components** live in `src/components/mobile/` and style **only** via `mapp-` classes (mirrors the `lint:shell-ds` no-inline-styles rule). Icons via [Icon](../src/components/icon/Icon.tsx) (`name`+`size`), brand via `public/brand/trendingrepo.svg`.
- **Gate:** mounted behind `NEXT_PUBLIC_TRENDINGREPO_MOBILE_APP_V1`; flag-off = desktop + current mobile drawer byte-identical. Breakpoint `≤767.98px`.
- **Safe area:** `<html>` gets `viewport-fit=cover`; the sidebar drawer moves `100vh → 100dvh`. Every fixed mobile surface pads `env(safe-area-inset-*)`.

---

## 2. Color palette

### 2.1 Surfaces — 7-stop Dark Void ramp

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#08090a` | Page canvas (deepest). `<body>` base. |
| `--shell` | `#0b0d0f` | Sidebar background, topbar background, footer background. The "chrome strip" tone. |
| `--surface` | `#101418` | Card body, table row, panel-body default. |
| `--surface-2` | `#151a20` | Hover state on cards/rows, elevated panel content. |
| `--surface-3` | `#1d242b` | Nested panels, input fields, button-secondary fill. |
| `--surface-4` | `#2a323a` | Highest-luminance fill — drop zones, active segmented controls. |
| `--bg-overlay` | `rgba(8,9,10,0.85)` | Modal/cmdk scrim. Combine with backdrop-filter blur. |

### 2.2 Borders — 4-stop hairline ramp

| Token | Hex | Usage |
|---|---|---|
| `--border-subtle` | `#1a2026` | Default panel/card border. Almost invisible — that's correct. |
| `--border` | `#222a32` | Default form input border, table head border. |
| `--border-strong` | `#2f3942` | Hover emphasis on inputs/buttons. |
| `--border-hover` | `#4d5865` | Focus-within / actively hovered border. |

### 2.3 Text — 5-stop slate ramp (revised 2026-05-23 from Revive)

| Token | Hex | Usage |
|---|---|---|
| `--fg-bright` | `#ffffff` | Hero numerics, page H1 emphasis, count-up endpoints. Rare. |
| `--fg` | `#f1f5f9` | Primary body text. Default `color`. |
| `--fg-muted` | `#98a2b3` | Secondary copy — descriptions, breadcrumbs, labels. |
| `--fg-subtle` | `#6b7785` | Tertiary copy — meta strips, captions, helper text. |
| `--fg-faint` | `#4a5562` | Quaternary — disabled-but-readable, separator dots, deep labels. |
| `--fg-disabled` | `#3c444d` | True disabled / placeholder for "no data". |

> **Migration note:** previous shell.css used `#eef0f2 / #b8c0c8 / #84909b / #909caa`. The new slate ramp is colder and reads cleaner on the body atmosphere. Update is global — every surface inherits.

### 2.4 Brand — Liquid Lava

| Token | Value | Usage |
|---|---|---|
| `--accent` | `#ff6b35` | Brand mark, primary CTA, #1 row emphasis, active tab underline, eyebrow dot, focus ring. |
| `--accent-hover` | `#ff8458` | Hover variant for `.btn.primary` and `.btn-primary`. |
| `--accent-dim` | `#c44a1f` | Pressed state, dimmed variant. |
| `--accent-soft` | `rgba(255,107,53,0.14)` | Chip background, pill wash, hover surface. |
| `--accent-wash` | `rgba(255,107,53,0.06)` | Hero radial glow tail, faintest brand tint. |
| `--accent-line` | `rgba(255,107,53,0.32)` | Hairline accent border (hero corner brackets, breakout-flag border). |
| `--accent-glow` | `0 0 0 1px rgba(255,107,53,0.4), 0 0 24px rgba(255,107,53,0.28)` | Composite box-shadow for `.btn-primary:hover` and live `.live-pill`. |

### 2.5 Semantic signals — locked contract (do not repurpose)

| Token | Hex | Meaning |
|---|---|---|
| `--up` (alias `--success`) | `#22c55e` | Positive delta, gain, ARR climber, live OK. |
| `--up-soft` (alias `--success-soft`) | `rgba(34,197,94,0.12)` | Background wash for up chips. |
| `--up-glow` | `rgba(34,197,94,0.18)` | Pulse/ring around live indicators. |
| `--down` (alias `--danger`) | `#ff4d4d` | Negative delta, breakage, error. |
| `--down-soft` (alias `--danger-soft`) | `rgba(255,77,77,0.12)` | Down chip wash. |
| `--warning` | `#ffb547` | Stale/degraded data, warn pill, hot velocity. |
| `--warning-soft` | `rgba(255,181,71,0.12)` | Warn chip wash. |
| `--info` | `#60a5fa` | Neutral info, secondary chart series, steady velocity. |
| `--info-soft` | `rgba(96,165,250,0.10)` | Info chip wash. |
| `--cyan` | `#3ad6c5` | Chart series 3, arXiv source color. |
| `--violet` | `#a78bfa` | Chart series 6, accent tertiary. |
| `--pink` | `#f472b6` | Chart series 7. |

> **Rule:** these meanings are load-bearing. Do not reach for `--up` because something is "good" in a non-delta sense — find or add the right token. `--info` is not "blue", it is "neutral informational signal".

### 2.6 Heat scale — velocity badges + breakout pills (NEW from Revive)

| Token | Hex | Velocity tier |
|---|---|---|
| `--heat-explosive` | `#ff6b35` | `velocity.explosive` — top movers, breakouts. Pulses. |
| `--heat-hot` | `#ffb547` | `velocity.hot` — meaningful acceleration. |
| `--heat-steady` | `#60a5fa` | `velocity.steady` — established growth. |
| `--heat-cool` | `#6b7785` | `velocity.cool` — flat / cold. |

### 2.7 Source brand colors — used by `.spip`, `.signal-row .swatch`, source headers

| Token | Hex | Source |
|---|---|---|
| `--src-github` | `#c8d3df` | GitHub |
| `--src-hackernews` | `#ff7a3d` | Hacker News |
| `--src-x` | `#7aa7ff` | X / Twitter |
| `--src-reddit` | `#ff5a4a` | Reddit |
| `--src-producthunt` | `#da552f` | Product Hunt |
| `--src-bluesky` | `#3aa4ff` | Bluesky |
| `--src-dev` | `#b08bff` | Dev.to |
| `--src-arxiv` | `#5cd6c0` | arXiv (revised — was deep crimson, now teal for legibility on dark) |
| `--src-huggingface` | `#ffd24d` | Hugging Face |
| `--src-npm` | `#ff4d4d` | npm (revised — was registry red, harmonized with `--down`) |
| `--src-lobsters` | `#ac130d` | Lobsters |
| `--src-funding` | `#22c55e` | Funding events (new — was implicit) |

### 2.8 Chart series palette

```css
--series-1: var(--accent);   /* primary */
--series-2: var(--up);       /* secondary green */
--series-3: var(--cyan);     /* tertiary teal */
--series-4: var(--warning);  /* warm */
--series-5: var(--down);     /* alert */
--series-6: var(--violet);   /* accent purple */
--series-7: var(--pink);     /* accent pink */
```

ECharts theme bridge in [src/lib/charts/theme/](../src/lib/charts/theme/) must pull from these vars at render time.

---

## 3. Typography

### 3.1 Font families

| Token | Stack | Loaded via | Used for |
|---|---|---|---|
| `--font-sans` | `var(--font-geist), "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif` | `next/font/google` Geist | Body text, buttons, inputs, table cells |
| `--font-mono` | `var(--font-geist-mono), "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace` | `next/font/google` Geist Mono | All numerics (`.mono`, `.tnum`), data tables, KPI values, sidebar labels, meta strips, kbd, status bar |
| `--font-display` | `var(--font-space-grotesk), var(--font-geist), ui-sans-serif, system-ui` | `next/font/google` Space Grotesk | Hero H1, brand wordmark, section H2 emphasis |

**Loading contract:** `next/font/google` is wired in [src/app/layout.tsx](../src/app/layout.tsx). Each font exports `--font-{name}` CSS variable, set on `<html>`. Shell.css `--font-sans/-mono/-display` reference those via fallback chain. If `next/font` is removed, the fallback chain still produces a readable page.

**Forbidden:** `@import url(fonts.googleapis.com/...)` — blocks render, fails CSP, and breaks offline preview. Use `next/font` only.

### 3.2 Type scale

Mockup-extracted, in pixels. Pair caps text with `letter-spacing` tokens.

| Size | Use |
|---|---|
| 9px / 9.5px | Source pip labels, micro-caps |
| 10px | Meta strips, tab counters, status bar |
| 10.5px | Sidebar nav, label-meta, kbd, panel head |
| 11px | Crumbs, kpi-label, ticker |
| 11.5px | Table cells, list rows, repo-meta-row |
| 12px | Default mono body, buttons, breadcrumb |
| 12.5px | Card descriptions, signal-row name, table cell default |
| 13px | Default sans body |
| 13.5px | Repo name in tables, feat-name |
| 14px | Sidebar brand name, larger card titles |
| 16px | Section eyebrows in hero, cmdk input |
| 18px | Section H2 in panels |
| 22px | KPI big numeric |
| 28px | Hero H1 mobile |
| 30px | Page H1 default |
| 38px | Hero H1 desktop, repo-detail hero numeric |

### 3.3 Letter-spacing tokens

| Token | Value | Pair with |
|---|---|---|
| `--t-data` | `0.04em` | Mono numerics, window-picker buttons |
| `--t-meta` | `0.10em` | Section labels, caps body |
| `--t-control` | `0.14em` | UI chrome caps, sidebar groups, table headers |
| Negative tracking | `-0.01em` to `-0.025em` | Display headlines, hero H1, KPI numerics. Hard-coded per element. |

### 3.4 Type utility classes (shell.css)

| Class | Purpose |
|---|---|
| `.mono` / `.num` | Switch to `--font-mono` + `font-variant-numeric: tabular-nums` |
| `.tnum` | Tabular nums only (when font is already mono via context) |
| `.display` | `--font-display` + `letter-spacing: -0.02em` + `weight: 600` |
| `.label-meta` | 10px mono caps, `--t-control`, color `--fg-subtle`, weight 500 |
| `.label-section` | 10.5px mono caps, `--t-meta`, color `--fg-muted`, weight 500 |
| `.kbd` | Fixed 18px pill, mono 10.5px, `--surface-3` fill, `--border` |

### 3.5 OpenType features

```css
body { font-feature-settings: "ss01", "cv11"; }
.mono, .num { font-variant-numeric: tabular-nums; }
```

`ss01` and `cv11` are Geist stylistic sets — single-story `a`, alternate `0`. Locked.

---

## 4. Layout

### 4.1 App shell grid

```
┌──────────┬────────────────────────────────────────────┐
│ sidebar  │ topbar                                     │
│ 232px    │ 56px                                       │
│          ├────────────────────────────────────────────┤
│          │ ticker (32px, optional)                    │
│          ├──────────────────────────────┬─────────────┤
│          │ main canvas                  │ right rail  │
│          │ 1fr                          │ 320px       │
│          │                              │             │
│          ├──────────────────────────────┴─────────────┤
│          │ statusbar (26px)                           │
└──────────┴────────────────────────────────────────────┘
```

| Token | Value | Notes |
|---|---|---|
| `--sidebar-w` | `232px` | (Revised from 240) |
| `--sidebar-w-collapsed` | `64px` | Below 1024px |
| `--rail-w` | `320px` | Right-rail width when present |
| `--topbar-h` | `56px` | Sticky, backdrop-blurred |
| `--ticker-h` | `32px` | Optional global ticker tape |
| `--statusbar-h` | `26px` | Footer status strip |
| Max content width | `1640px` | `.main-inner` max-width, centered |

### 4.2 Breakpoints

| px | Behavior |
|---|---|
| ≥ 1281 | Full grid: sidebar + main + right rail |
| 1024–1280 | Sidebar narrows, rail collapses into main (`grid-template-columns: 1fr`) |
| 768–1023 | Sidebar collapses to 64px icon-rail, drawer toggle visible |
| < 768 | Sidebar becomes off-canvas drawer (transform translate), topbar stacks, statusbar scrolls |
| < 900 | KPI strip drops to 3 cols, featured grid drops to 2 cols, repo table sheds non-essential columns |

### 4.3 Grid + gap conventions

- 4px base spacing scale. Tokens at `2/4/6/8/10/12/14/16/18/20/24/28/32/36/40/48/64` exposed via `--space-N`.
- Default panel padding: `12px 14px` (header), `14px` (body), `9px 14px` (rows).
- KPI strip: `padding: 14px 16px 12px` per cell.
- Main canvas: `padding: 18px 22px 60px`.

---

## 5. Radii + motion + shadows

### 5.1 Radii — sharp terminal feel

| Token | Value | Usage |
|---|---|---|
| `--r-xs` | `2px` | Sidebar items, default chips, source pips, micro-controls |
| `--r-sm` | `3px` | Logo chip, small buttons, segmented control pills |
| `--r-md` | `4px` | Buttons, inputs, search bar, icon buttons |
| `--r-lg` | `6px` | Panels, hero, KPI strip, featured cards, faq items |
| `--r-xl` | `10px` | Modals (rare) |
| `--r-pill` | `99px` | Status dots, live pills, pro-lock |
| `--r-round` | `9999px` | Avatar circles |

### 5.2 Motion

| Token | Value | Usage |
|---|---|---|
| `--motion-fast` (alias `--d-fast`) | `120ms` | Color/background flips, hover state |
| `--motion-base` (alias `--d-base`) | `180ms` | Slide-in, expand/collapse, transform |
| `--d-slow` | `260ms` | Heavy panel reveals |
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Default ease for everything. |
| `--duration-pulse` | `1.6s` | Live-status pulse |
| `--duration-ticker` | `60s` | Global ticker scroll |

Keyframes defined in shell.css: `pulse-live`, `pulse-live-warn`, `tickFlash`, `tape`, `fadeIn`, `slideUp`.

### 5.3 Shadows — luminance not elevation

| Token | Composition | Usage |
|---|---|---|
| `--ring-live` | `0 0 0 3px rgba(34,197,94,0.18)` | Live-dot halo |
| `--ring-focus` | `0 0 0 2px var(--accent), 0 0 0 4px var(--accent-soft)` | Focus-visible outline (custom) |
| `--glow-orange` | `0 0 0 1px rgba(255,107,53,0.4), 0 0 16px rgba(255,107,53,0.35)` | Brand-mark glow, primary button hover |
| `--accent-glow` | `0 0 0 1px rgba(255,107,53,0.4), 0 0 24px rgba(255,107,53,0.28)` | Same family, wider radius |
| `--overlay` | `0 24px 48px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)` | Popover/modal drop |
| Card shadow | none by default | Lift via border luminance, not box-shadow |

---

## 6. Body atmosphere — non-negotiable

Defines the premium-terminal feel. Three layers, all on `<body>` via shell.css:

### Layer 1 — radial accent glows

```css
body {
  background:
    radial-gradient(900px 600px at 12% -8%, rgba(255, 107, 53, 0.07), transparent 60%),
    radial-gradient(700px 500px at 92% 4%, rgba(60, 130, 246, 0.05), transparent 60%),
    linear-gradient(180deg, #0a0c0e 0%, #08090a 380px),
    var(--bg);
  min-height: 100vh;
}
```

Top-left orange wash, top-right cool blue wash, settled gradient down to bg.

### Layer 2 — grid texture

```css
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(255,255,255,0.018) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.018) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
  z-index: 0;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%);
}
```

48px grid, opacity 0.018, ellipse-masked so it fades at the edges.

### Layer 3 — scanlines

```css
body::after {
  content: "";
  position: fixed;
  inset: 0;
  background-image: linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px);
  background-size: 100% 3px;
  pointer-events: none;
  z-index: 0;
  opacity: 0.6;
}
```

3px horizontal scanlines at near-invisible opacity. Adds CRT depth without legibility cost.

### Root content wrapper

```css
#root, .app { position: relative; z-index: 1; }
```

Keeps content above the two pseudo-element overlays.

**Do not remove the atmosphere layers under "performance" pretenses.** They cost nothing and define the brand.

---

## 7. Component primitives

Every primitive below has a canonical shell.css class. React components map 1:1 — never invent a new class name when one exists.

### 7.1 Layout chrome

| Primitive | Class | File | Notes |
|---|---|---|---|
| App shell grid | `.app` | shell.css §App shell | Sets `display: grid` + the named-area layout |
| Sidebar | `.sidebar` + `.sidebar-brand` + `.sidebar-group` + `.sidebar-group-title` + `.sidebar-item` + `.sidebar-footer` | shell.css §Sidebar | Sticky, gradient bg, scrollable |
| Topbar | `.topbar` + `.topbar-breadcrumb` + `.search-input` + `.topbar-actions` + `.icon-btn` | shell.css §Top bar | Backdrop-blurred, 56px, sticky |
| Ticker | `.ticker` + `.ticker-tape` + `.tick` | shell.css §Ticker | Optional, 32px, 60s scroll |
| Status bar | `.statusbar` + `.seg` + `.dot` | shell.css §Status bar | Mono caps, 26px |
| Main canvas | `.main` + `.main-inner` | shell.css §Main canvas | Max 1640px, 18px 22px 60px padding |
| Right rail | `.rail` + `.panel` + `.panel-head` + `.panel-body` | shell.css §Right rail | 320px column, panel cards |

### 7.2 Cards + panels

| Primitive | Class | Composition |
|---|---|---|
| Default card | `.card` + `.card-head` + `.card-title` + `.card-body` | `--surface` fill, `--border-subtle`, `--r-lg`, `card-head` is uppercase mono caption |
| Hero | `.hero` + `.hero-eyebrow` + `.hero h1` + `.hero p` + `.hero-meta` | Radial-gradient bg + corner-bracket pseudo-elements at top-left + bottom-right via `--accent-line` |
| Panel | `.panel` + `.panel-head` + `.panel-body` | Right-rail container; head has uppercase mono title, slash-prefixed |
| KPI strip | `.kpis` + `.kpi` + `.kpi-label` + `.kpi-row` + `.kpi-value` + `.kpi-delta` + `.kpi-spark` | 6-col grid, `border-right` between cells, sparkline below value |
| Featured grid | `.featured` + `.feat-card` + `.feat-rank` + `.feat-head` + `.feat-avatar` + `.feat-name` + `.feat-desc` + `.feat-bottom` + `.feat-stat` | 3-col breakout cards with left accent rail (gradient pseudo-element) |
| FAQ | `.faq-list` + `.faq-item` + `.faq-q` + `.faq-a` + `.faq-a-inner` | Accordion, chevron rotates on `.open`, dashed inner border |
| Footer | `.footer` + `.footer-inner` + `.footer h5` + `.footer-bottom` | 5-col grid (`2fr 1fr 1fr 1fr 1fr`), 280px brand block, mono small text |

### 7.3 Tables

| Primitive | Class | Notes |
|---|---|---|
| Data table | `.tdata` + `thead th` + `tbody td` + `td.num` | Tabular nums via `var(--font-mono)`, sticky `thead`, hover row gets `inset 3px 0 0 var(--up)` |
| Repo table | `.repo-table` + `.repo-row` + `.repo-row.head` + `.repo-rank` + `.repo-name-cell` + `.repo-avatar` + `.repo-name-row` + `.repo-desc` + `.repo-meta-row` | 7-col grid (`36px 1fr 130px 110px 110px 130px 80px`), hover gets green inset rail |
| Signal stack | `.signal-stack .src` + `.signal-stack .more` | Overlapping 18px source chips, `-3px` margin-left, `--shell` border for separation |

### 7.4 Buttons + controls

| Primitive | Class | Default state |
|---|---|---|
| Default button | `.btn` | 30px height, 12px x-padding, sans 12px medium |
| Primary | `.btn.primary` / `.btn-primary` | `--accent` fill, `#08090a` text, `--accent-glow` on hover |
| Ghost | `.btn.ghost` / `.btn-ghost` | Transparent, `--border` outline |
| Secondary | `.btn-secondary` | `--surface-3` fill, hover `--surface-4` |
| Icon button | `.icon-btn` | 30×30 square, `--border` outline |
| Tab bar | `.tabs` + `.tab` + `.tab.active` + `.tab-count` | Active gets `--surface-3` fill + `border-bottom: 2px solid var(--accent)` |
| Segmented | `.segmented` + `.segmented button` + `.segmented .on` | Mono caps, time-range picker etc. |
| Window picker | `.window-picker` + `.window-picker button.active` | Variant of segmented for `1h / 24h / 7d / 30d / ALL` |

### 7.5 Pills, chips, badges

| Primitive | Class |
|---|---|
| Default chip | `.chip` (mono, `--surface-2` fill, `--border-subtle`) |
| Semantic chip | `.chip.up` / `.chip.dn` / `.chip.warn` / `.chip.info` / `.chip.accent` / `.chip.solid` |
| Tag | `.tag` + `.tag.brand` + `.tag.up` |
| Velocity | `.velocity.explosive` + `.velocity.hot` + `.velocity.steady` (+ `.velocity .dot`) — explosive pulses |
| Breakout flag | `.breakout-flag` (orange mono pill) |
| Live pill | `.live-pill` (success-soft, mono) |
| Pro lock | `.pro-lock` + `.pro-lock.team` |
| Freshness pip | `.fresh.fresh-live` / `.fresh-warm` / `.fresh-cool` / `.fresh-cold` — see §10 |

### 7.6 Mention + source primitives

| Primitive | Class | Notes |
|---|---|---|
| Mention cell | `.mention-cell` + `.mc-count` + `.mc-unit` | Inline-flex right-aligned, count + uppercase unit |
| Source pip strip | `.source-pips` + `.spip.{source}` + `.spip-more` + `.spip-count` | 14px logo squares with `data-density="0..3"` opacity ramp |
| Single source mark | `.smark.{source}` | 16px logo chip with brand color |
| Logo chip | `.logo-chip` (+ `.sm`, `.lg`, `.xl`) | Square chip with rounded corner, `--bg-fill` background, used for source-tagged inline logos |

### 7.7 Charts

| Primitive | Class / component | Notes |
|---|---|---|
| Sparkline (DOM) | `.spark[data-points]` (+ `.spark.up` / `.spark.dn` / `.spark.muted`) | `shell.js` renders SVG with line + area + endpoint circle |
| Sparkline (React) | `<Sparkline data={...} color={...} />` in [src/components/charts/](../src/components/charts/) | Same color contract, used inside `.kpi-spark` cells |
| MicroBars | `<MicroBars data={...} />` | Bar chart with opacity-by-value, used inline in tables |
| ECharts shell | `.chart-shell` (+ `.axis`, `.gridline`, `.baseline`, `.area`, `.line`, `.marker`, `.marker-label`) | For hero charts via [src/components/charts/EChart.tsx](../src/components/charts/EChart.tsx) and [src/lib/charts/theme/](../src/lib/charts/theme/) |
| Momentum bar | `.mom-cell` + `.mom-bar` + `.mom-fill` + `.mom-num` | Gradient fill `info → success → warning → accent`, used in repo table |
| Delta | `.delta.up` + `.delta.down` + `.delta.flat` + `.delta .arr` | Mono tabular, arrow glyph at 9px |

### 7.8 Command palette + modals

| Primitive | Class |
|---|---|
| Scrim | `.cmdk-overlay` (backdrop blur + `--bg-overlay`) |
| Container | `.cmdk` (640px max, accent-glow shadow) |
| Input | `.cmdk-input-wrap` + `.cmdk-input` + `.kbd` |
| Results | `.cmdk-results` + `.cmdk-group-title` + `.cmdk-item` (+ `.selected`) |
| Footer | `.cmdk-footer` + `.cmdk-footer .pair` |

### 7.9 Helpers

`.row`, `.col`, `.between`, `.grow`, `.gap-{2,3,4,6}`, `.muted`, `.faint`, `.bright`, `.up-text`, `.dn-text`, `.warn-text`, `.accent-text`, `.eyebrow`, `.divider` (+ `.v`), `.empty`, `.grid`, `.g-{2,3,4,cards}`, `.live-dot` (+ `.live` / `.warn` / `.cold`).

---

## 8. Icon system

Single source of truth: 132 lucide-style SVGs in [public/icons/](../public/icons/). 24×24 viewBox, 1.5 stroke, `stroke="currentColor"`, fill `none` (or `currentColor` for filled variants like `bookmark-fill`, `star-fill`, `circle-fill`).

### 8.1 Three usage modes

1. **React (default):**
   ```tsx
   import { Icon } from "@/components/icon/Icon";
   <Icon name="trending-up" size={14} />
   ```
   Inline SVG. Inherits color via `currentColor`. The only canonical TSX usage.

2. **CSS mask (when you need a pseudo-element or background):**
   ```html
   <span class="ico-mask ico-trending-up" style="background: var(--accent)"></span>
   ```
   Defined in `public/icons.css` (planned import). Color via `background-color`.

3. **Raw `<img>` (when color tinting isn't needed):**
   ```html
   <img src="/icons/trending-up.svg" class="ico" />
   ```
   Cheapest. Can't be color-tinted.

### 8.2 Size scale

| Class | px | Use |
|---|---|---|
| `.ico-xs` | 10 | Inside micro-pills |
| `.ico-sm` | 12 | Sidebar children, table action buttons |
| `.ico` | 14 (default) | Default UI |
| `.ico-md` | 16 | Sidebar parents, hero meta pairs |
| `.ico-lg` | 20 | Hero icons, empty-state glyphs |
| `.ico-xl` | 24 | Modal headers |
| `.ico-2xl` | 32 | Marketing surfaces |

### 8.3 Migration from lucide-react

- [src/lib/icons.ts](../src/lib/icons.ts) becomes a re-export shim mapping every previously-imported lucide symbol to the matching `Icon` name. Marked `@deprecated` per export.
- `lucide-react` stays in `package.json` until callsites are migrated (mechanical) — then removed.
- Direct `import { Foo } from "lucide-react"` is forbidden in new code.

### 8.4 Available icon names

(132 total — full list mirrors `public/icons/*.svg`. Notable groups:)

- **Arrows**: `arrow-{up,down,left,right,up-right,down-right}`, `chevron-{up,down,left,right}`, `caret-{up,down}`, `triangle-{up,down}`
- **Charts/data**: `bar-chart`, `line-chart`, `pie-chart`, `activity`, `pulse`, `trending-{up,down,flat,dollar}`, `radar`, `target`, `sparkles`
- **Code/git**: `code`, `terminal`, `command`, `git-{branch,commit,merge,pull}`, `fork`, `diff`
- **Status**: `check`, `check-circle`, `alert-{circle,triangle}`, `info`, `x-circle`, `bell`, `bell-off`, `wifi`, `wifi-off`, `signal`, `broadcast`
- **Brand/UI**: `bookmark`, `bookmark-fill`, `star`, `star-fill`, `flame`, `zap`, `rocket`, `bot`, `cpu`, `wand`, `sparkles`
- **Layout**: `sidebar`, `columns`, `grid`, `layers`, `maximize`, `minimize`, `expand`, `shrink`
- **I/O**: `download`, `upload`, `share`, `copy`, `external`, `link`, `unlink`, `send`, `mail`
- **People**: `user`, `users`, `at`, `key`, `lock`, `unlock`, `shield`
- **Time**: `clock`, `timer`, `calendar`, `history`, `refresh`
- **More**: see [public/icons/](../public/icons/)

---

## 9. Brand assets

### 9.1 TrendingRepo marks

| File | Format | Use |
|---|---|---|
| [public/brand/trendingrepo.svg](../public/brand/trendingrepo.svg) | 32×32, orange gradient + black glyph (arrow + check) | Sidebar brand chip, favicon source, OG card mark |
| [public/brand/trendingrepo-mark.svg](../public/brand/trendingrepo-mark.svg) | 24×24, `currentColor` glyph | Inline marks (footer, doc embeds, anywhere needing recolor) |
| [public/brand/trendingrepo-wordmark.svg](../public/brand/trendingrepo-wordmark.svg) | 220×32, orange chip + "trending.repo" Space Grotesk | Marketing surfaces, email headers, OG card horizontal lockup |
| [public/brand/trendingrepo-mark-white.svg](../public/brand/trendingrepo-mark-white.svg) | Legacy | Email dark-mode override (kept for export use) |
| [public/brand/trendingrepo-mark-black.svg](../public/brand/trendingrepo-mark-black.svg) | Legacy | Print / light-bg exports |
| [public/brand/trendingrepo-circle-orange.svg](../public/brand/trendingrepo-circle-orange.svg) | Legacy | Avatar / social profile picture |

### 9.2 Wordmark treatment

"trending.repo" — lowercase Space Grotesk 600, letter-spacing `-0.5px`, orange `.` separator. Replaces the previous all-caps `TRENDINGREPO` (where `REPO` was orange). Sidebar adopts the new lockup.

```html
<span class="brand-name">trending<span class="dot">.</span>repo</span>
```

```css
.brand-name { font-family: var(--font-display); font-weight: 600; letter-spacing: -0.015em; }
.brand-name .dot { color: var(--accent); }
```

### 9.3 Source brand logos

24 SVGs in [public/brand/sources/](../public/brand/sources/) — one per ingestion source. Use via `<img>` (preserves brand colors) or as `background-image` inside `.logo-chip`. **Never use as `mask-image`** — that strips the colors that define the brand.

Available: `anthropic`, `arxiv`, `bluesky`, `deepseek`, `devto`, `exa`, `github`, `hackernews`, `huggingface`, `langchain`, `microsoft`, `modelcontextprotocol`, `npm`, `obsidian`, `ollama`, `openai`, `producthunt`, `reddit`, `supabase`, `vercel`, `x-twitter`.

### 9.4 Favicon + app icons + OG

| Asset | Source | Generated from |
|---|---|---|
| `/favicon-16.png`, `/favicon-32.png`, `/favicon-48.png` | existing | `trendingrepo.svg` (already correct) |
| `/icon-192.png`, `/icon-512.png`, `/icon-1024.png` | existing | App icon — kept |
| `/apple-touch-icon.png`, `/apple-touch-icon.svg` | existing | iOS icon |
| `/icon-maskable.svg` | existing | PWA maskable icon |
| `/og-card.png`, `/og-card.svg` | needs regeneration | Should use new wordmark + atmosphere; defer to next pass |
| `manifest.json` `theme_color` | **was `#151419`, must be `#08090a`** | Sync with `--bg` |
| `<meta name="theme-color">` in layout.tsx | already `#08090a` | Source-of-truth value |

### 9.5 Forbidden public/ leftovers

**Deleted in foundation pass (2026-05-23):**
- `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` (Next.js scaffolding defaults)
- `public/x-profile.png` (test cruft)

**Kept for now (have live consumers; queue as follow-up):**
- `public/avatar-test.jpg` (488KB) — referenced by [src/components/shell/Topbar.tsx](../src/components/shell/Topbar.tsx) as the default avatar. Replace with Clerk `user.imageUrl` (signed-in) + a small generated placeholder (signed-out) in a follow-up surface pass.
- `public/reference.html` — `/docs` route at [src/app/docs/route.ts](../src/app/docs/route.ts) 307-redirects here. Replace with a real `/docs` page when API portal rebuild lands.

---

## 10. Freshness chrome — honesty contract

**Rule:** every "live" / "FRESH" / "Nm ago" indicator MUST resolve through `classifyFreshness(source, isoTimestamp)` from [src/lib/news/freshness.ts](../src/lib/news/freshness.ts). No hardcoded green dots. No `"LIVE · 5m"` literals.

```tsx
import { classifyFreshness } from "@/lib/news/freshness";
const verdict = classifyFreshness("repos", lastFetchedAt);
// verdict: { status: 'live' | 'recent' | 'stale' | 'cold', minutesAgo, budget }
```

Map verdict → CSS class:
| status | class | dot color |
|---|---|---|
| `live` | `.fresh.fresh-live` + `.live-dot.live` | `--up`, pulses |
| `recent` | `.fresh.fresh-warm` + `.live-dot.warn` | `--warning` |
| `stale` | `.fresh.fresh-cool` + `.live-dot.warn` | `--warning` |
| `cold` | `.fresh.fresh-cold` + `.live-dot.cold` | `--down` |

Source slugs accepted: `repos`, `skills`, `mcp`, `twitter`, `reddit`, `hn`, `bluesky`, `devto`, `lobsters`, `producthunt`, `arxiv`, `huggingface`, `github`, `npm`, `funding`, `x`, `claude`, `openai`.

---

## 11. Design debt — what was wrong (and what's fixed)

| # | Debt | State | Resolution |
|---|---|---|---|
| 1 | Geist / Geist Mono / Space Grotesk referenced everywhere, never loaded — browser fell back to system stack on every paint | **OPEN — fixed by foundation pass** | `next/font/google` wired in layout.tsx; vars exposed on `<html>` |
| 2 | `design/v4/tokens.css` imported via globals.css despite contract saying drop it | **OPEN — fixed by foundation pass** | Removed import; tokens live in shell.css only |
| 3 | `--font-geist` referenced by `clerk-appearance.ts` but undefined → Clerk widgets used wrong font | **OPEN — fixed by foundation pass** | next/font binding defines the var; sync clerk-appearance to read from var or use stack |
| 4 | 66 hex-color occurrences across 12 component files; `MentionSourcePips.tsx` alone has 26 (should pull from `--src-*`) | **OPEN — surface pass** | Migrate to `var(--src-*)` per file |
| 5 | `clerk-appearance.ts` has TOKENS const but writes literal `bg-[#0b0d0f]` in classNames | **OPEN — surface pass** | Switch to CSS vars where Clerk supports; otherwise reference TOKENS const at render |
| 6 | Three different "main bg" values: shell.css `#08090a`, viewport themeColor `#08090a`, manifest.json `#151419` | **OPEN — foundation pass** | manifest.json → `#08090a` |
| 7 | `src/components/layout/{Header,HeaderAccount,SidebarContent,...}` still live despite contract archiving them | **OPEN — surface pass** | Move to `_archive/ui-v4/` |
| 8 | `Sidebar.tsx` uses lucide `<TrendingUp>` for brand mark, not `/brand/trendingrepo.svg` | **OPEN — foundation pass** | Swap to new mark |
| 9 | Topbar search + share icons hardcoded inline SVG, drift from icon system | **OPEN — foundation pass** | Replace with `<Icon name="search" />` and `<Icon name="share" />` |
| 10 | `public/` contains Next.js scaffolding defaults + test cruft (avatar-test.jpg 488KB, reference.html, file/globe/next/vercel/window.svg, x-profile.png) | **OPEN — foundation pass** | Delete listed files |
| 11 | No body atmosphere — flat dark bg without grid/scanlines/radial glows | **OPEN — foundation pass** | Add per §6 |
| 12 | Tailwind has no `@theme` bindings → utilities can't reach token palette, forces `bg-[var(--accent)]` arbitraries | **OPEN — surface pass (optional)** | Optional: add `@theme` block exposing `bg-accent`, `text-fg`, `border-subtle` etc. Most components use shell.css classes — only add if a route genuinely needs Tailwind composition |
| 13 | shell.css is 6412 lines, no domain breakdown | **DEFERRED** | Accept as monolith for now; only split if maintenance becomes painful |

---

## 12. Change rules — how to modify safely

### When you need a new color
1. Add it to shell.css `:root` with a semantic name (`--funding-soft` not `--green-3`).
2. Add a row to the table in §2.
3. Use `var(--name)` in components.
4. Never inline the hex.

### When you need a new font size
1. Use the existing scale in §3.2.
2. If a new size is genuinely needed, add it as a row + justify why in PR.
3. Never use `text-[13.78px]` arbitraries.

### When you need a new component
1. Check §7 first. 90% of patterns are already there.
2. If new, add a shell.css class + a row in §7.
3. The React component name should match the class (PascalCase): `.kpi-strip` → `<KpiStrip>`.

### When you need a new icon
1. Check the 132 in [public/icons/](../public/icons/).
2. If missing, drop the SVG in following the contract (24×24, 1.5 stroke, currentColor), then add to §8.
3. Register in `<Icon>` if using the React renderer.

### When you need a new brand logo
1. Drop in [public/brand/sources/](../public/brand/sources/).
2. Add a source brand color in §2.7 if used as a pip.
3. Add to the source-list constant in [src/lib/sidebar-source-counts.ts](../src/lib/sidebar-source-counts.ts) (or wherever sources are registered).

### Forbidden
- Inline hex in TSX/CSS.
- `@import url(fonts.googleapis.com)`.
- `data-theme="orange"` style theme switchers without a corresponding token-level override. There is exactly one theme right now: Dark Void + Liquid Lava. Adding another requires re-deriving every token.
- Creating a new CSS file under `src/app/` or `src/components/`. CSS lives in shell.css. Component-scoped styles use the existing classes.
- Reading `data/*.json` directly from a page. Use `refreshXFromStore()` + `getX()` per [UI-REBUILD-CONTRACT.md](UI-REBUILD-CONTRACT.md).

---

## 13. Handoff protocol — when new design assets arrive

Mirko drops a package (Figma export, ZIP, folder). The agent receiving it:

1. **Inventory.** List every file. Group: tokens (any `:root` declarations), fonts (`@import url`, font files), icons (SVG), brand (logos), components (CSS classes, JSX/TSX, HTML showcases), data shapes (sample JSON).
2. **Diff against this doc.** What's new? What's changed? What's removed?
3. **Lock the migration approach.** Use AskUserQuestion with crisp options + recommendation — match the model in this doc's writing session (2026-05-23): "Merge in place vs Clean replace vs Dual layer".
4. **Update this doc first.** Token table, type scale, component list, debt log. Reflect the new state before touching code.
5. **Foundation pass.** In one commit (or one PR with sequential commits):
   - Copy assets to `public/` (icons, logos, brand).
   - Wire fonts via `next/font` if changed.
   - Update shell.css tokens.
   - Update body atmosphere if changed.
   - Update `<Icon>` registry.
   - Verify dev server + typecheck.
6. **Surface pass.** Per route, in fresh commits, with visual proof (Playwright screenshot or dev-server check). Order by blast radius: shell (Sidebar/Topbar/Statusbar) → home → repo detail → high-traffic surfaces → tools/admin.
7. **Update §11 (Design debt)** in this doc as each item closes.

**Never** apply a new design asset by directly editing a single component without going through this protocol. That's the scattering Mirko ended with in May 2026 — re-introducing it is a regression.

---

## 14. Migration checklist — current sprint (2026-05-23 Revive adoption)

### Foundation pass (one cohesive commit set)

- [ ] Copy 132 icons from `Trendingrepo Revive/assets/icons/` → `public/icons/`
- [ ] Copy 24 source brand logos → `public/brand/sources/`
- [ ] Copy new `trendingrepo.svg` + `trendingrepo-mark.svg` + `trendingrepo-wordmark.svg` → `public/brand/`
- [ ] Delete `public/{avatar-test.jpg, reference.html, file.svg, globe.svg, next.svg, vercel.svg, window.svg, x-profile.png}`
- [ ] Wire `next/font/google` in `src/app/layout.tsx` for Geist + Geist Mono + Space Grotesk; expose `--font-geist`, `--font-geist-mono`, `--font-space-grotesk` on `<html>` className
- [ ] Update `src/app/globals.css`: remove `@import "../../design/v4/tokens.css"`
- [ ] Update `public/shell.css` `:root`: adopt new text ramp (`--fg`, `--fg-muted`, `--fg-subtle`, `--fg-faint`), add heat scale (`--heat-*`), revise source colors (`--src-arxiv`, `--src-npm`), add `--src-funding`
- [ ] Update `public/shell.css` body: add 3-layer atmosphere (radial glows + grid + scanlines) per §6
- [ ] Fix `manifest.json` `theme_color` → `#08090a`
- [ ] Create `src/components/icon/Icon.tsx` — React component reading from icon registry
- [ ] Update `src/lib/icons.ts` to re-export lucide names as `Icon` calls
- [ ] Update `src/components/shell/Sidebar.tsx`: brand chip uses `/brand/trendingrepo.svg`, wordmark uses `trending<span class="dot">.</span>repo`
- [ ] Update `src/components/shell/Topbar.tsx`: inline search/share SVGs → `<Icon name="search" />` / `<Icon name="share" />`
- [ ] Sync `src/lib/auth/clerk-appearance.ts` `--font-geist` reference + TOKENS in sync with new ramp
- [ ] Run `npm run typecheck` + `npm run lint:guards` clean
- [ ] Boot `npm run dev` on :3023, manual smoke: `/`, `/repo/vercel/next.js`, `/market-signals`, `/tools` — visual proof
- [ ] Update [CLAUDE.md](../CLAUDE.md) "Where to Look First" → add this doc as item 1 of UI work
- [ ] Update [docs/UI-V6-SHELL.md](UI-V6-SHELL.md) header → "for the design contract see DESIGN-SYSTEM.md"

### Surface pass (subsequent commits, one route per commit)

Priority order (highest visibility first):

1. `/` Trending hub (consumes hero + kpi-strip + featured + repo-table + rail)
2. `/repo/[owner]/[name]` (consumes repo hero + kpi-strip + mention-cell + panels)
3. `/market-signals` (consumes signal-row + panels + cross-source feed)
4. `/breakout`
5. `/funding`
6. `/agent-commerce`
7. `/revenue`
8. `/tools/*` (top-10, tier-list, star-history, compare, treemap, watchlist, digest, revenue-estimate)
9. `/ideas` + `/ideas/[id]`
10. `/drop`
11. `/account`
12. `/preview`
13. `/about`, `/pricing`, `/contact`, `/methodology` (low-priority marketing)

Each surface commit:
- Replaces inline hex with `var(--*)` tokens.
- Replaces inline SVG with `<Icon>` calls.
- Replaces hardcoded freshness chrome with `classifyFreshness()`-driven classes.
- Adds visual proof (dev-server screenshot or Playwright shot) in PR description.

### Followups (separate sprint)

- Add `@theme` block to globals.css if Tailwind utility composition is needed beyond the current shell.css class coverage.
- Move legacy `src/components/layout/{Header,HeaderAccount,*}` to `_archive/ui-v4/`.
- Regenerate `og-card.png` with new wordmark + atmosphere.
- Split shell.css into domain modules (`shell.tokens.css` + `shell.layout.css` + `shell.primitives.css` + `shell.tables.css` + `shell.charts.css`) only if maintenance pain warrants it.

---

## 15. Anti-patterns burned (project memory)

- `data-theme="orange"` on `<html>` is decorative-only right now. Don't wire a theme switcher unless every token has a parallel override defined here.
- ECharts wrappers (`src/components/charts/*Wrapper.tsx`) were archived in 2026-05-19 teardown. Use `EChart.tsx` directly with the theme from [src/lib/charts/theme/](../src/lib/charts/theme/).
- Don't render `.repo-pop` from React — shell.js owns the singleton popover (see [UI-V6-SHELL.md](UI-V6-SHELL.md) §Critical hydration rules).
- Don't SSR `.watch-btn.on` or `.nav-link.active` without matching Zustand state — hydration mismatch.
- Don't strip `data-rendered="1"` from sparklines — shell.js sets it after first paint to skip work on re-render.
- Don't restore the archived legacy chrome (`_archive/ui-v4/src/components/layout/Header.tsx` etc.). The v6 shell + this design system replace all of it.

---

**Last revised:** 2026-05-23, Revive adoption.
**Maintainers:** every contributor touching UI. The doc owns the contract; the doc gets updated when the contract changes.
