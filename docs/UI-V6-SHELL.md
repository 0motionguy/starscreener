# UI v6 shell — quick reference

> **For the full design contract (tokens, typography, body atmosphere,
> primitives, icons, brand, charts, change rules) read
> [docs/DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) first.** This file is the
> runtime / markup-contract reference. The design contract supersedes
> anything in this file when they disagree.

**Source files:** [`public/shell.css`](../public/shell.css) +
[`public/shell.js`](../public/shell.js), mounted globally by
`src/app/layout.tsx`. Both are static assets served from `/shell.css`
and `/shell.js`. They are the canonical design system for the UI v6
rebuild that landed 2026-05-19, refreshed 2026-05-23 with the
"Trendingrepo Revive" asset package (new text ramp, body atmosphere,
Geist via `next/font`, 132-icon system, 24 source brand logos, new
`trending.repo` wordmark).

This file is a **plug-in surface contract** for the rebuilt routes —
contributors writing new React components for the v6 shell should treat
these tokens, the `window.TR.*` API, and the markup contracts as load-
bearing. Anything not described here is implementation detail you can
change.

---

## CSS tokens (from `:root` in `public/shell.css`)

The shell uses a small, named, semantic palette — **never** inline a hex
in a component when one of these tokens covers the case.

### Surfaces

| Token | Hex | Purpose |
|---|---|---|
| `--bg` | `#08090a` | Page background (deepest) |
| `--shell` | `#0b0d0f` | Shell / chrome strip background |
| `--surface` | `#101418` | Card / table row background |
| `--surface-2` | `#151a20` | Elevated card, hover state |
| `--surface-3` | `#1d242b` | Nested panels |
| `--surface-4` | `#2a323a` | Highest elevation |

### Foreground (text)

| Token | Hex | Purpose |
|---|---|---|
| `--fg` | `#eef0f2` | Primary text |
| `--fg-bright` | `#ffffff` | Headlines, emphasis |
| `--fg-muted` | `#b8c0c8` | Secondary text |
| `--fg-subtle` | `#84909b` | Tertiary text, captions |
| `--fg-faint` | `#909caa` | Disabled-but-readable |
| `--fg-disabled` | `#3c444d` | True disabled |

### Brand (Liquid Lava)

| Token | Hex | Purpose |
|---|---|---|
| `--accent` | `#ff6b35` | Primary brand accent |
| `--accent-hover` | `#ff8458` | Hover variant |
| `--accent-dim` | `#c44a1f` | Dimmed / pressed |
| `--accent-soft` | `rgba(255, 107, 53, 0.14)` | Background wash |

### Signals

| Token | Hex | Purpose |
|---|---|---|
| `--up` | `#22c55e` | Positive delta (green) |
| `--down` | `#ff4d4d` | Negative delta (red) |
| `--warning` | `#ffb547` | Caution (amber) |
| `--info` | `#60a5fa` | Info (blue) |
| `--cyan` | `#3ad6c5` | Chart series / accent secondary |
| `--violet` | `#a78bfa` | Chart series tertiary |

### Source brand colors (used by `.spip` pips and source headers)

| Token | Hex | Source |
|---|---|---|
| `--src-github` | `#c8d3df` | GitHub |
| `--src-hackernews` | `#ff7a3d` | Hacker News |
| `--src-x` | `#7aa7ff` | X / Twitter |
| `--src-reddit` | `#ff5a4a` | Reddit |
| `--src-producthunt` | `#da552f` | Product Hunt |
| `--src-bluesky` | `#3aa4ff` | Bluesky |
| `--src-dev` | `#b08bff` | Dev.to |
| `--src-huggingface` | `#FFD21E` | Hugging Face |
| `--src-arxiv` | `#b31b1b` | arXiv |
| `--src-npm` | `#cb3837` | npm |
| `--src-lobsters` | `#ac130d` | Lobsters |

---

## `window.TR` — public client API

`public/shell.js` boots automatically (DOMContentLoaded). After boot it
exposes:

```ts
window.TR = {
  renderAllSparks(root?: ParentNode): void,
  formatNum(n: number): string,
  showToast(text: string): void,
  bindShareMenus(): void,
  bindRepoHover(): void,
}
```

- **`window.TR.renderAllSparks(root?)`** — re-scan the DOM (or a
  sub-tree) for `.spark[data-points]` elements and render Catmull-Rom
  SVG sparklines. Already idempotent (skips elements with
  `data-rendered="1"`). Call after React injects new spark markup.
- **`window.TR.formatNum(n)`** — humanizer (`1.2K`, `3.4M`, etc.). Pure
  function; safe in render.
- **`window.TR.showToast(text)`** — bottom-center confirmation. Creates
  / reuses a singleton `.toast` element, auto-hides after 1.8s.
- **`window.TR.bindShareMenus()`** — re-bind any `.share-wrap` containers
  injected after boot.
- **`window.TR.bindRepoHover()`** — re-bind repo hover popovers.
  Singleton `.repo-pop` is owned by shell.js; do not render one from
  React.

---

## Markup contracts

