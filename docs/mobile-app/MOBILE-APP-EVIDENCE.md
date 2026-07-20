# Mobile App — Baseline Evidence Ledger

**Branch:** `feat/mobile-app-experience-v1-20260720` @ `140bd7f46` · **Captured:** 2026-07-20
**Method:** Chrome DevTools MCP (CDP `Emulation.setDeviceMetricsOverride`) against local `npm run dev` (:3023). Overflow measured in-page as `documentElement.scrollWidth` vs `window.innerWidth`.

> Sampling note (honest): this is a **sampled** baseline (representative viewports/routes), not the full 9×13 matrix. Wave 1 verification produces the before/after comparison at 320/375/390/768/1024/1440; Waves 3–6 extend to the full route/device matrix via Playwright device projects.

## Captures

| # | Route | Viewport | Overflow (`scrollWidth − innerWidth`) | Chrome observed | Screenshot |
|---|---|---|---|---|---|
| 1 | `/` | 390×844 (mobile, dpr3) | **0** (none) | 52px top bar (hamburger + download + Share + Sign up; **no brand wordmark**), scrolling ticker, desktop hero h1 "Trending — the radar for everything AI", TRACKED-LIVE stat, answer chips. **No bottom nav.** Draggable orange **AskDock HUD** floats bottom-right. | `before-home-390.png` |
| 2 | `/` | 1440×900 (desktop) | **0** (scrollWidth 1425) | Full terminal: `.sidebar` + `.topbar` + `.ticker` + `.main` + `.statusbar` all present, `.app` grid intact. AskDock HUD bottom-right. | `before-home-1440-desktop.png` |

(Screenshots in the session scratchpad `evidence/`; regenerated in Wave 1 verification for the committed before/after set.)

## Findings — "responsive, not app"

1. **No bottom navigation** at any mobile width — mobile nav is exclusively the Topbar hamburger → desktop sidebar drawer.
2. **Ask is a draggable HUD** over the content (localStorage `ask-hud-pos`), overlapping bottom controls — the anti-pattern the app replaces on mobile.
3. **Desktop hero verbatim on mobile** — oversized h1 + desktop answer-chip grid instead of concise app copy + purpose-built feed.
4. **Brand wordmark absent** in the mobile top bar; no app-native header (title/freshness/search/profile).
5. **Zero safe-area handling** — no `viewport-fit=cover`, no `env(safe-area-inset-*)` anywhere in `src|public`; drawer uses `height:100vh` (not `100dvh`) → iOS dynamic-toolbar + notch/home-indicator collisions on real devices (not visible in emulator without device chrome).
6. **No horizontal overflow** at 390 or 1440 today — the current responsive layout is contained; the app layer must preserve this invariant (only existing guard: `tests/e2e/mobile-drawer.spec.ts` at 375, `/?cat=skills` only).

## Regression anchor

`before-home-1440-desktop.png` is the desktop baseline. After every wave, desktop at ≥1024 must match it (full sidebar/topbar/ticker/statusbar, `.app` grid, no overflow). Flag `NEXT_PUBLIC_TRENDINGREPO_MOBILE_APP_V1` OFF must reproduce it exactly.
