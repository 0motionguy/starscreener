# Mobile App Experience — Spec

**Branch:** `feat/mobile-app-experience-v1-20260720` (off `origin/main` @ `140bd7f46`) · **No deploy.**
**Model/workflow:** Opus 4.8, one writer + three read-only scouts (Phase 0). Wave-gated.

## Why

On a phone, TrendingRepo today renders the desktop terminal squeezed into a narrow viewport: the desktop hero, mono eyebrows, a hamburger that slides the desktop sidebar in as a drawer, the desktop control bar wrapped, and the global Ask agent as a **draggable HUD floating over the content** (see `MOBILE-APP-EVIDENCE.md`). That is responsive behavior, not an app. This program makes the phone a first-class app: app chrome, bottom nav, full-screen Search/Ask/Filter/More, purpose-built feed cards, safe-area handling, PWA — while the desktop terminal stays pixel-identical.

## Ground truth (corrects the master prompt's bindings)

The live design + shell system on this branch:

- **Design spine = `public/shell.css`** (16,121 lines, v6 tokens), linked in `layout.tsx:160`. Tokens: `--bg #08090a`, `--accent #ff6b35` (Liquid Lava), `--surface/-2/-3/-4`, `--fg/-muted/-subtle/-faint`, `--border/-subtle/-strong`, `--up #22c55e`/`--down #ff4d4d`, `--src-*`, `--r-1..4`, layout dims (`--topbar-h 56`, `--sidebar-w 232`, `--ticker-h 32`, `--statusbar-h 26`), `--ease`, `--overlay`, `--ring-focus`. `design/v4/tokens.css` (`--v4-*`) is **defunct/orphaned** — do NOT anchor here.
- **Shell = `src/components/shell/{Sidebar,Topbar,Ticker,Statusbar}` + `shell.css` + `shell.js`.** `layout.tsx` root: `<div class="app"><Sidebar/><Topbar/><Ticker/><main class="main">{children}</main><Statusbar/></div>` + `<AskDock/>`.
- **Current mobile = `shell.css @media (max-width:768px)`** (line 1510): `.app` collapses to one column, `.sidebar` → `position:fixed; translateX(-100%)` drawer, `.sidebar.open` slides in, `.hamburger` (in Topbar) toggles it via `shell.js`, `.searchbar` hidden, `--topbar-h→52`. **No bottom nav exists.**
- **Ask = `AskDock`** (`src/components/ask/AskDock.tsx`), the draggable HUD.
- Routes: see `MOBILE-APP-ROUTE-MATRIX.md` (authoritative). Only `/install` is nonexistent.

## Breakpoints

`mobile app ≤ 767.98px` · `tablet 768–1023px` · `desktop ≥ 1024px` — matching the existing `shell.css` cascade (1280 → 1024 → 768).

## Mobile information architecture

Bottom nav (5): **Radar** `/` · **Discover** `/breakout` · **Ask** (center primary, opens Ask surface) · **Watchlist** `/tools/watchlist` · **More** (bottom sheet).
More sheet groups (from `NAV_COMMANDS`): Tools (Top 10, Star History, Tier List, Compare), Market (Mentions, Funding, Revenue, Agent Commerce), Discover (Agents/Skills/LLMs/Models, Drop), Resources (Categories, Best Of, Collections, Blog, Glossary), Account (Profile), App (Install when installable).
App header (Wave 2 owns the dedicated header): brand · screen title · truthful freshness · search · profile.

## CSS policy (`mapp-` in shell.css)

- All new mobile CSS lives in a single grouped, prefixed section appended to `public/shell.css`: `mapp-` selectors, derived **only** from existing v6 tokens + `env(safe-area-inset-*)`. No new hex, no parallel language.
- New safe-area tokens: `--mapp-nav-h`, `--mapp-safe-top`, `--mapp-safe-bottom`, `--mapp-header-h`, `--mapp-content-bottom`. (Confirmed collision-free; `--mapp-*` unused today. `lint:v3-budget` does NOT touch CSS vars — safe.)
- `lint:shell-ds` bans inline `style={{}}`/hex in `src/components/shell/**`. Mobile components live in **`src/components/mobile/`** and style **exclusively via `mapp-` classes** (no inline styles), honoring the same single-source-of-truth rule.
- `lint:tokens` bans Tailwind grayscale utilities (`bg-zinc-*`, `text-gray-*`) — mobile uses `var(--*)` only.
- Same PR: swap the drawer's `height:100vh` → `100dvh` (`shell.css:1521`) + add `viewport-fit=cover` so `env(safe-area-inset-*)` resolves (today zero safe-area handling anywhere).

## One page tree (no duplication)

Do not duplicate `{children}`. Mobile chrome mounts alongside desktop chrome; CSS + a flag gate which shows. Wave 1 adds `<MobileAppChrome/>` (client) after the existing `.app` block, gated by `NEXT_PUBLIC_TRENDINGREPO_MOBILE_APP_V1`. When the flag is off, nothing mobile-app mounts and both desktop and the current mobile drawer are byte-for-byte unchanged.

## Waves

1. **App shell (this wave):** `MobileAppProvider` (sheet state: `search|ask|filters|more|null`, one-at-a-time, body-scroll-lock, focus restore, `mapp-on` root class on mount), `MobileBottomNav` (5 tabs, `aria-current`, 44px targets, safe-area), `MobileSheet` (full-screen, focus trap, Escape/back close, reduced-motion), `MobileMoreSheet`, `MobileAskSheet` (deterministic `matchNavCommands` nav-lite + Wave-2 note), `shell.css` `mapp-` section, flag mount, `100dvh` + `viewport-fit` fixes. Desktop unchanged; hamburger drawer retained as secondary.
2. **Search + Ask:** extract shared controllers from Topbar search + `AskDock`; full-screen `MobileSearchSheet` + `MobileAskScreen`; dedicated `MobileAppHeader`; demote hamburger.
3. **Radar/home:** shared view model from `getDerivedRepos()`/`Repo`/`CATEGORIES`/`FeaturedRepos`; `MobileRadarScreen`, mode/window selectors, filter sheet, featured carousel, `MobileRepoCard`. Desktop home untouched.
4. **Repo detail:** mobile header/hero/sticky section-nav around existing components; mobile chart controls.
5. **Secondary routes:** shared `MobileScreen` frame for `/breakout /market-signals /funding /revenue /agent-commerce /tools/* /account /drop /categories /best /collections /blog /glossary`.
6. **PWA + a11y + perf:** manifest (`id/scope/display_override/shortcuts/screenshots`), install prompt, offline shell + versioned SW, WCAG 2.2 AA, budgets (LCP≤2.5s/CLS≤0.05/INP≤200ms, shell JS ≤60KB gz), Playwright device matrix (iPhone SE/iPhone 14/Pixel 7/iPad Mini/Desktop Chrome).

## Acceptance (Wave 1)

Desktop pixel-identical ≥1024 · mobile shows 5-tab bottom nav + honors safe areas · only one sheet open at a time · body scroll locks/unlocks · **no horizontal overflow** at 320/360/375/390/414/430 (`documentElement.scrollWidth ≤ innerWidth`) · flag-off = zero change · `lint` + `lint:guards` (incl `shell-ds`) + `typecheck` + `build` + `test:e2e` green · `design-auditor` pass.

## Non-goals

Collectors, Redis data-store, ranking/scoring, payments, admin redesign, Vercel activation, React Native/Expo, desktop design-system replacement, wholesale `repair/agent-qa` merge.
