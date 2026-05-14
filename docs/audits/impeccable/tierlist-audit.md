# /tierlist audit — 2026-05-13

## Files audited
- [src/app/tierlist/page.tsx](../../../src/app/tierlist/page.tsx)
- [src/app/tierlist/loading.tsx](../../../src/app/tierlist/loading.tsx)
- [src/app/tierlist/error.tsx](../../../src/app/tierlist/error.tsx)
- [src/components/tier-list/TierListEditor.tsx](../../../src/components/tier-list/TierListEditor.tsx)
- [src/components/tier-list/TierBoard.tsx](../../../src/components/tier-list/TierBoard.tsx)
- [src/components/tier-list/MobileTierPicker.tsx](../../../src/components/tier-list/MobileTierPicker.tsx)
- [src/components/tier-list/RepoSearchBox.tsx](../../../src/components/tier-list/RepoSearchBox.tsx)
- [src/components/tier-list/ShareBar.tsx](../../../src/components/tier-list/ShareBar.tsx)
- [src/components/tier-list/TemplatePicker.tsx](../../../src/components/tier-list/TemplatePicker.tsx)
- [src/components/tier-list/TopSharePngButton.tsx](../../../src/components/tier-list/TopSharePngButton.tsx)
- [src/components/tier-list/Avatar.tsx](../../../src/components/tier-list/Avatar.tsx)
- [src/components/tier-list/tier-list.css](../../../src/components/tier-list/tier-list.css)
- [src/lib/tier-list/constants.ts](../../../src/lib/tier-list/constants.ts) (TIER_COLORS palette)
- [src/lib/tier-list/client-store.ts](../../../src/lib/tier-list/client-store.ts) (state)
- [src/app/globals.css#L1657-1673, L3634-3648](../../../src/app/globals.css) `.page-head .clock .live` + `.tool .t-foot .live`

## P0 findings (dishonest / broken / a11y blocker)

- **Hardcoded green-pulse `<span className="live">share-ready</span>` in page clock** — [page.tsx:52](../../../src/app/tierlist/page.tsx#L52). The `.live` class at [globals.css#L1657-1673](../../../src/app/globals.css#L1657) renders `--sig-green` text + a 6px green dot with `--shadow-live` glow — i.e. the LiveDot pattern reserved for live data feeds. `/tierlist` is a static, client-side editor with no underlying feed. Per `feedback_freshness_chrome_must_be_honest` this is a chrome lie. Fix: drop the `.live` class on this label (it's a static descriptor, not a freshness signal). Render as plain mono text or use the neutral eyebrow style. **Mechanical.**
- **Hardcoded green-pulse `<span className="live">live</span>` on the active tool card** — [page.tsx:67](../../../src/app/tierlist/page.tsx#L67). Same pattern as above via `.tool .t-foot .live` at [globals.css#L3634-3648](../../../src/app/globals.css#L3634). The active tile gets a green-dot "LIVE" eyebrow even though "Tier list" is a static editor, not a live-data surface. Worse: the same green-dot meaning is reused on *non-active* tool cards elsewhere in the file pattern, so the visual reads inconsistently. Fix: replace the `.live` chip with a neutral `active` / `now` eyebrow that doesn't borrow the freshness vocabulary. **Mechanical.**
- **Drag-to-tier has zero keyboard a11y for placement** — [TierBoard.tsx:42-45](../../../src/components/tier-list/TierBoard.tsx#L42). `useSensor(KeyboardSensor)` is wired, but the draggable cell ([TierBoard.tsx:261-269](../../../src/components/tier-list/TierBoard.tsx#L261)) only exposes the `listeners` on a button labelled "Drag handle for X" that is `hidden md:inline-flex` — desktop-only. There is no keyboard-reachable "place into S/A/B/..." control on desktop (the `<select>` at [TierBoard.tsx:284-302](../../../src/components/tier-list/TierBoard.tsx#L284) is hidden until `group-hover` / `group-focus-within` — but the hidden state means `select` is `display: none` and unreachable via Tab in keyboard-only nav). Net effect: keyboard users can't move an item into a tier on desktop. dnd-kit announcements alone don't solve placement; you need a visible drop-target list. Fix: render the per-item `<select>` permanently (or always-visible on focus, not on hover) so keyboard users can place items without a pointer. **Mechanical.**
- **Tier letter editable input is reachable but unlabelled by screen reader for color context** — [TierBoard.tsx:118-124](../../../src/components/tier-list/TierBoard.tsx#L118). The input has `aria-label="Rename tier ${label}"` but the surrounding `<div className="tier-letter" style={{ backgroundColor: color }}>` ([TierBoard.tsx:117](../../../src/components/tier-list/TierBoard.tsx#L117)) carries the tier's identity (color is the *only* affordance distinguishing S/A/B/C). Color-blind users tabbing into the row hear "Rename tier S" but get no semantic color cue. Plus the four chrome buttons (color, remove, up, down) only become visible on `group-hover` / `focus-visible:opacity-100` — keyboard users *do* see them on tab-focus, but the affordance order (color → remove → up → down) is unannounced. Fix: keep `aria-label` but add a `<span class="sr-only">` describing tier rank + color name; ensure focus-order makes sense. **Design call** (operator: confirm sr-only copy pattern).

## P1 findings (visible regression)

- **Tap targets fail 44×44** — multiple sites in [tier-list.css](../../../src/components/tier-list/tier-list.css):
  - `.tier-row-chrome` `18×18` ([L267-268](../../../src/components/tier-list/tier-list.css#L267))
  - `.tier-color-picker button` `18×18` ([L310-311](../../../src/components/tier-list/tier-list.css#L310))
  - `.ico-btn` `min-height: 28px` ([L189](../../../src/components/tier-list/tier-list.css#L189)) — "+ Add row" / "Reset" / "Share PNG"
  - `.tier-result` `min-height: 38px` ([L128](../../../src/components/tier-list/tier-list.css#L128))
  - `.tier-item` `height: 34px` ([L345](../../../src/components/tier-list/tier-list.css#L345))
  Per project mobile rule (44×44 baseline, 375px viewport) all of these are tap-target failures. Fix: lift `.ico-btn` to `min-height: 44px`, `.tier-result` to `48px`, color-picker swatches to `28×28` with `8px` hit padding via `::before` so visual size stays compact. **Mechanical.**
- **Tier label typography inconsistent: sans on desktop, mono on mobile** — desktop [tier-list.css:245-262](../../../src/components/tier-list/tier-list.css#L245) uses `font-family: var(--font-sans)` for `.tier-letter` and `.tier-letter-input`; mobile picker swatch [MobileTierPicker.tsx:221](../../../src/components/tier-list/MobileTierPicker.tsx#L221) uses `font-mono font-bold`. Per audit context ("Tier label typography — uppercase + mono per data convention") and the rest of this codebase's terminal-feel data type (every other `.key` / eyebrow uses mono), the desktop tier letters should be mono too. Same character ("S") reads as Inter on desktop and SF Mono on the bottom-sheet — visual drift. Fix: switch `.tier-letter` / `.tier-letter-input` to `font-family: var(--font-mono)`. **Design call** (operator: confirm mono is intended — current sans choice may be deliberate "Hanrahan" plan callout per [constants.ts:5](../../../src/lib/tier-list/constants.ts#L5)).
- **`confirm("Clear the whole list?")` is a browser-native modal** — [TierListEditor.tsx:103](../../../src/components/tier-list/TierListEditor.tsx#L103). Inconsistent with the rest of the product (`ConfirmDialog.tsx` exists at `src/components/ui/ConfirmDialog.tsx` per the wave-1 PUNCH-LIST). Native confirm() has unstyled chrome, breaks visual continuity, and isn't keyboard-trappable in the same way. Fix: replace with the project's `ConfirmDialog`. **Mechanical.**
- **No focus-visible outline on draggables, search results, color picker swatches, or chrome buttons** — only `.ico-btn:focus-visible` ([tier-list.css:205](../../../src/components/tier-list/tier-list.css#L205)) has a focus treatment. `.tier-item` (drag cell), `.tier-result` (search row), `.tier-color-picker button`, `.tier-row-chrome` all rely on browser-default focus rings which are often suppressed by `outline: 0` upstream. Tab through the editor and you can lose the focus indicator entirely. Fix: add `:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }` to each. **Mechanical.**
- **Tier S/A/B/C/D/E/F palette is not theme-aware** — [constants.ts:7-15](../../../src/lib/tier-list/constants.ts#L7). Seven hardcoded hexes (`#FF7676`...`#FF8AC4`) baked in. The comment claims WCAG-AA against `#151419` only — but the project supports a light theme (per `--color-bg-*` token system in `globals.css`). On a light theme the saturated pastels lose contrast against `#0a0a0a` label text *and* against light backgrounds. Fix: define `--tier-color-1..7` tokens in `globals.css` that flip per `[data-theme]`, then have `TIER_COLORS` reference the tokens at render time. Otherwise document explicitly that /tierlist is dark-only. **Design call.**
- **Search results `role="listbox"` lacks `aria-activedescendant` + keyboard navigation** — [RepoSearchBox.tsx:88-117](../../../src/components/tier-list/RepoSearchBox.tsx#L88). The `<div role="listbox">` contains buttons with `role="option"` + `aria-selected={false}` (always false — never tracks the focused option), and the input doesn't `aria-controls` / `aria-activedescendant` the listbox. Keyboard users can Tab into the listbox but lose typeahead's "down-arrow to select" expectation. Fix: wire arrow-key handling on the input that moves a `activeIndex` state, set `aria-activedescendant={resultId}` on the input, and `aria-selected={i === activeIndex}` on each option. **Mechanical.**
- **`Avatar.tsx` monogram fallback hardcodes `#F56E0F` background** — [Avatar.tsx:51-52](../../../src/components/tier-list/Avatar.tsx#L51). Not theme-aware. Should be `var(--acc)` (the brand accent token). Same hardcode also fails when the brand color shifts seasonally. Fix: replace `backgroundColor: "#F56E0F"` with `backgroundColor: "var(--acc)"`. **Mechanical.**

## P2 findings (polish / drift)

- **Loading skeleton uses `--v3-bg-050` / `--v3-bg-100`** — [loading.tsx:11, 15, 18, 27](../../../src/app/tierlist/loading.tsx#L11). The shipped page renders under `.tierlist-page` which uses `--bg-*` / `--v4-*` tokens. Generation mismatch (skeleton on V3 tokens, page on V4) means a swap-in flash during navigation. **Design call.**
- **Error page mixes V2 tokens (`--v2-sig-red`, `--v2-ink-*`) with V4 surface** — [error.tsx:23, 33, 42](../../../src/app/tierlist/error.tsx#L23). Same drift as loading.tsx — three different token generations live in one route. **Design call.**
- **`.tier-item` is `cursor: grab` even on touch where it's a `<button>`** — [tier-list.css:351](../../../src/components/tier-list/tier-list.css#L351) sets `cursor: grab` on the wrapper, but on mobile the desktop drag handle is `hidden` and a *separate* button (the tap-to-open-picker variant) is shown. So mobile users see a grab cursor (if anything) on a button that doesn't drag. Cosmetic on touch but signals drag-not-supported elsewhere. Fix: scope `cursor: grab` to `.tier-item:has(button.cursor-grab)` or move it to the drag-handle button itself. **Mechanical.**
- **`.tier-item .nm` max-width 220px** ([tier-list.css:358](../../../src/components/tier-list/tier-list.css#L358)) — a long owner/repo (`huggingface/transformers`) gets ellipsized. The owner segment carries the brand association ("which org wrote this") so the ellipsis hits the part users want to read. Consider showing only `repo.name` once `displayName` is in `itemMeta` (already populated at [RepoSearchBox.tsx:23-26](../../../src/components/tier-list/RepoSearchBox.tsx#L23)). **Design call.**
- **`.tier-pool` border is `dashed`** ([tier-list.css:397](../../../src/components/tier-list/tier-list.css#L397)) — dashed borders typically signal "placeholder / inactive". The pool is the primary input region. A solid 1px `--line-300` reads as "real container", not "WIP zone". **Design call.**
- **Hint section renders even when there's no real interaction yet** — [TierListEditor.tsx:117-138](../../../src/components/tier-list/TierListEditor.tsx#L117). The `Hint` panel ships full 4-step instructions in a `.tier-side` aside. After first-time use it's clutter. Fix: dismiss-once + localStorage flag, or fold into a small `?` toggle. **Design call.**
- **`tier-toolbar .lbl` "Pool" + "Templates"** are uppercase mono eyebrows ([tier-list.css:84-89](../../../src/components/tier-list/tier-list.css#L84)) but `tier-title-meta` uses the same look at the same vertical band ([tier-list.css:67-73](../../../src/components/tier-list/tier-list.css#L67)). Two eyebrows that close to each other compete for attention. Drop the toolbar labels (the controls are self-explanatory). **Design call.**
- **`MobileTierPicker.tsx:264` `text-[var(--v4-red)]`** uses raw CSS-var-in-Tailwind escape — the rest of the file uses theme tokens. Drift; works but inconsistent. **Polish.**
- **`onDragEnd` doesn't validate `MAX_ITEMS_PER_TIER`** — [TierBoard.tsx:47-56](../../../src/components/tier-list/TierBoard.tsx#L47) hands off to `moveItem` which silently no-ops at the tier cap ([client-store.ts:158](../../../src/lib/tier-list/client-store.ts#L158)). User drags an item, drops it on a full tier, nothing happens, no toast. Fix: surface a `toast.error("Tier full — 10 items max")`. **Mechanical.**

## What's working well

- **No `<FreshnessBadge>` misuse** — the page is correctly NOT claiming a freshness budget (it's a static editor, not a feed). The honest-chrome violation is only at the `.live` decoration, not at the badge level.
- **MobileTierPicker is a model implementation**: CSS-only transitions, `prefers-reduced-motion` bypass, Escape-to-close, body scroll lock, `role="dialog" aria-modal="true"`, modal scrim at `bg-black/60` (the documented FP). The 220ms duration sits inside the 120-180ms-to-non-bouncy band's tolerance for sheet-style transitions.
- **Drag-drop pattern uses dnd-kit correctly** — `PointerSensor` with `distance: 4` activation constraint (prevents accidental drag on click), `KeyboardSensor` registered (even though placement keyboard a11y has a separate hole — see P0 #3).
- **Mobile fallback exists**: `MobileTierPicker` is a deliberate "tap-to-place" alternative to long-press drag, with the cited NN/g rationale in the file header.
- **Tier color picker is keyboard reachable**: `setPickerOpen` toggles + focus on Tab via `focus-visible:opacity-100` ([TierBoard.tsx:129, 139, 150, 161](../../../src/components/tier-list/TierBoard.tsx#L129)).
- **Mobile-specific tap target exists**: separate `inline-flex md:hidden` button at [TierBoard.tsx:270-277](../../../src/components/tier-list/TierBoard.tsx#L270) opens the bottom sheet — touch users don't have to discover the drag handle.
- **Tier removal preserves items**: `removeTier` re-buckets the items back into the unranked pool ([client-store.ts:244](../../../src/lib/tier-list/client-store.ts#L244)) instead of silently deleting.
- **2px radii respected** — `rounded-[2px]`, `rounded-[3px]` (loading + picker buttons + tier-item swatch). No card shadows; `--shadow-card` resolves to `none` ([globals.css#L326](../../../src/app/globals.css#L326)) so the `box-shadow: var(--shadow-card)` on `.tier-results` ([tier-list.css:120](../../../src/components/tier-list/tier-list.css#L120)) is effectively a no-op (defensive, fine).
- **CLI baseline FP recalibration honored**: the `bg-black/60` at [MobileTierPicker.tsx:117](../../../src/components/tier-list/MobileTierPicker.tsx#L117) is a documented modal scrim — not flagged as new per wave-1 punch list.
- **Outbound `Share on X` opens in new tab** with `noopener,noreferrer` ([ShareBar.tsx:111](../../../src/components/tier-list/ShareBar.tsx#L111)). Honest outbound contract.
- **`MAX_ITEMS_TOTAL = 70`** + `MAX_ITEMS_PER_TIER = 10` caps prevent unbounded state — defensive design.

## Verify-in-context
- **Tier palette theme-awareness** (P1 #5) — operator to confirm: is /tierlist intentionally dark-only, or should the seven hexes become CSS-var tokens that flip per `[data-theme]`?
- **Tier letter typography** (P1 #2) — sans vs mono. Current desktop sans choice may be deliberate per `~/.claude/plans/trendingrepo-tier-typed-hanrahan.md` plan callout. Confirm intent before changing.
- **`Hint` panel** (P2 #6) — keep or auto-dismiss after first interaction?

## Mechanical fixes ready to ship

1. P0 #1 — drop `.live` class from `<span>share-ready</span>` at [page.tsx:52](../../../src/app/tierlist/page.tsx#L52).
2. P0 #2 — drop `.live` class from `<span>live</span>` at [page.tsx:67](../../../src/app/tierlist/page.tsx#L67); pick a neutral `active` eyebrow.
3. P0 #3 — make `.tier-item-controls` always-visible (or visible on `:focus-within`) so keyboard users can reach the per-item placement `<select>`.
4. P1 #1 — bump tap targets: `.ico-btn → min-height: 44px`, `.tier-result → 48px`, `.tier-color-picker button → 28×28 + 8px padded hit area`, `.tier-row-chrome → 28×28`.
5. P1 #3 — swap `confirm(...)` for `<ConfirmDialog>` at [TierListEditor.tsx:103](../../../src/components/tier-list/TierListEditor.tsx#L103).
6. P1 #4 — add `:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }` to `.tier-item`, `.tier-result`, `.tier-color-picker button`, `.tier-row-chrome`.
7. P1 #7 — replace hardcoded `#F56E0F` in `Avatar.tsx` with `var(--acc)`.
8. P2 #6 — wire `toast.error` on `moveItem` no-op (when target tier is at cap).

## Quick-fix patches

### P0 #1 + #2 — drop hardcoded `.live` chrome

Before ([page.tsx:50-53, 67](../../../src/app/tierlist/page.tsx#L50)):
```tsx
<div className="clock">
  <span className="big">S / F</span>
  <span className="live">share-ready</span>
</div>
...
<span className="t-foot"><span className="live">live</span><span className="ar">-&gt;</span></span>
```

After:
```tsx
<div className="clock">
  <span className="big">S / F</span>
  <span className="muted">share-ready</span>
</div>
...
<span className="t-foot"><span className="muted">editor</span><span className="ar">-&gt;</span></span>
```

(or invent a neutral `.eyebrow-static` class in globals.css if a dedicated style is wanted — the rule is: only `<FreshnessBadge>` may render LiveDot chrome).

### P1 #1 — 44×44 tap targets

```css
.ico-btn { min-height: 44px; padding: 0 14px; }
.tier-result, .tier-result-empty { min-height: 48px; }
.tier-row-chrome { width: 28px; height: 28px; }
.tier-color-picker button { width: 28px; height: 28px; }
```

### P1 #7 — themed Avatar fallback

Before ([Avatar.tsx:51-52](../../../src/components/tier-list/Avatar.tsx#L51)):
```ts
backgroundColor: "#F56E0F",
color: "#0a0a0a",
```

After:
```ts
backgroundColor: "var(--acc)",
color: "var(--ink-on-acc, #0a0a0a)",
```
