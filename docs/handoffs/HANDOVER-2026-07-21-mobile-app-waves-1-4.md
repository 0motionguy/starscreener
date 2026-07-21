# HANDOVER — Mobile App Experience (Waves 1–4 shipped) → continue at "sizing-first, then Wave 5"

**Date:** 2026-07-21 · **Branch:** `feat/mobile-app-experience-v1-20260720` (off `origin/main@140bd7f46`, **not pushed, not deployed**) · **Model:** Opus 4.8 · **Flag:** `NEXT_PUBLIC_TRENDINGREPO_MOBILE_APP_V1=1`

A first-class mobile app experience layered over the desktop terminal, flag-gated, one page tree, desktop provably inert. Four waves are committed and live-verified. **The operator's standing #1 directive for the next session is an app-sizing pass — see Priority 0.**

---

## ⚡ PRIORITY 0 — APP-SIZING PASS (~20% smaller, do this FIRST)

Operator feedback (2026-07-21, verbatim intent): *"still buttons/navigation are TOO BIG — it reads like regular mobile-responsive, not an app. Go ~20% smaller on elements, but keep the KEY elements highlighted."*

This is a **density/craft pass, not a rebuild.** Everything works; it just needs to feel like a native app (Robinhood/Bloomberg density), not a shrunk website. All values below live in **`public/shell.css`** in the `mapp-` section (grep `MOBILE APP (mapp-)`, ~L16123→EOF). Shrink ~20%; **keep the accent/active/delta highlights loud.**

| Surface | Element | Now | → ~20% smaller | Keep highlighted |
|---|---|---|---|---|
| Bottom nav | `.mapp-tab` min-height | 52px | **44px** | active tab = `--accent` |
| | `.mapp-tab-center .mapp-tab-ico` (Ask disc) | 40px | **34px** | disc stays `--accent` (hero action) |
| | `.mapp-tab-label` | 10px | **9px** | active label `--accent` |
| | tab icons | 20/22px | **17/19px** | — |
| App header | height `--mapp-header-h` chain | 52px | **~46px** | title stays `--fg-bright` |
| | `.mapp-header-btn` / `.mapp-header-back` | 40px | **34px** | — |
| | `.mapp-header-title` | 15px | **13.5–14px** | — |
| Radar selectors | `.mapp-seg-item` min-height / font | 30px / 10px | **26px / 9px** | active seg = `--accent` on `--bg` |
| Repo card | `.mapp-card-avatar` | 20px | **18px** | — |
| | `.mapp-card-name` | 12.5px | **12px** | `.mapp-card-repo` stays bold `--fg-bright` |
| | `.mapp-card-delta` | 12.5px | **12px** | **keep** `--up`/`--down` color loud |
| | `.mapp-card-act` | 26px | **24px** | on-state `--accent` |
| | `.mapp-feed` gap | 5px | **4px** | — |
| Sheets | rows (`.mapp-*-row`, `.mapp-more-row`) | 46px | **42px** | — |
| | `.mapp-sheet-close` | 44px | **38–40px** | — |

**HARD CONSTRAINTS (do not break while shrinking):**
- **Search/Ask inputs stay `font-size: 16px`** (`.mapp-search-input`, `.mapp-ask-input`) — below 16px iOS Safari zooms on focus and breaks the no-overflow invariant. This is the one thing you cannot shrink.
- Keep `env(safe-area-inset-*)` padding on the nav + header + sheet bodies.
- After shrinking the nav, re-check `--mapp-nav-h` (currently 56 in `:root`) so `.mapp-on .main` bottom padding still clears it — set `--mapp-nav-h` to the new real height.
- This is a **deliberate density choice**: some touch targets dip below the 44px WCAG guideline. That's the operator's call (app density > loose targets); the *primary* tap area on each card is the whole `.mapp-card-r1` link (large), and the bottom-nav tabs stay ≥40px. Note it, don't "fix" it back up.

**Verify the pass:** dev flag-on (below), emulate 390 + 320, confirm the Radar still shows **≥10 repos/screen**, nothing overflows (`scrollWidth <= innerWidth`), desktop still inert at 1024. Screenshot before/after.

---

## 1. Branch state — 6 commits (newest last)

