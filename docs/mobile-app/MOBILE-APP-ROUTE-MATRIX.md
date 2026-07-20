# Mobile App — Route Matrix & Data Contracts (authoritative)

**Branch:** `feat/mobile-app-experience-v1-20260720` (off `origin/main` @ `140bd7f46`)
**Verified:** 2026-07-20 by read-only route/data scout (Opus 4.8) against the live tree.

This is the single source of truth for the mobile IA → real route mapping. It supersedes the master prompt's route hints (which were written against a mix of states). Every row was confirmed by `Glob src/app/**/page.tsx` + reading `src/lib/nav-commands.ts`.

## Bottom-nav IA → routes

| Bottom tab | Target | Route | Exists | Source |
|---|---|---|---|---|
| Radar | Home | `/` | ✅ | `src/app/(home)/page.tsx` (route group; `revalidate=1800`) |
| Discover | Breakout + category hub | `/breakout` | ✅ | `src/app/breakout/page.tsx` — **singular** (`/breakouts` does NOT exist) |
| Ask | center primary | opens Ask surface | n/a | reuses `AskDock` engine, not a route |
| Watchlist | Watchlist | `/tools/watchlist` | ✅ | under `/tools` (top-level `/watchlist` does NOT exist) |
| More | bottom sheet | — | n/a | grouped routes below + Install |

## Full IA → route table

| IA label | Route | Exists | File / note |
|---|---|---|---|
| Radar (home) | `/` | ✅ | `(home)/page.tsx`; reads `?cat/?window/?sort/?rank/?lang` |
| Breakout | `/breakout` | ✅ | singular |
| Agents | `/?cat=agents` | ✅ | home category view (`getAgentsAsRepos()`), no standalone page |
| Skills | `/?cat=skills` | ✅ | home category view |
| LLMs | `/?cat=llms` | ✅ | home category view |
| Models | `/models` **or** `/?cat=models` | ✅ | standalone `src/app/models/page.tsx` + home param |
| Mentions / Market Signals | `/market-signals` | ✅ | `nav-commands` id `mentions` → `/market-signals` (no `/mentions` route) |
| Funding | `/funding` | ✅ | |
| Revenue | `/revenue` | ✅ | |
| Agent Commerce | `/agent-commerce` | ✅ | cost-guard 429s bot UAs — smoke with a browser UA |
| Watchlist | `/tools/watchlist` | ✅ | |
| Top 10 | `/tools/top-10` | ✅ | |
| Star History | `/tools/star-history` | ✅ | |
| Tier List | `/tools/tier-list` | ✅ | (`/tierlist` also exists as share pages; nav uses `/tools/tier-list`) |
| Compare | `/tools/compare` | ✅ | (`/compare/[...slug]` catch-all also exists) |
| Account / Profile | `/account` | ✅ | **not** `/you`; subroutes `/account/{alerts,api-keys,drops,referrals,settings}` |
| Drop a repo | `/drop` | ✅ | **not** `/submit` |
| Categories | `/categories` | ✅ | + `/categories/[slug]` |
| Best Of | `/best` | ✅ | exists (+ `/best/[topic]`) |
| Collections | `/collections` | ✅ | + `/collections/[slug]` |
| Blog | `/blog` | ✅ | exists (+ `/blog/[slug]`) |
| Glossary | `/glossary` | ✅ | exists (+ `/glossary/[term]`) |
| **Install** | — | ❌ | **only** truly nonexistent IA target → PWA / Add-to-Home-Screen affordance, never a route |

Wave 1 uses `NAV_COMMANDS` (`src/lib/nav-commands.ts`) verbatim as the canonical label+href registry for the bottom nav + More sheet — the same registry the Topbar ⌘K and AskDock use.

## Shared view models (reuse; do not duplicate)

- **`Repo`** — `src/lib/types.ts`. The canonical row model (this branch has NO `LiveRow`/`LiveTopTable` in the main tree). Mobile feed cards reuse this shape.
- **`getDerivedRepos()`** — `src/lib/derived-repos.ts:132` (React `cache()`). Single spam-filtered/scored/classified/decorated `Repo[]` backbone for home, `/api/search/global`, category adapters, compare, OG.
- **`CATEGORIES` / `WINDOWS` / `CategoryId` / `WindowId`** — `src/components/trending/TrendingHubHero.tsx`. Plus `SortId` (`momentum|mentions|stars|consensus`) + `RankerId` (`top|gainer|trend|discovery`) in the home page. The mobile mode/window/filter bar must emit these exact `?cat/?window/?sort/?rank` tokens.
- **`FeaturedRepos`** — `src/components/trending/FeaturedRepos.tsx`. 3-slot hero (TOP/BREAKOUT/DISCOVERY/TREND/NEW) → mobile featured carousel (Wave 3).
- **`RepoHit` / `LlmHit`** — `src/app/api/search/global/route.ts`. Search envelope for mobile Search (Wave 2).

## Ask engine (reuse; do not rebuild) — Wave 2

- **`AskDock`** — `src/components/ask/AskDock.tsx` (+ colocated `ask-dock.css`, `ask-agent.css`, `autopilot.css`). Mounted globally via `IdleMount` in `layout.tsx:146`.
- Capabilities: deterministic nav (`matchNavCommands` → `router.push`), page commands (`NAV_COMMANDS`), repo search (`/api/search/global?q=&repoLimit=&llmLimit=`), LLM fallback (`POST /api/navigator {q}`, 12s timeout), voice (Web Speech, feature-detected), page-operator + autopilot (gated by `NEXT_PUBLIC_TRENDINGREPO_AGENTIC_MODE==='1'`).
- Desktop keeps the draggable HUD (localStorage `ask-hud-pos`). Mobile gets a full-screen surface sharing the same controller (Wave 2). Wave 1's Ask tab uses only the deterministic `matchNavCommands` registry (no LLM duplication) + an honest "voice + AI in Wave 2" note.

## Data-store gate (do not break)

- Server components/route handlers call async `refreshXxxFromStore()` once at top, then sync getters read the in-memory cache (30s rate-limit + in-flight dedupe; three-tier Redis → bundled JSON → last-known-good).
- Home awaits 9 refreshes (trending/registry/star-activity/aa-llms/openrouter×2/stars-by-category/all-mentions/recent-drops). `/api/search/global` awaits trending + aa-llms.
- Namespace `ss:data:v1:<slug>` on HOSTUP Redis, written by the worker fleet. **Mobile reads via existing loaders only — never a new producer or `readFileSync(cwd,'data',…)`.**

## Do-not-break contracts

- Home URL params: `?cat` (`repos|agents|skills|llms|models`), `?window` (`1h|24h|7d|30d`), `?sort` (`momentum|mentions|stars|consensus`), `?rank` (`top|gainer|trend|discovery`), `?lang` (back-compat). Mobile tab bar must emit these exact tokens.
- `/api/search/global` field names (`repos:RepoHit[]`, `llms:LlmHit[]`, `totals`).
- `NAV_COMMANDS` hrefs must stay in sync with `src/components/shell/Sidebar.tsx`.
- ⌘K global handler lives in `Topbar.tsx` — mobile Ask must not double-bind it.
