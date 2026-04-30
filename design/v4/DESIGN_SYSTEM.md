# TRENDINGREPO V4 (CORPUS) — Design System

> **The contract.** Every page in V4 reads from this document and from
> [`tokens.css`](./tokens.css). If a component needs a value not in the
> contract, **stop and add it here first** — never reach into `globals.css`
> or hand-pick a hex.

---

## 0. Scope

V4 covers the customer-facing surface of trendingrepo.com:
- 5 flagship pages (`/`, `/signals`, `/consensus`, `/funding`, `/repo/[owner]/[name]`)
- 13 source-feed pages (`/hackernews/trending`, `/reddit`, `/bluesky/trending`, …)
- 8 ecosystem leaderboards (`/skills`, `/mcp`, `/agent-repos`, …)
- 8 user surfaces (`/watchlist`, `/you`, `/u/[handle]`, `/search`, `/digest`, …)
- 8 tools (`/tools`, `/tools/star-history`, `/tierlist`, `/compare`, `/mindshare`, …)
- 1 new feature (`/alerts`)

V4 does NOT cover internal admin (`/admin/*`), marketing (`/pricing`, `/cli`,
`/demo`, …), or programmatic surfaces (sitemaps, RSS, indexnow). Those get a
mechanical token-alias swap and no redesign.

---

## 1. Visual identity

**Aesthetic anchor:** scanner-grade financial terminal. Bloomberg + Linear +
Node/01 fusion. Dense, restrained, data-first. Decorations earn their pixels.

**Defaults to reach for:**
- Mono for everything that looks like data (numbers, IDs, timestamps, table
  cells, panel chrome, sidebar nav).
- Sans for prose (page H1, deck copy, card descriptions).
- Square corners. Pills only for status dots and sidebar nav badges.
- Hairline 1px borders in `--v4-line-100` to `--v4-line-300`.
- Color earned, not given — Liquid Lava orange (brand) and money green
  (delta-up) are the only two saturated colors that should appear above the
  fold without justification.

---

## 2. Tokens

See [`tokens.css`](./tokens.css) for the canonical list. Categories:

| Category | Prefix | Example |
|---|---|---|
| Surfaces | `--v4-bg-*` | `--v4-bg-025` (panel default) |
| Lines | `--v4-line-*` | `--v4-line-100` (panel border default) |
| Ink ramp | `--v4-ink-*` | `--v4-ink-100` (default body text) |
| Brand | `--v4-acc*` | `--v4-acc` (Liquid Lava orange) |
| Semantic deltas | `--v4-money` / `--v4-red` / `--v4-amber` / `--v4-cyan` | locked semantic contract |
| Decorative | `--v4-violet` / `--v4-blue` / `--v4-pink` / `--v4-gold` | charts + tag chips only |
| Source channels | `--v4-src-*` | `--v4-src-hn` (orange-red HN brand) |
| Funding sources | `--v4-fund-*` | `--v4-fund-cb` (Crunchbase blue) |
| Tier | `--v4-tier-*` | `--v4-tier-s` through `--v4-tier-f` |
| Type | `--v4-mono` / `--v4-sans` | two families only |
| Sizes | `--v4-text-*` | mockup-extracted, px-precise |
| Tracking | `--v4-track-*` | always pair with caps text |
| Spacing | `--v4-space-*` | 4px base (2,4,6,8,10,12,…) |
| Component | `--v4-topbar-height`, `--v4-grid-gap`, … | shared constants |
| Motion | `--v4-duration-*`, `--v4-ease` | |

**Hard rule:** no hardcoded hex values in `src/components/**` or `src/app/**`.
`lint:guards` will check this once the V4 sweep is done.

---

## 3. Color usage contract (LOCKED)

Violating this contract destroys the scanner reflex. It's load-bearing.