```
3b55d75e7 docs(mobile-app): spec + route matrix + evidence + design contract
4172a8b0f feat(mobile-shell): 5-tab bottom nav, sheets, safe-area, flag        [Wave 1]
b161a93fb chore(home): remove "Jump to an answer" block (operator ask)
67e438894 feat(mobile-search-ask): app header + full-screen Search + AI Ask     [Wave 2]
cf1f10ae2 feat(mobile-radar): dense app-native feed, ~10 repos/screen           [Wave 3]
ddc5ea1da feat(mobile-repo): back-aware detail header + mobile-safe detail       [Wave 4]
```

- **Not pushed.** Operator approves auto-commit on `feat/*` but confirm before push/PR.
- **Agent-QA WIP is parked** on `repair/agent-qa-2026-07 @ 75a3150c7` (25 files). Do NOT merge it wholesale into this branch.
- Spec docs: `docs/mobile-app/{MOBILE-APP-SPEC,MOBILE-APP-ROUTE-MATRIX,MOBILE-APP-EVIDENCE}.md` + `docs/DESIGN-SYSTEM.md §1.1`. Evidence screenshots (session-local, regenerate): `<scratchpad>/evidence/*.png`.

## 2. Architecture (what to touch)

- **Design spine = `public/shell.css`** (v6 tokens: `--bg #08090a`, `--accent #ff6b35`, `--surface/-2/-3`, `--fg/-muted/-subtle/-faint`, `--border*`, `--up #22c55e`/`--down #ff4d4d`, `--src-*`, `--r-1..4`, `--font-mono/-sans`, `--topbar-h 56→52@768`). **`--v4-*` is DEFUNCT — never use it.** All mobile CSS is the `mapp-` section at the end of shell.css.
- **Mobile components:** `src/components/mobile/` — `MobileAppChrome` (mount root) → `MobileAppProvider` (sheet state, scroll-lock, focus restore, adds `mapp-on` to `<html>`), `MobileAppHeader` (back-aware on `/repo/*`), `MobileBottomNav` (5 tabs), `MobileSheet` (focus-trap primitive), `MobileSearchSheet` / `MobileMoreSheet` / `MobileAskSheet`, `MobileRadarScreen` + `MobileRepoCard`. Shared: `src/lib/search/useGlobalSearch.ts`, `src/lib/mobile/repo-card-model.ts`.
- **Mount point:** `src/app/layout.tsx` renders `{mobileAppEnabled ? <MobileAppChrome/> : null}` after the `.app` div; `viewportFit:"cover"` on the viewport export.
- **Gating pattern (critical):** every `mapp-` element has a base `display:none` (top of the section) and is turned on **only** inside `@media (max-width:767.98px)` under `.mapp-on`. Desktop chrome (`.topbar/.ticker/.statusbar/.main .crumbs`) is hidden via `.mapp-on … {display:none}` at ≤767; `.mapp-on .app { grid-template-rows: 0 0 1fr 0 }`. **This is why desktop is byte-identical with the flag off — preserve it.**
- **Home feed reuse (no refetch):** `src/app/(home)/page.tsx` wraps the desktop composition in `<div className="mapp-hide">` (hidden ≤767) and renders `<MobileRadarScreen cards={toRepoCardModels(sorted,…)} …/>`. The mobile feed consumes the SAME server-sorted `Repo[]`. Mode/window selectors are `<Link>`s that set `?rank`/`?window` → server re-sorts (same contract as desktop `TrendingControlBar`).
- **Search/Ask reuse:** `useGlobalSearch` = the Topbar's `/api/search/global` + `matchNavCommands` contract. Ask uses `POST /api/navigator` (the same endpoint AskDock uses); real LLM answers need the prod worker key (dev shows the graceful fallback).

## 3. Run & verify

```bash
# dev with the mobile app ON (mobile chrome shows ≤767px):
NEXT_PUBLIC_TRENDINGREPO_MOBILE_APP_V1=1 npm run dev      # port 3023
# gates (all currently green):
npm run typecheck && npm run lint && npm run lint:guards && npm run build
```

- **Visual proof = chrome-devtools MCP** with CDP device emulation (NOT window resize — it floors at ~502px). `emulate 390x844x3,mobile,touch` → `navigate` → probe `documentElement.scrollWidth <= innerWidth`. Desktop regression: `emulate 1440x900x1`, confirm `.topbar/.sidebar/.ticker/.statusbar` present + `.mapp-header/.mapp-bottom-nav` `display:none`.
- **Playwright** flag-off default: `npm run test:e2e` (mobile-drawer spec passes). Browsers may need `npx playwright install chromium` after a fresh `npm install`.

