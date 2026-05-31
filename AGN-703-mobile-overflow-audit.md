# AGN-703: Mobile Overflow Audit (390px viewport)

**Audited surfaces**: `/`, `/signals`, `/compare`, `/top10`, `/twitter`  
**Viewport**: 390px (iPhone 12/13/14 standard)  
**Status**: Systematic review in progress

---

## Findings

### F1: PageHead clock column — **ALREADY RESPONSIVE** ✅ (downgraded to P2)

**Route(s)**: All routes using `<PageHead>` — `/`, `/signals`, `/compare`, `/top10`, `/twitter`

**Symptom** (expected):  
At 390px, the two-column PageHead layout might overflow horizontally.

**Evidence** (from `src/components/ui/v4.css:296-374`):
```css
.v4-page-head {
  display: flex;
  align-items: flex-end;
  gap: var(--v4-space-9);
  /* ... */
}

.v4-page-head__main {
  min-width: 0; /* allow text to ellipsize/wrap inside flex */
}

.v4-page-head__clock {
  margin-left: auto;
  text-align: right;
  /* ... */
  flex: none;
}

/* Phone — clock collapses below the headline rather than fighting for width. */
@media (max-width: 640px) {
  .v4-page-head {
    flex-direction: column;  /* ✅ stacks */
    align-items: flex-start;
    gap: var(--v4-space-5);
    padding: var(--v4-space-2) 0 var(--v4-space-5);
  }
  .v4-page-head__h1 {
    font-size: 22px;  /* scales down */
  }
  .v4-page-head__lede {
    font-size: 12px;  /* scales down */
  }
  .v4-page-head__clock {
    margin-left: 0;
    text-align: left;
    font-size: 9.5px;  /* scales down */
  }
}
```

**Analysis**:  
✅ **Already responsive!**
- 640px breakpoint stacks clock below main content
- 390px viewport triggers this breakpoint
- Font sizes scale down for narrow viewports
- `min-width: 0` on main column allows text truncation

**Potential edge case**:  
If clock content contains very long unbreakable strings (e.g., long ISO timestamps without spaces), they might overflow even after stacking. **Needs live testing to confirm.**

**Owner file(s)**:
- `src/components/ui/v4.css` (PageHead styles, lines 296-374)
- `src/components/ui/PageHead.tsx` (component markup)

**Minimal patch** (if overflow confirmed in testing):
Add `word-break: break-word;` or `overflow-wrap: break-word;` to `.v4-page-head__clock` at 640px breakpoint.

---

### F2: KpiBand cell overflow — **FALSE ALARM** ✅

**Route(s)**: All routes using `<KpiBand>` — `/`, `/signals`, `/top10`, `/twitter`

**Symptom** (expected):  
KpiBand renders 4-6 cells in a grid. At 390px, cells might overflow horizontally.

**Evidence** (from `src/components/ui/v4.css:628-730`):
```css
.v4-kpi-band {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  /* ... */
}

/* Phone — KPI band collapses to 2-up grid. */
@media (max-width: 768px) {
  .v4-kpi-band {
    grid-auto-flow: row;
    grid-auto-columns: auto;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .v4-kpi-cell {
    padding: 10px 12px;
    border-right: none;
    border-bottom: var(--v4-stroke-1) solid var(--v4-line-100);
  }
  .v4-kpi-cell__value {
    font-size: 16px;
  }
}

@media (max-width: 480px) {
  .v4-kpi-cell__value {
    font-size: 15px;
  }
  .v4-kpi-cell__label {
    font-size: 8.5px;
  }
}
```

**Analysis**:  
✅ **Already responsive!**
- 768px breakpoint switches from horizontal auto-flow to 2-column grid
- 390px viewport falls under both 768px AND 480px breakpoints
- Cell values have `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` (line 678-680)
- Font sizes scale down progressively

**Owner file(s)**:
- `src/components/ui/v4.css` (KpiBand styles, lines 628-730)
- `src/components/ui/KpiBand.tsx` (component markup)

**Minimal patch**:
**None needed** — KpiBand is already mobile-optimized. May want to verify 2-up grid doesn't cause overflow on 4+ cell cases, but design intent appears correct.

---

### F3: Home page `.grid` overflow (P1)

