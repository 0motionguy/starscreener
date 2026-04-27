# V2 Design System — One-Page Cheat Sheet

**Purpose.** Single source of truth for every V2 surface. Read this before
building or editing any page in `/v2/*`. Use only what's listed here.
If you need a new token or class, add it here first, then in
`globals.css`. Never style with raw hex codes or inline `style={{ }}`
when a token or class already covers it.

**Where things live.**
- Tokens: `src/app/globals.css` inside `.v2-root { ... }`
- Utility classes: `src/app/globals.css` (search `.v2-`)
- Primitives: `src/components/today-v2/primitives/`
- Page components: `src/components/today-v2/`

**Active theme.** The base palette is Liquid Lava orange. The `.v2-root`
block currently overrides it to **Blockworks indigo (`#9297f6`)** for the
demo. To remove the override, delete the second token block inside
`.v2-root` in globals.css.

---

## 1. Tokens (CSS variables)

All tokens are defined inside `.v2-root` so they only apply to V2
routes.

### Surfaces — `--v2-bg-*`
| Token | Role |
|---|---|
| `--v2-bg-000` | Page edge / deepest surface |
| `--v2-bg-050` | Default card |
| `--v2-bg-100` | Card hover / well |
| `--v2-bg-200` | Selected / elevated |
| `--v2-bg-300` | Deselected / raised stroke |

### Lines — `--v2-line-*`
| Token | Use |
|---|---|
| `--v2-line-soft` | Whisper-thin separator (`rgba(255,255,255,0.05)`) |
| `--v2-line-std` | Standard hairline (`rgba(255,255,255,0.08)`) |
| `--v2-line-100` | Default solid divider |
| `--v2-line-200` | Card border default |
| `--v2-line-300` | Stronger divider |
| `--v2-line-400` | Heaviest line |

### Ink — `--v2-ink-*`
| Token | Role |
|---|---|
| `--v2-ink-000` | Pure white — display headlines, key values |
| `--v2-ink-100` | Body — primary readable text |
| `--v2-ink-200` | Secondary body |
| `--v2-ink-300` | Muted — labels, mono captions |
| `--v2-ink-400` | Quiet — eyebrow text, axis labels |
| `--v2-ink-500` | Ghost — disabled, dividers as text |

### Accent — `--v2-acc-*`
The "one bright node." Used **only on the active object** of a section.
Never decorative.
| Token | Role |
|---|---|
| `--v2-acc` | Primary accent stroke + headline color |
| `--v2-acc-dim` | Hover / pressed |
| `--v2-acc-soft` | Soft fill (`rgba(..., 0.14)`) |
| `--v2-acc-glow` | Glow shadow (`rgba(..., 0.45)`) |

### Signal — `--v2-sig-*`
| Token | Use |
|---|---|
| `--v2-sig-green` | Up / success / positive delta |
| `--v2-sig-red` | Down / failure / negative delta |
| `--v2-sig-amber` | Warning |
| `--v2-sig-cyan` | Info / aux series |

### Tracking presets
| Token | Where |
|---|---|
| `--v2-tracking-display` | `-0.035em` for 56px+ headlines |
| `--v2-tracking-h1` | `-0.022em` for 32px headings |
| `--v2-tracking-mono` | `0.18em` for mono uppercase labels |
| `--v2-tracking-mono-tight` | `0.06em` for inline mono with normal case |

---

## 2. Type ramp

| Element | Use class | Size | Weight | Tracking |
|---|---|---|---|---|
| Display | `.v2-display` | `clamp(40px, 7vw, 84px)` | 300 | `-0.035em` |
| Page title (mono) | `.v2-mono` (12px) | 12px | 400 | `0.20em` |
| H1 | `.v2-h1` | 40px | 400 | `-0.022em` |
| H2 | `.v2-h2` | 24px | 510 | `-0.012em` |
| Body | inline Geist | 14-16px | 400 | normal |
| Body emphasis | inline Geist 510 | 14-16px | 510 | `-0.012em` |
| Mono label (eyebrow) | `.v2-mono` | 11px | 400 | `0.20em` |
| Mono inline | `.v2-mono-tight` | 12px | 400 | `0.04em` |

**Rule.** Never set fonts inline. Always use the class. If you need a
size between presets, add a wrapping `<span>` with `style={{ fontSize: N }}`
but keep the family + tracking from the class.

**Rule.** Display headlines should use the dim/bright word pattern from
NewsTemplateV2 — structural words at `--v2-ink-400`, content words at
`--v2-ink-000`. Never set everything to pure white.

---

## 3. Utility classes

### Layout
- `.v2-root` — top-level wrapper. Defines tokens, font, antialiasing.
  **Every V2 page must sit inside this.** Set automatically by
  `src/app/v2/layout.tsx`.
- `.v2-canvas` — applies the dot-field + aurora background. Only used
  once, in the V2 layout.
- `.v2-frame` — page-width container. `max-width: 1440px`, `padding-inline: 32px`. Wrap every section's content in this.