## 4. Done vs remaining

**Done (verified):** Wave 1 shell · Wave 2 header+search+AI-ask · Wave 3 dense Radar feed (10/screen) · Wave 4 back-aware repo detail. Every wave: gates green, live-probed 320–1440, desktop inert.

**Remaining:**
- **Priority 0:** the sizing pass above (operator's standing ask).
- **Wave 5 — secondary routes:** give `/breakout`, `/market-signals`, `/funding`, `/revenue`, `/agent-commerce`, `/tools/*`, `/account`, `/drop`, `/categories`, `/collections` app framing via a shared `MobileScreen` frame (most already inherit header+nav+padding; check each for overflow at 320–430).
- **Wave 6 — PWA + a11y + perf:** manifest (`id`/`scope`/`display_override`/`shortcuts`/`screenshots`), install prompt, offline shell + versioned SW (network-first, never cache authed/volatile API), WCAG 2.2 AA audit, budgets (LCP≤2.5s/CLS≤0.05/INP≤200ms, shell JS ≤60KB gz), Playwright device projects (iPhone SE/iPhone 14/Pixel 7/iPad Mini/Desktop Chrome).
- **Deferred nits:** Ask voice input (no `mic` icon asset yet — the LLM path shipped); sticky section-nav (Overview/Growth/Signals/Community) + action sheet on repo detail; dedup the desktop `Topbar` onto `useGlobalSearch`; wire a truthful freshness indicator into `MobileAppHeader`.

## 5. Gotchas & learnings (read before touching)

- **STALE-BRANCH TRAP:** `origin/main` is the live prod line and was **535 commits ahead** of `repair/agent-qa-2026-07`. Early recon on the wrong branch produced an inverted picture. Always verify file structure on THIS branch; the 3 read-only scouts (design/token, route/data, QA) caught it — reuse that pattern for big unknowns.
- **`lint:shell-ds`** bans inline `style={{}}`/hex in `src/components/shell/**`. Mobile components live in `src/components/mobile/` and style **only** via `mapp-` shell.css classes (no inline styles). Keep them there.
- **`lint:tokens`** bans Tailwind grayscale (`bg-zinc-*`, `text-gray-*`). Use `var(--*)`. `lint:v3-budget` does NOT touch CSS vars — `--mapp-*` is safe.
- **Anti-slop hook false positive:** the Stop/PostToolUse slop-scan reports `public/shell.css` "13 placeholder/mock" — that's the substring `::placeholder` (standard CSS pseudo-element, 12 pre-existing + 1 mobile). **Do not chase it; do not remove input `placeholder` attributes** (they pair with `aria-label`).
- **Exact-file staging only** — never `git add -A`/`.` (parallel-session steal is a burned anti-pattern here). Stray root `*.png` are pre-existing orphans; leave them.
- **Dev-server orphan on Windows:** `TaskStop` kills the wrapper but leaves the `next dev` node process holding :3023 (EADDRINUSE on restart). Kill it: `for pid in $(netstat -ano | grep LISTENING | grep ':3023' | awk '{print $NF}' | sort -u); do taskkill //F //PID $pid; done`.
- **`useSearchParams` forces client bailout** on the ISR home route — `MobileRadarScreen` deliberately takes `params` as a prop + uses `usePathname` instead. Keep it that way.
- **Icons:** `<Icon name=… size=…>` from `src/components/icon/Icon.tsx` masks `/public/icons/<name>.svg` with `currentColor` (so it inherits token color). `<SourceLogo source=…>` for brand logos. Valid names used: radar, compass, messages-square, eye, grid, search, user, send, sparkles, bookmark(-fill), diff, external, arrow-left/right, chevron-right, close, x-circle, clock, hammer, dollar, book, key, download.
- **First paint:** `revalidate=1800` on home; cold start serves bundled JSON. Ask LLM answers need the prod worker key.

## 6. The bar (operator's benchmark)
One-handed: understand what's trending in 3s · change rank/window in 1–2 taps · open a repo & read the signal · save/compare without hunting · ask where to go · never open a desktop sidebar. **And it must feel like an app, not a shrunk site — density is the current gap.**