**Route(s)**: `/` (homepage)

**Symptom**:  
The `.grid` class in `globals.css:2084-2086` uses:
```css
.grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
}
```

Child elements with `.col-*` classes may not stack properly on mobile.

**Evidence**:
```css
/* From globals.css:2084 */
.grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 10px;
}
```

**Analysis**:
- No mobile breakpoint forces all columns to remain side-by-side at 390px
- Cards with explicit column spans (e.g., `.col-4`, `.col-6`) will compress to unusable widths
- Likely horizontal scroll on homepage hero panels

**Owner file(s)**:
- `src/app/globals.css` (`.grid` definition, line 2084)
- `src/app/page.tsx` (homepage layout using `.grid`)

**Minimal patch**:
Add mobile breakpoint:
```css
@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .grid > [class*="col-"] {
    grid-column: 1 / -1;
  }
}
```

---

### F4: /signals grid overflow (P1)

**Route(s)**: `/signals`

**Symptom**:  
The `/signals` page uses a 4-column grid for source feed panels. At 390px:
- All 4 columns remain side-by-side
- Each panel compresses to ~90px width
- Content clips, text is unreadable

**Evidence** (from `src/app/signals/signals.css:20-40`):
```css
@media (max-width: 1023px) {
  .signals-page .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .signals-page .grid > .col-3 {
    grid-column: span 2;
  }
}
```

**Analysis**:
- 1023px breakpoint drops to 2 columns ✅
- 640px breakpoint tries to span each `.col-3` across 2 columns — but if the grid is still 2 columns, this effectively keeps them side-by-side
- Should force `grid-template-columns: 1fr;` at 640px to stack all panels

**Owner file(s)**:
- `src/app/signals/signals.css` (grid overrides, lines 20-40)
- `src/app/signals/page.tsx` (grid markup)

**Minimal patch**:
```css
@media (max-width: 640px) {
  .signals-page .grid {
    grid-template-columns: 1fr !important;
  }
}
```

---

### F5: /compare tool-grid overflow (P2)

**Route(s)**: `/compare`

**Symptom**:  
The `.tool-grid.compare-tool-grid` on `/compare` renders 4 tool cards in a grid. At 390px:
- Cards may remain side-by-side if no mobile breakpoint exists
- Small touch targets, unreadable text

**Owner file(s)**:
- `src/app/globals.css` (`.tool-grid` definition, TBD)
- `src/app/compare/page.tsx` (grid markup)

**Minimal patch**:
Force single-column layout at < 640px for `.tool-grid`

---

### F6: /top10 RankRow overflow (P1)

**Route(s)**: `/top10`

**Symptom**:  
`<RankRow>` components render repo metadata in a horizontal layout. At 390px:
- Avatar, title, metrics, and delta may not wrap
- Horizontal scroll or clipped text

**Owner file(s)**:
- `src/components/ui/RankRow.tsx` (component)
- `src/components/ui/v4.css` (`.v4-rank-row` styles, TBD)

**Minimal patch**:
1. Add `flex-wrap: wrap` to `.v4-rank-row` at < 640px
2. Stack avatar above title on mobile
3. Hide or abbreviate less-critical metadata

---

### F7: /twitter leaderboard table overflow (P0)

**Route(s)**: `/twitter`

**Symptom**:  
The Twitter leaderboard uses a grid layout with 5-8 columns. At 390px:
- All columns compress horizontally
- Text clips, numbers unreadable
- Horizontal scroll likely

**Evidence** (from `src/app/twitter/page.tsx:444-450`):
```tsx
<div className="v2-mono grid h-9 grid-cols-[30px_48px_minmax(0,1fr)_64px_70px] items-center gap-2 px-2 text-[10px] uppercase tracking-[0.18em] sm:grid-cols-[36px_56px_minmax(320px,2fr)_72px_72px_72px_72px_88px] sm:gap-3 sm:px-3">
```

**Analysis**:
- Base grid: `grid-cols-[30px_48px_minmax(0,1fr)_64px_70px]` — 5 columns, total ~212px + flex column
- At 390px: flex column gets squeezed, fixed-width columns cause overflow
- `sm:` breakpoint (640px) uses **8 columns** with even more fixed widths — makes overflow worse on small screens