Every shell.js feature triggers off a specific HTML hook. Match these
exactly when authoring React components; the JS is unchanged from the
HTML design source.

### Sparkline

```html
<div class="spark up" data-points="1,2,3,4,5,6,7"></div>
```

- `.spark.up` / `.spark.down` switches stroke + fill color.
- `data-points` is a comma-or-whitespace-separated list of numbers
  (≥2 entries).
- shell.js sets `data-rendered="1"` after first paint so re-renders are
  cheap. React must NOT strip this attribute.

### Live clocks

```html
<span data-clock="utc"></span>
<span data-clock="local"></span>
```

shell.js ticks both every second.

### Counter (one-shot ease-in)

```html
<span data-counter data-target="2400">2400</span>
```

shell.js animates the value from 0 to `data-target` over ~900ms, then
**removes the `data-counter` attribute**. React must not re-add it on
re-render — that would re-trigger the animation every state change.

### Repo hover popover

```html
<a class="repo-link" data-repo-hover data-repo="vercel/next.js">…</a>
```

- Any element matching `[data-repo-hover], .repo-link, .repo-name,
  .repo, .fr-co .name, .rev-row .name, .tracked-card .tc-repo,
  .act-card .repo` triggers the popover.
- shell.js owns the singleton `.repo-pop`. **Do not render
  `.repo-pop` from React.** Doing so creates duplicate popovers that
  fight for the cursor.

### Sidebar drawer (mobile)

```html
<button class="hamburger">…</button>
<!-- or -->
<button data-toggle="sidebar">…</button>
```

Toggles `.sidebar.open`. shell.js also closes the drawer on outside-click.

### Watch button

```html
<button data-watch-toggle>
  <span class="heart">♡</span> Watch
  <span class="meta">12.4K</span>
</button>
```

shell.js toggles `.on`, swaps the label text between `Watch` and
`Watching`, and preserves the `.heart` + `.meta` children. **Do not SSR
`.on` without matching client state** — Zustand `watchlist.has(repo)`
must agree, or the first hydration tick mis-counts.

### Alert config inline reveal

```html
<button data-alert-toggle>Configure alerts</button>
<div data-alert-panel>…</div>
```

shell.js toggles `display: flex` / `none` on the panel.

### Tab switcher

```html
<div data-tabset>
  <button class="tab active" data-tab="repos">Repos</button>
  <button class="tab" data-tab="topics">Topics</button>
</div>
<div data-panel="repos">…</div>
<div data-panel="topics">…</div>
```

shell.js toggles `.active` on the tab + visibility on the panels. The
active panel must match the SSR-rendered active tab; otherwise the first
paint shows the wrong panel.

### Share menu

```html
<div class="share-wrap">
  <button class="share-btn">Share</button>
  <div class="share-menu">
    <div class="item" data-share="x"   data-url="…" data-text="…">X</div>
    <div class="item" data-share="li"  data-url="…">LinkedIn</div>
    <div class="item" data-share="rd"  data-url="…" data-text="…">Reddit</div>
    <div class="item" data-share="bs"  data-url="…" data-text="…">Bluesky</div>
    <div class="item" data-share="cp"  data-url="…">Copy link</div>
    <div class="item" data-share="em"  data-url="…">Embed</div>
    <div class="item" data-share="rss" data-url="…">RSS</div>
  </div>
</div>
```

shell.js handles outside-click to close, intent-share URLs, and
`navigator.clipboard` fallbacks.

---

## Source pip classes (used by `.spip`)

Pips are 8px discs colored by source. The CSS-defined source classes
are:

`github`, `hn`, `x`, `reddit`, `bsky`, `devto`, `ph`, `hf`, `arxiv`,
`npm`, `lobsters`

(`lobsters` lives in `--src-lobsters` even though the matching `.spip`
selector still needs to be added — track that as a follow-up if you
need to render Lobsters pips today.)

Add `.spip.on` to mark a pip as "lit" (active source). shell.js's
`startPipPulse()` then randomly applies `.just-lit` to active pips
every ~3.2s for a live-data feel.

---

## Critical hydration rules

1. **Never SSR `.watch-btn.on` or `.nav-link.active` without matching
   client state.** Zustand hydrates after the first paint; a server-
   rendered "on" state without store agreement causes a flash and
   double-toggle.
2. **shell.js owns the `.repo-pop` singleton popover.** Do not render
   `.repo-pop` from React — duplicate popovers will both fire on
   hover.
3. **`[data-counter]` is removed by shell.js after the animation.** Do
   not React-re-add the attribute on re-render; the value will jump
   back to zero and animate every render cycle.
4. **shell.js auto-re-renders sparklines on `resize`** by clearing
   `data-rendered` and calling `renderAllSparks()`. If you swap a
   `.spark`'s `data-points` from React, call
   `window.TR.renderAllSparks()` after the mutation.
5. **`mergeSourcesIntoMentions()` mutates `table.tdata` headers.** Run-
   once on boot. If you re-render the table from React, you must either
   re-call it via a Mutation Observer or render the merged shape
   directly (a single `.col-mentions` column with `.source-pips` +
   `.mc-count`).