| Token | Allowed uses | Forbidden uses |
|---|---|---|
| `--v4-acc` (orange) | Brand mark, primary CTA, #1 row left rail, section number prefix `// 01`, "PEAK" markers, accent on hot tag | Random decoration, chart series fill, "this looks nice" placement |
| `--v4-money` (green) | Delta-up, positive %, ARR climber, "FIRING", LIVE pulse, gain stats, breakout indicator | Decorative fill, neutral accents |
| `--v4-red` | Delta-down, negative %, error state, breakage, "COOLING" | "Generic red label" |
| `--v4-amber` | Stale data ("21h ago"), warn pill, climber tier, "external · phase 2" badge | Brand color (use `--v4-acc`) |
| `--v4-cyan` | Secondary chart series, info chips, neutral source pip | Delta semantics |
| `--v4-violet` / `--v4-blue` / `--v4-pink` / `--v4-gold` | Chart series, tag chips, ranked-tier accents | Delta semantics, anywhere a semantic color would fit |

**Source channel colors** (`--v4-src-*`) are exclusively for source pips,
filter chips, and the volume chart's stacked-area fills. Don't use them as
generic decorative palette.

---

## 4. Typography

**Two families.** No third.

```
--v4-mono: JetBrains Mono   → data, UI chrome, table cells, KPI numbers
--v4-sans: Geist            → page headlines, deck copy, card descriptions
```

**Always pair caps text with letter-spacing.** Default tracking for caps:
`--v4-track-18` (0.18em). Looser only for heroes (`--v4-track-30`).

**Tabular numbers.** Every numeric cell:
```css
font-variant-numeric: tabular-nums;
```
Without this, `1,247` and `1,234` don't column-align in the table. This is a
financial UI — non-negotiable.

**Type scale highlights:**
- Page H1 (Geist 500, 30px, tracking -0.024em, leading 1.05) — `// CRUMB · TERMINAL` eyebrow above
- Section H2 (Geist 500, 18-22px, tracking -0.018em) — paired with `// 01` mono prefix in `--v4-acc`
- Panel head (Mono 600, 10px caps, tracking 0.20em) — color `--v4-ink-100` for the key, `--v4-ink-300` for the subtitle
- KPI big number (Mono 500, 22-24px, slight tracking 0.02em, tabular)
- KPI small label (Mono 9px caps, tracking 0.20em, color `--v4-ink-400`)
- Body copy (Sans 13-14px, leading 1.5, color `--v4-ink-200`)
- Mono body (Mono 13px, color `--v4-ink-100`)

---

## 5. Spacing

**4px base. Snap everything.**

| Token | Value | Use |
|---|---|---|
| `--v4-space-2` | 4px | tight gaps, icon + label |
| `--v4-space-3` | 6px | inline chip gap |
| `--v4-space-4` | 8px | row gap |
| `--v4-space-5` | 10px | grid gap (`--v4-grid-gap` is also 10px) |
| `--v4-space-6` | 12px | panel inner gutter (left/right) |
| `--v4-space-7` | 14px | section header gap, lede max-width offset |
| `--v4-space-8` | 16px | main padding-x |
| `--v4-space-12` | 24px | hero block separation |

**Panel inner gutter is locked at 12-14px** (mockup-canonical). The V3 drift
was 5-7px which read as cramped.

---

## 6. Layout

**12-column grid.** Gap `--v4-grid-gap` (10px). Spans expressed as `.col-N`:

```css
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: var(--v4-grid-gap); }
.col-12 { grid-column: span 12; }
.col-9  { grid-column: span 9; }
.col-8  { grid-column: span 8; }
.col-7  { grid-column: span 7; }
.col-6  { grid-column: span 6; }
.col-5  { grid-column: span 5; }
.col-4  { grid-column: span 4; }
.col-3  { grid-column: span 3; }
```

**Breakpoints:**
- Phone: `≤ 640px` → grid collapses to 1 column
- Tablet: `641-1023px` → 12-col collapses to 2-col, all `.col-N` span 1
- Desktop: `≥ 1024px` → full 12-col

**App shell:**
- Topbar: 52px high (`--v4-topbar-height`), full-width, sticky
- Sidebar: 230px wide (`--v4-sidebar-width`), full-height, sticky below topbar
- Main: `padding: 14px 16px 60px` — gives the corner-bracket decorations breathing room

---

## 7. Component anatomy