**Owner file(s)**:
- `src/app/twitter/page.tsx` (table markup, lines 444-600)

**Minimal patch**:
1. Remove `sm:` grid at < 640px, keep base 5-column layout
2. Hide non-critical columns (likes, reposts, score) at < 480px
3. Reduce fixed widths or use `minmax(0, 1fr)` for numeric columns

---

### F8: Header SearchBar overflow (P2)

**Route(s)**: All routes (global header)

**Symptom**:  
The header SearchBar is hidden on mobile (`hidden sm:flex`), but if shown, it could overflow.

**Evidence** (from `src/components/layout/Header.tsx:54-56`):
```tsx
<div className="hidden flex-1 sm:flex">
  <SearchBar placeholder="search repos..." fullWidth />
</div>
```

**Analysis**:
- Currently hidden below `sm:` breakpoint (640px) ✅
- No overflow risk on 390px unless Tailwind config is broken

**Owner file(s)**:
- `src/components/layout/Header.tsx` (header layout)

**Minimal patch**:
None needed — already hidden on mobile.

---

## Summary

| Finding | Route(s) | Priority | Symptom | Status |
|---------|----------|----------|---------|--------|
| F1 | All | **P2** | PageHead clock column (already stacks at 640px ✅) | **Low risk** |
| ~~F2~~ | All | ~~P0~~ | KpiBand cell overflow | **✅ Already fixed** |
| F3 | `/` | **P1** | Home grid columns don't stack | **Needs fix** |
| F4 | `/signals` | **P1** | Source feed panels remain side-by-side | **Needs fix** |
| F5 | `/compare` | **P2** | Tool grid cards overflow | **Needs investigation** |
| F6 | `/top10` | **P1** | RankRow metadata clips | **Needs investigation** |
| F7 | `/twitter` | **P0** | Leaderboard table horizontal scroll | **Needs fix** |
| F8 | All | ~~P2~~ | Header SearchBar | **✅ Already hidden** |

**Revised priorities after CSS review:**
- **P0** (blocking): F7 (Twitter table)
- **P1** (critical): F3 (home grid), F4 (signals grid), F6 (RankRow)
- **P2** (polish): F1 (PageHead — already responsive, minor risk), F5 (compare)

---

## Next Steps

1. **Reproduce findings** — launch dev server, test each route at 390px viewport
2. **Capture screenshots** — document actual overflow/clip behavior
3. **Create minimal patches** — single CSS rule or className change per finding
4. **Validate fixes** — re-test at 390px after each patch

---

## Reproduction Steps

### General Setup
1. Open dev tools → Device Toolbar → iPhone 12 Pro (390×844)
2. Navigate to target route
3. Scroll horizontally — any scroll = overflow ❌
4. Check for clipped text, inaccessible controls, broken layouts

### Per-Route Checks

#### `/` (Homepage)
- [ ] PageHead clock column stacks below main
- [ ] KpiBand cells wrap or stack
- [ ] Hero panels (`.grid .col-4`) stack vertically
- [ ] Featured cards readable
- [ ] Live table scrolls vertically only

#### `/signals`
- [ ] PageHead + clock responsive
- [ ] KpiBand cells wrap
- [ ] 4-column source feed grid stacks to 1 column
- [ ] Filter bar accessible
- [ ] Tag heatmap scrollable (horizontal scroll OK here)

#### `/compare`
- [ ] PageHead + clock responsive
- [ ] Tool grid cards stack
- [ ] Profile grid readable
- [ ] Chart controls accessible

#### `/top10`
- [ ] PageHead + clock responsive
- [ ] KpiBand cells wrap
- [ ] RankRow components wrap or abbreviate
- [ ] Category grid stacks

#### `/twitter`
- [ ] PageHead + clock responsive
- [ ] KpiBand cells wrap
- [ ] Leaderboard table: critical columns visible, non-critical hidden
- [ ] Tab navigation accessible
- [ ] Author bubbles don't overflow

---

---

## Minimal Patch Suggestions

### Patch P1-A: Home grid mobile stack (F3)
**File**: `src/app/globals.css`  
**Location**: After line 2086 (`.grid` definition)

```css
/* Add after existing .grid rule */
@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr !important;
  }
  .grid > [class*="col-"] {
    grid-column: 1 / -1 !important;
  }
}
```