### Surface
- `.v2-card` — `bg-050` + `1px line-100` border + `2px` radius. The
  default container for any block of related content.
- `.v2-card-hover` — adds hover transition (bg → `bg-100`, border → `line-300`). Apply when the card is a `<Link>`.

### Chrome
- `.v2-term-bar` — terminal-bar header. **Always use the `<TerminalBar>`
  primitive instead of styling the class directly** — it includes the
  three-dot indicator + label + status.
- `.v2-bracket` — adds 2 of the 4 corner markers. Pair with
  `<BracketMarkers />` (which renders the other 2 + optional dashed
  inner frame). Apply on the **single most important object** in any
  section (the #1 row, the focused card).
- `.v2-bracket-dash` — inner dashed frame, 1px orange. Use sparingly.

### Type
- `.v2-mono` — mono uppercase label, 11px, ink-300, tracking 0.20em.
  Auto-prefix with `<span aria-hidden>{"// "}</span>` for the eyebrow
  pattern.
- `.v2-mono-tight` — mono normal case, 12px, ink-200, tracking 0.04em.
  For inline data values (e.g. repo paths, hashes).
- `.v2-display` — display headline, 300 weight, tight tracking. Apply
  inline `style={{ fontSize: "clamp(...)" }}` for the size you want.
- `.v2-h1`, `.v2-h2` — H1 (40px / 400) and H2 (24px / 510). Section
  titles, never page titles — use the small mono title-line pattern for
  page-level titles.

### Buttons
- `.v2-btn` — base button. 42px tall, mono uppercase, sharp corners.
- `.v2-btn-primary` — orange/indigo accent fill. Primary CTA only.
- `.v2-btn-ghost` — transparent, line-200 border. Secondary action.

**Rule.** A button uses `<button>` or `<Link>` with the class. Don't
re-implement button styling inline.

### Tags / pills
- `.v2-tag` — base pill. `4px 8px` padding, hairline border, 10px mono.
- `.v2-tag-acc` — accent variant (orange/indigo border + soft fill).
- `.v2-tag-green` — success variant.
- `.v2-tag-dot` — 6×6 dot prefix inside the tag.

### Stats
- `.v2-stat` — stat tile. 96px min-height, mono label + Geist value.
  Uses `<div class="v"><div class="k">` structure:
  ```html
  <div class="v2-stat">
    <div class="v">85,420</div>
    <div class="k">STARS · TOTAL</div>
  </div>
  ```
- For compare-style stat tiles with diff highlighting, see
  `CompareV2.CompareStat` (private to that file).

### Industrial
- `.v2-ticker` + `.v2-barcode` — industrial closing motif. Always
  rendered through the `<BarcodeTicker>` primitive.
- `.v2-ascii` — ASCII texture interstitial. Use the
  `<AsciiInterstitial>` component, not the class directly.
- `.v2-live-dot` — pulsing 8×8 orange square with glow. For "LIVE"
  indicators next to mono labels.

### Tables
- `.v2-row` — table row class. Adds hover state (bg → `bg-100`, 2px
  orange leading edge). Apply to `<tr>`.

---

## 4. Primitives (`src/components/today-v2/primitives/`)

Every primitive is opinionated and uses the system tokens internally.
Always use the primitive — never re-implement its visuals.

| Primitive | Use it for |
|---|---|
| `<TerminalBar label status />` | Top of every data card. 3-dot live indicator + mono label + right-aligned status. |
| `<BracketMarkers />` | Pair with `.v2-bracket` on the parent. The 4 orange corner squares. |
| `<MonoLabel>` | `// LABEL` mono eyebrow. Auto-prefixes the `// ` slashes. |
| `<BarcodeTicker left middle right />` | Footer of a card. Industrial barcode + edge labels. |
| `<SpiderNode />` | Hero illustration — 8 peripheral nodes wiring up to a central orange node. |
| `<SignalSpider channels />` | Per-repo 5-axis cross-signal spider chart. |
| `<StarChart data />` | Single-series 30D star chart with milestone markers. |
| `<StarRaceChart series />` | Multi-series normalized %-growth race chart (compare page). |

---

## 5. Composition rules

**Page structure.** Every V2 page follows the same skeleton:

```tsx
<>
  <section className="border-b border-[color:var(--v2-line-100)]">
    <div className="v2-frame pt-6 pb-6">
      {/* small mono title line */}
      {/* hero / stats / chart band */}
    </div>
  </section>
  <section className="border-b border-[color:var(--v2-line-100)]">
    <div className="v2-frame py-6">
      {/* mono section label */}
      {/* content */}
    </div>
  </section>
  {/* ...more sections... */}
</>
```

**Page title.** Never use a giant H1. Use the small mono title-line
pattern from NewsTemplateV2:
```tsx
<h1 className="v2-mono mb-4 inline-flex items-center gap-2"
    style={{ color: "var(--v2-ink-100)", fontSize: 12, letterSpacing: "0.20em" }}>
  <span aria-hidden>{"// "}</span>
  PAGE NAME · CONTEXT
  <span aria-hidden style={{ width: 6, height: 6, background: "var(--v2-acc)",
                             borderRadius: 1, boxShadow: "0 0 6px var(--v2-acc-glow)" }} />
</h1>
```

**Section label.** Every section gets a mono eyebrow above its content:
```tsx
<p className="v2-mono mb-3" style={{ color: "var(--v2-ink-300)" }}>
  <span aria-hidden>{"// "}</span>
  STAGE 02 · VALIDATE · ALL FEED
</p>
```

**Voice.** Operator-grade. Mono labels everywhere. Numbers always with
units (`+437 /24H`, `5/5 SIGNALS`, `$462M ARR`). Lowercase commands in
prose ("drop a repo", "open repo"). UPPERCASE in mono labels. Never use
exclamation marks, never "Get started today!" energy.

**Bracket markers — when to use.** On the **single highest-energy
object** in any section. Examples:
- Top-1 row in a table
- The active tab
- The hero stat tile that's breaking out
- The featured card in a 3-card row
- The overall winner column on Compare
Never decoratively. If you bracket-mark more than one thing per
section, you've lost.

**Color discipline.** Accent (`--v2-acc`) is reserved for active
objects, primary CTAs, and the "winning" cell. Status colors
(`--v2-sig-*`) are reserved for delta values. Everything else lives in
the ink ramp. **No new colors without adding them to the token block
first.**

**Spacing.** Section vertical padding is `py-6` (24px) by default.
Cards inside sections use `gap-3` (12px). Tight clusters use `gap-2`
(8px) or `gap-1` (4px). Don't introduce new spacing values.

**Don'ts.**
- Don't write inline `style={{ fontFamily: "var(--font-geist-mono)..." }}` — use `.v2-mono` or `.v2-mono-tight`.
- Don't write inline `style={{ background: "var(--v2-bg-050)", border: "1px solid var(--v2-line-100)", borderRadius: 2 }}` — use `.v2-card`.
- Don't write inline button styling — use `.v2-btn` + variant.
- Don't use Tailwind text-* color classes (`text-gray-300`, etc.) on V2 surfaces. Use `style={{ color: "var(--v2-ink-300)" }}` until we add Tailwind plugins for the V2 ramp.
- Don't use `border-radius` larger than 2px on a V2 surface. Sharp by default.
- Don't use shadows for elevation. Use luminance stepping (`bg-050 → bg-100 → bg-200`).

---

## 6. Adding to the system

Before you build something new, ask: does the existing system cover
this? If yes — use it. If no:

1. Add the token to `globals.css` inside the `.v2-root` block.
2. Add a utility class if the pattern repeats 3+ times.
3. Add a primitive component if it has visual state (hover, active,
   loading).
4. Update this doc — token table, class table, or primitive table.
5. Then build the feature.

The order matters. Don't skip the doc update — that's how the system
fragments.

---

## 7. Files map

```
src/app/
  globals.css                   # Tokens + utility classes
  v2/
    layout.tsx                  # .v2-root wrapper, fonts, chrome
    page.tsx                    # /v2 — Today landing
    news/                       # /v2/news/* — 9 news terminals
    repo/page.tsx               # /v2/repo — repo detail demo
    compare/page.tsx            # /v2/compare — compare demo

src/components/today-v2/
  HeaderV2.tsx                  # Top header
  SidebarV2.tsx                 # Left sidebar
  HeroV2.tsx                    # /v2 hero
  ActivityStripV2.tsx           # 4-stage strip
  TabsV2.tsx                    # Sticky tabs
  IdeasRepoSplitV2.tsx          # Today: ideas + repos split
  IdeaCardV2.tsx, RepoCardV2.tsx
  TrendingTableV2.tsx           # Today: terminal table
  SignalRadarV2.tsx             # Bubble map wrap
  LaunchSectionV2.tsx           # Stage 5
  AsciiInterstitial.tsx
  NewsTemplateV2.tsx            # /v2/news/* template
  FeaturedCardsV2.tsx           # 3 editorial cards
  RepoDetailV2.tsx              # /v2/repo
  CompareV2.tsx                 # /v2/compare
  newsMockData.ts, repoMockData.ts

  primitives/
    TerminalBar, BracketMarkers, MonoLabel, BarcodeTicker,
    SpiderNode, SignalSpider, StarChart, StarRaceChart
```

---

## 8. The four principles

1. **Field first.** A grid of dots is the canvas. Composition reveals
   itself only where the cursor goes.
2. **One bright node.** Liquid Lava (or Blockworks indigo, in the
   current demo) is reserved for the active object. Never for accent
   or decoration.
3. **Operator language.** Mono labels. Tags with `→` arrows. The
   product narrates itself like a shell.
4. **Sharp by default.** Hairline borders. 0–2px radius. Pills only
   for binary toggles.