### 7.1 `Panel`
```
+------------------------------------+
|  PanelHead  (8px 12px, line-200)   |  ← border-bottom
+------------------------------------+
|                                    |
|  body (12-14px gutters)            |
|                                    |
+------------------------------------+
```
- Border: `1px solid var(--v4-line-200)`
- Background: `var(--v4-bg-025)`
- No shadow
- No border-radius

### 7.2 `PanelHead`
```
[corner-dot triplet]  // KEY · subtitle           [right meta · LIVE]
```
- Padding: `8px 12px`
- Background: `linear-gradient(180deg, var(--v4-bg-050), var(--v4-bg-025))`
- Border-bottom: `1px solid var(--v4-line-200)`
- Font: mono, 10px, `--v4-track-20`, uppercase
- Key color: `--v4-ink-100`, weight 600
- Subtitle color: `--v4-ink-300`
- Right meta color: `--v4-ink-400` with optional `LIVE` (green pulse) sub-element
- Corner-dot triplet: 3 × 4px squares, gap 3px, colors `[--v4-acc, --v4-cyan, --v4-ink-300]` at 70% opacity

### 7.3 `KpiBand` cell
```
LABEL · ALL CAPS                    ← --v4-text-9, ink-400, track-20
big number              [+12.4%]    ← --v4-text-22, ink-000, mono, tabular
sub line                            ← --v4-text-9-5, ink-300, track-10
```
- Cell padding: `12px 16px`
- Cell border-right: `1px solid var(--v4-line-100)` (last cell omits)
- Big-number color tones: ink-000 (default), `--v4-acc` for "TOP MOVER", `--v4-amber` for "DATA STALE"

### 7.4 `#1 row emphasis` (table / list)
- Gradient wash: `linear-gradient(90deg, var(--v4-acc-soft), transparent 70%)`
- Left rail: `2px solid var(--v4-acc)`, `padding-left` reduced by 2px to compensate
- Number cell color: `--v4-acc`, weight 700
- One row per panel, only on rank #1

### 7.5 `Verdict bands` (consensus)
5 bands: cons (`--v4-money`), early (`--v4-violet`), div (`--v4-amber`),
ext (`--v4-blue`), single (`--v4-ink-300`). Each band has:
- 8px-tall left pip in band color
- Sticky head: `padding: 10px 14px`, gradient wash from band color at 6% to bg-025

---

## 8. Motion

**Three motion primitives. No others.**

### 8.1 `live-pulse` (status dot)
```css
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--v4-money-glow); }
  50%      { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.05); }
}
.live-dot {
  width: 6px; height: 6px; border-radius: 99px;
  background: var(--v4-money);
  animation: pulse var(--v4-duration-pulse) ease-in-out infinite;
}
```

### 8.2 `ticker` (live wire scroll, /signals only)
```css
@keyframes tick {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.ticker-track {
  animation: tick var(--v4-duration-ticker) linear infinite;
}
```

### 8.3 `hover-fade` (default interactive)
```css
.interactive {
  transition: color var(--v4-duration-fast) var(--v4-ease),
              background-color var(--v4-duration-fast) var(--v4-ease),
              border-color var(--v4-duration-fast) var(--v4-ease);
}
```

**No bouncy easings. No spring physics. No micro-bounces on hover.** This is
a terminal, not a marketing site.

---

## 9. Charts

All charts are **SSR-rendered SVG**. No Recharts in V4 (we strip during
migration). Reasons:
- SSR-clean, no hydration mismatch
- No client-side chart runtime in the initial bundle
- Mockup-perfect — every line/grid/anchor is intentional pixels

**Chart anatomy:**
- Y-axis labels: mono 9.5px, color `--v4-ink-300`, right-aligned at `x = PAD_L - 8`
- Gridlines: `stroke="rgba(255,255,255,0.05)"`, 1px
- Stacked-area chart fill: `--v4-src-{name}` at `fill-opacity="0.85"`, stroke at 0.6 opacity
- Top trend line: `stroke="rgba(255,255,255,0.55)"`, 1.4px
- Last-point marker: filled circle at 4px radius, ink-000 with bg-000 stroke at 1.5px
- Spike markers: dashed orange line `stroke="--v4-acc" stroke-dasharray="2 3"` at 0.7 opacity