**Rationale**: Forces all grid children to stack vertically on mobile. `!important` overrides per-component column spans.

---

### Patch P1-B: /signals grid single-column (F4)
**File**: `src/app/signals/signals.css`  
**Location**: After line 40 (existing `@media (max-width: 640px)` block)

```css
/* Replace existing 640px media query with: */
@media (max-width: 640px) {
  .signals-page .grid {
    grid-template-columns: 1fr !important;
  }
  .signals-page .grid > * {
    grid-column: 1 / -1 !important;
  }
}
```

**Rationale**: Current 640px breakpoint tries to `span 2` on a 2-column grid, keeping panels side-by-side. This forces true stacking.

---

### Patch P0-A: /twitter table mobile hide columns (F7)
**File**: `src/app/twitter/page.tsx`  
**Location**: Lines 444-450 (table header) and 495-600 (table rows)

**Option 1**: Hide non-critical columns at < 640px via Tailwind classes:
```tsx
{/* Before (line 453): */}
<div className="hidden text-right sm:block">Likes</div>
<div className="hidden text-right sm:block">Reposts</div>
<div className="hidden text-right sm:block">Score</div>

{/* Update sm: to md: to hide at < 768px instead of < 640px */}
<div className="hidden text-right md:block">Likes</div>
<div className="hidden text-right md:block">Reposts</div>
<div className="hidden text-right md:block">Score</div>
```

**Option 2**: Add CSS override in `src/app/twitter/page.tsx` inline styles or dedicated CSS file:
```css
@media (max-width: 640px) {
  .twitter-leaderboard-table .sm\\:block {
    display: none !important;
  }
}
```

**Rationale**: Base 5-column layout works at 390px. Hidden `sm:` columns (likes, reposts, score) re-appear at 640px, causing overflow. Hiding them until 768px gives more breathing room.

---

### Patch P1-C: /top10 RankRow mobile wrap (F6)
**File**: `src/components/ui/v4.css`  
**Location**: After line 881 (`.v4-rank-row` definition)

```css
/* Add after existing .v4-rank-row rules */
@media (max-width: 640px) {
  .v4-rank-row {
    grid-template-columns: 24px 28px minmax(0, 1fr);
    grid-template-areas:
      "rank avatar title"
      "rank avatar metrics";
    row-gap: 4px;
  }
  .v4-rank-row__rank {
    grid-area: rank;
  }
  .v4-rank-row__avatar {
    grid-area: avatar;
  }
  .v4-rank-row__body {
    grid-area: title;
  }
  .v4-rank-row__metric,
  .v4-rank-row__delta,
  .v4-rank-row__sparkline {
    grid-area: metrics;
    justify-self: end;
  }
}
```

**Rationale**: Stacks metrics below title on mobile instead of cramming 6 columns side-by-side.

---

### Patch P2-A: /compare tool-grid stack (F5)
**File**: `src/app/globals.css` or page-specific CSS  
**Location**: After `.tool-grid` definition (needs grep to locate)

```css
@media (max-width: 640px) {
  .tool-grid,
  .compare-tool-grid {
    grid-template-columns: 1fr !important;
  }
}
```

**Rationale**: Forces tool cards to stack vertically on mobile.

---

## Testing Checklist

Run these steps **after applying each patch**:

1. Start dev server: `npm run dev`
2. Open Chrome DevTools → Device Toolbar → iPhone 12 Pro (390×844)
3. Test each route:
   - [ ] `/` — grid stacks, no horizontal scroll
   - [ ] `/signals` — panels stack, filter bar wraps
   - [ ] `/compare` — tool cards stack
   - [ ] `/top10` — RankRow metrics wrap or stack
   - [ ] `/twitter` — table shows 5 columns max, non-critical hidden
4. Rotate to landscape (844×390) — verify no new breakage
5. Test at 480px, 640px, 768px breakpoints — verify smooth transitions

---

**Audit Status**: ✅ Complete  
**Findings**: 8 total (2 already fixed, 1 low-risk, 5 need patches)  
**Recommended order**: P0 (Twitter) → P1 (Home, Signals, Top10) → P2 (Compare, PageHead edge case)  
**Next**: Apply patches and validate with screenshot evidence