**Sparklines** (in tables, KPI cells):
- `width: 60-90px, height: 18-24px`
- Stroke 1.4-1.5px in series color
- Gradient fill below line at 0.30→0 opacity
- Optional last-point dot at 2-2.5px radius

---

## 10. State indicators

| State | Visual | Use |
|---|---|---|
| `LIVE` | mono 10px caps, color `--v4-money`, prefixed by pulse-dot | every panel that auto-refreshes |
| `STALE` | mono 10px caps, color `--v4-amber`, "21h" age label | data-age cells when fetch > 1h |
| `NEW` | mono 9px caps, color `--v4-acc`, on rank/list rows | new entries vs prev window |
| `BREAKOUT` | mono 9px caps, color `--v4-money`, on row chip | repos crossing momentum threshold |
| `FIRING` | inline 10px caps, color `--v4-money`, in cross-signal strip | per-channel above-target |
| `QUIET` | inline 10px caps, color `--v4-ink-400` | per-channel below-target |

---

## 11. Accessibility

- Focus state: 2px outline `--v4-acc` at offset 2px, never removed.
- Color contrast: text on bg-025 must hit 4.5:1 (default ink-100 = 14.6:1, safe).
- Live regions: `aria-live="polite"` on the live ticker, status pulse, KPI band.
- Semantic landmarks: `<header>` for topbar, `<aside>` for sidebar, `<main>` for content, `<nav>` inside sidebar.
- Tables: `<thead>` / `<tbody>` always; sortable columns get `aria-sort`.
- All interactive controls keyboard-reachable in DOM order.

---

## 12. Brand

**Logo:** TBD in Phase 3 (logo-lab.html proposes Star-Tick monogram). Until
then, current `▲` triangle in 1px orange border remains.

**Wordmark:**
```
TRENDINGREPO        ← brand-name: mono 12.5px, weight 700, track 0.10em
V4 · CORPUS         ← brand-sub:  mono 9px, ink-400, track 0.18em
```

**Brand tone in copy:**
- Direct, factual, no hype
- Uses `//` prefix for system/internal markers in section headers
- Headlines lead with a clear stake ("The newsroom for AI & dev tooling.")
- Numbers cited with units always ("+18.2%" not "+18.2", "$4.82B" not "4.82B")

---

## 13. Anti-patterns (already burned)

- ❌ Don't use V3 `--color-*` tokens in V4 components. They're aliases now;
  the migration plan strips them next phase.
- ❌ Don't add a third type family.
- ❌ Don't use `--v4-violet` / `--v4-blue` / `--v4-pink` for delta semantics.
- ❌ Don't write inline hex values. Lint will catch.
- ❌ Don't put server-side prop names that shadow JS globals (`window`,
  `document`) — RSC bundling fails silently. See memory note
  `feedback_rsc_global_prop_shadow.md`.
- ❌ Don't use Recharts in new V4 components. SSR-clean SVG only.
- ❌ Don't lock the user's mouse on a `console.log` left in render — guards
  catch but please don't.

---

## 14. Where this lives

- This doc: `design/v4/DESIGN_SYSTEM.md`
- Tokens: `design/v4/tokens.css`
- Component inventory: `design/v4/COMPONENT_INVENTORY.md`
- Page-by-page migration: `design/v4/MIGRATION_PLAN.md`
- Mockup screenshots: `design/screenshots/`
- Mockup HTML files: pasted into the conversation transcript that birthed
  this overhaul (Apr 30, 2026); reference set archived inside the plan file
  `~/.claude/plans/so-i-i-give-keen-crystal.md`

---

## 15. Updating this contract

Changes to the contract require:
1. A note in this doc with rationale.
2. The corresponding `tokens.css` edit.
3. A grep across `src/components/**` to confirm no consumer broke.
4. Pull-request review by Mirko before merge.

If you find yourself wanting to bend a rule for one component, **the
component is wrong, not the rule**. Push back to the mockup or open a
contract amendment — don't quietly drift.
