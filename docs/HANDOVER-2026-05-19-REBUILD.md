# Handover — TrendingRepo UI rebuild (2026-05-19)

## ✅ Rebuild complete — Phase A landed 2026-05-19

The UI v6 rebuild is on disk on `fix/csp-clerk-cname-fonts`. 14 routes
shipped across 13 commits since the shell foundation (`8fdc0af7f`).
Every public page Mirko wired in the new HTML design is now a real
Next.js App Router route, reading from the documented `src/lib/*`
accessors. Compare and tier-list APIs (formerly 410-stubbed) are
**restored**. The remaining 13 admin + OG 410 stubs continue their
48h HOSTUP access-log soak.

| Route | Commit | Notes |
|---|---|---|
| Foundation (`shell.css` + `shell.js` + layout shell components) | `8fdc0af7f` | The 879 uncommitted Phase 2A archive ops were bundled into this Phase 0 commit for expediency. The split shape Mirko originally planned (stub / archive / docs) didn't happen, but the on-disk state matches what those commits would have produced. |
| `/` Trending hub | `696fcd35f` | |
| `/breakout` | `6d3dc35b9` | |
| `/market-signals` | `324c8e21b` | |
| `/repo/[owner]/[name]` repo detail | `85dea9845` | |
| `/funding` | `330eddf5a` | |
| `/agent-commerce` | `4448c75ec` | |
| `/revenue` | `816349780` | |
| `/tools` | `658d3ecba` | Absorbed legacy `/build` so the tools hub is the single discovery surface. |
| `/account` | `b554e2108` | Sub-tabs for overview / watchlist / alerts / referrals / billing / api-keys / drops / settings. |
| `/drop` | `010d5969e` | Anonymous-OK steps 1-3; Clerk-gated submit on step 4. |
| `/ideas` + `/ideas/[id]` | `d120a38a0` | Board + workspace, reactions wired through `/api/reactions`. |
| `/preview` | `16c432a68` | Launcher tile grid. |

**See:** [UI-REBUILD-CONTRACT.md](UI-REBUILD-CONTRACT.md) for the data
spine the rebuild plugs into, and [UI-V6-SHELL.md](UI-V6-SHELL.md) for
the shell token reference, `window.TR.*` public API, and markup contracts.

---

**Original handover text (kept for archeology — read above first):**

**For the next session that receives Mirko's new HTML design files.**

> Load this file at session start. It briefs you on what's already been done,
> what's preserved, what's archived, and how to wire the new HTML onto the
> surviving data spine.

---

## ROLE — read first

You are the **rebuild engineer**. Mirko (founder/technical lead, AISO.Tools +
Trending Report) has just finished a 2-day teardown of the entire UI v4
layer in this Next.js 15 / Tailwind v4 / React 19 codebase. You are picking
up here to wire **new HTML files (which Mirko will provide)** onto the
already-prepared data spine.

Your job is **NOT** to design. The new HTML files are the design source of
truth. Your job is to:

1. Receive HTML files from Mirko (paste, attachment, or path in repo).
2. Convert them into Next.js App Router routes (`src/app/<route>/page.tsx`).
3. Wire each route to the documented `src/lib/<source>.ts` accessors —
   never bypass with `readFileSync`, never re-import from `_archive/`.
4. Verify each page renders, calls the right API/lib, and passes the
   freshness/cache contracts laid out in `docs/UI-REBUILD-CONTRACT.md`.

Mirko's operating style — read `~/.claude/CLAUDE.md` + `CLAUDE.local.md` if
you have access:
- "Boil the ocean" — ship the complete thing, tests + verification + permanent solve.
- K1-K4: think before coding, simplicity first, surgical changes, verify before claiming done.
- Short replies (`yes`, `ship`, `do it`) = trust + green-light. Don't ask for re-confirmation.
- Visual fix needs visual proof (screenshot via Playwright; dev server :3023).
- Voice-transcribed prompts may be messy — resolve ambiguity by reading files / running commands, not by asking.

---

## CURRENT STATE

**Branch:** `fix/csp-clerk-cname-fonts` (yes, the name is unrelated). The
route rebuild is now committed in small route-sized commits:
`8fdc0af7f` shell foundation, then `/`, `/breakout`, `/market-signals`,
`/repo/[owner]/[name]`, `/funding`, `/agent-commerce`, and `/revenue`.

**Working tree:** still large and shared. The route rebuild commits are on
`HEAD`, but archive/docs/residue are still dirty. Do not bulk-stage; use exact
paths only if Mirko asks for a commit.

**Production state:** untouched on `main`. None of this has shipped yet.

**Dev server:** likely running on `http://localhost:3023`. If not, `npm run dev`.

**Post-handoff correction:** the live workspace has moved past the placeholder
home. Current rebuilt routed pages are `/`, `/breakout`, `/market-signals`,
`/repo/[owner]/[name]`, `/funding`, `/agent-commerce`, and `/revenue`.

### What's on disk now

```
src/app/
  layout.tsx              — providers + ClerkProvider + rebuilt HTML shell mount
  page.tsx                — rebuilt trending hub reading derived repo + source-count spine
  breakout/page.tsx       — rebuilt breakout radar using top movers + arXiv-linked repos
  market-signals/page.tsx — rebuilt market signals cockpit using source counts + npm + arXiv
  repo/[owner]/[name]/page.tsx — rebuilt repo detail using derived repos + profiles + events
  funding/page.tsx        — rebuilt funding radar using funding-news + SEC Form D + repo matcher
  agent-commerce/page.tsx — rebuilt x402/MCP/a2a protocol radar
  revenue/page.tsx        — rebuilt revenue terminal using overlays + TrustMRR catalog
  globals.css             — app reset/base; public/shell.css loaded by root layout
  api/                    — 143 route files (29 Phase 2A 410 stubs; 30 total 410 including legacy pipeline/sidebar-data)
  sign-in/[[...sign-in]]/page.tsx   — Clerk <SignIn /> directly
  sign-up/[[...sign-up]]/page.tsx   — Clerk <SignUp /> directly
  feeds/, docs/, x402/    — surviving non-page routes (RSS, etc.)
  sitemap*.xml/, robots.ts, llms.txt/, llms-full.txt/, [indexnowKey]/, .well-known/

src/components/
  providers/{Store,PostHog}Provider.tsx     — KEEP
  analytics/PostHog{Identify,Pageview}Bridge.tsx — KEEP
  auth/ClerkRefHandoff.tsx                  — KEEP
  consent/ConsentBanner.tsx                 — KEEP
  util/IdleMount.tsx                        — KEEP
  shell/{Sidebar,Topbar,Ticker,Statusbar,NavLink,FreshnessPill}.tsx — rebuilt HTML shell
  trending/{KpiStrip,MentionSourcePips,RepoSparkline,SourceHealthGrid,TopMoversRail,TrendingHubHero,TrendingTable}.tsx
  breakout/{BreakoutHero,BreakoutList,BubbleMap,TierHeatStrip}.tsx
  market-signals/{ArxivPapersTable,CrossSourceFeed,NpmAcceleratingTable,SignalsHero,SignalsKpiStrip,SourceFilterRail,TagMomentumHeatmap,VolumeAreaChart}.tsx
  repo/{MaintainersRow,MentionTimelineStrip,OrgFundingCard,RelatedReposCard,ReleasesCard,RepoActivityFeed,RepoHeroCard,RepoKpiStrip,SourceBreakdownGrid,StarHistoryChart,WatchButton,WhyTrendingPanel}.tsx
  funding/{CapitalFlowChart,ConfidenceChipsBlock,FoundersCta,FundingHero,FundingKpiStrip,FundingSourcePills,FundingTape,InvestorChips,SecFormDFeed,SectorHeatmap,TopRoundsTable}.tsx
  agent-commerce/{AcKpiStrip,AgentCommerceHero,CompositeMoversBoard,OnchainSettlements,ProtocolPulseGrid,ScoreDistributionHistogram,TokenGainersTable,TokenLosersTable,TopFacilitatorsTable}.tsx
  revenue/{CategoryFilterPills,FoundersCtaRevenue,RevenueHero,RevenueKpiStrip,RevenueLeaderboard,RevenueValueStrip,TrackedOssCards}.tsx
  (legacy Header/Sidebar, Card, Badge, etc. remain archived)

src/lib/
  ~117 top-level .ts files (was 131 before yesterday's teardown)
  data-store.ts             — Redis source of truth (CRITICAL)
  trending.ts, agent-commerce.ts, reddit-data.ts, etc. — accessors
  + 38 subdirectories, each with _README.md or _PARKED.md status header

_archive/ui-v4/             — every archived file (~830+ files)
  src/app/{about,admin,agent-commerce,...}/  — all archived pages
  src/components/{ui,layout,terminal,...}/    — all archived visual components
  src/lib/{browser-alerts,bubble-pack,...}.ts — archived UI-only helpers
  scripts/{add-funding-alias,seed-ai-unicorn-repos,...}.mjs

tsconfig.json — excludes `_archive` from typecheck
docs/UI-REBUILD-CONTRACT.md — what's stable, what's alive
docs/UI-LAYER-INVENTORY.md  — what was in V1/V2/V3/V4 (archeology map)
docs/HANDOVER-2026-05-19-REBUILD.md — this file
public/shell.css, public/shell.js — rebuilt shell CSS/behavior from the new HTML handoff
```

### Verification at handoff (all green)

| Gate | Status |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint:guards` | 10/10 sub-checks OK |
| `npm run build` | compiled successfully |
| Dev server boot | 7.5s on :3023 |
| Representative surviving routes (curl) | all 200 |
| Representative Phase 2A stubs (curl) | all 410 |
| Auth routes | 400/401/200 (expected) |

Current continuation verification (Codex, 2026-05-19):
- `npm run lint -- --quiet` passed.
- `npm run typecheck` passed.
- `npm run test:hooks` passed: 12 files, 79 tests.
- `npm test` passed: 1324 tests.
- `npm run lint:guards` passed. Advisory only: `lint:v3-budget` says six old
  V3 token-pattern counts dropped and the snapshot can be updated later.
- `npm run build` passed on Next 15.5.18. It generated 72 static pages.
  `scripts/sanitize-next-traces.mjs` updated 97 trace files and removed
  114984 local entries.
- Trace scan after build: 173 `.nft.json` files, 0 hits for `_archive`,
  `.tmp`, local `C:\dev` / `C:\Users\mirko`, snapshot PNG/HTML, or zip artifacts.
- Standalone route probes on `http://127.0.0.1:3024` returned 200 for `/`,
  `/breakout`, `/market-signals`, `/funding`, `/agent-commerce`, `/revenue`,
  `/repo/vercel/next.js`, `/sitemap-repos.xml`, and `/api/healthz`.
- Freshness endpoint probe is blocked by stale local bundled data, not UI
  compilation: with a local-only dummy `CRON_SECRET`, `npm run freshness:check
  -- --base-url http://127.0.0.1:3024 --timeout-ms 20000` returned
  `health=stale`, `blocking_non_green=28`, `advisory_non_green=15`,
  `Sentry: MISSING`.
- HOSTUP/Cloudflare header check: `https://trendingrepo.com` returned
  `HTTP/1.1 200 OK`, `Server: cloudflare`, no `X-Vercel-*`; `www` redirects
  308 to the apex with `Server: cloudflare`.

---

## WHAT'S 410-STUBBED (pending HOSTUP access-log soak)

After Phase A landed (2026-05-19), Compare (4 routes) and Tier-List
(3 routes) were **restored** — the rebuilt repo detail + launcher
surfaces consume them. That leaves **13 routes** still 410-stubbed
(admin) plus 9 OG image routes still 410-stubbed. The remaining stubs
continue their 48h HOSTUP / Cloudflare access-log soak. Do not use
Vercel preview or production deploys.

**DO NOT TOUCH THESE FILES.** If you accidentally restore them or revert the
stub, the soak is wasted and we risk an unexpected production break.

**Admin API (13 routes — `login` + `scan` kept alive):**
- `src/app/api/admin/{drop-events,ideas-queue,overview,pool-state,queues/repo,referrals,revenue-queue,scan-log,scrape/run,sentry-verify,soft-404,stats,unknown-mentions}/route.ts`

**OG image routes (9 routes):**
- `src/app/api/og/{agent-commerce,devto,mcp,reddit,referral/[handle],signals,star-activity,tier-list,top10}/route.tsx`

If the new HTML needs ANY of these data shapes, restore the real handler
from `git show <commit>:<path>` rather than touching the stub. Or surface
the data via a new endpoint that uses the surviving lib accessors.

---

## CONSTRAINTS — hard rules

1. **Never import from `_archive/`.** It's excluded from typecheck for a
   reason. If you find yourself needing an archived file, copy it back via
   `git mv _archive/<path> src/<path>` (preserve history) — but only if
   it's genuinely re-needed by the new design.

2. **Never write to `data/*.json` from the UI.** Pages READ via
   `src/lib/<source>.ts` accessors which read Redis via
   `src/lib/data-store.ts`. The collector layer (`scripts/`, `bin/`,
   `apps/trendingrepo-worker/`) owns writes.

3. **Page-level `revalidate`** — never zero on heavy pages; default 600-1800s.
   Pattern: `await refreshXFromStore()` once at top of RSC, then sync `getX()`.

4. **Freshness chrome must be honest.** Wire `lastUpdatedAt` to
   `classifyFreshness("<source>", iso)` from `@/lib/news/freshness`. No
   hardcoded "FRESH · 1H" / green-pulse LiveDot. Source slugs: `repos`,
   `skills`, `mcp`, `twitter`, `reddit`, `hn`, `bluesky`, `devto`,
   `lobsters`, `producthunt`, `arxiv`, `huggingface`, `github`, `npm`,
   `funding`, `x`, `claude`, `openai`.

5. **Clerk session check** — use `auth()` from `@clerk/nextjs/server` in
   RSC. NOT `useUser()` in server code.

6. **`tr_ref` cookie** is set by middleware on first touch with `?ref=<code>`.
   Don't re-implement referral logic in the page.

7. **TOOLBOX directive (Mirko, 2026-05-19):** long-term, every fetcher
   lives in `apps/trendingrepo-worker/` (Railway). Main-repo `bin/` +
   `scripts/` collectors are transitional. If you need a new data source,
   prefer adding it as a worker fetcher, not a main-repo script.

8. **No `git push --force` on `main`. No `git add -A` or `git add .`** —
   always stage specific files.

---

## DATA SPINE — what's alive (the rebuild's plug-in surface)

Full detail in [docs/UI-REBUILD-CONTRACT.md](UI-REBUILD-CONTRACT.md). Top-line:

**API endpoints surviving Phase 2A:**
- Core repos: `/api/repos`, `/api/repos/[owner]/[name]{,/aiso,/events,/freshness,/hover,/mentions}`
- Agent commerce: `/api/agent-commerce{,/[slug],/categories,/signals,/trending}`
- Categories + collections: `/api/categories`, `/api/collections{,/[slug]}`
- Funding: `/api/funding/{events,sectors}`
- Ideas: `/api/ideas{,/[id]}`
- MCP: `/api/mcp{,/trending,/usage,/record-call}`
- Model usage: `/api/model-usage/{overview,models,features,rankings,[modelId]}`
- Search: `/api/search`
- Profile: `/api/profile/[handle]`
- Reactions: `/api/reactions`
- Scoring: `/api/scoring/{consensus,engagement}`
- Skills: `/api/skills`
- Tools: `/api/tools/revenue-estimate`
- Twitter: `/api/twitter/{leaderboard,repos/[owner]/[name]}`
- OEmbed: `/api/oembed`
- OpenAPI schema: `/api/openapi.json`
- Stream: `/api/stream`
- Auth-gated: `/api/me/{profile,alert-rules*,alert-events}`, `/api/auth/session`, `/api/account/delete`, `/api/billing/portal`, `/api/checkout/stripe`, `/api/watchlist/private`
- Referrals: `/api/referrals/{intake,me}`
- Submissions: `/api/repo-submissions`, `/api/submissions/revenue`
- Newsletter: `/api/newsletter/{subscribe,confirm,unsubscribe}`, `/api/email/unsubscribe`
- Export: `/api/export/csv`
- Revalidate: `/api/revalidate` (post-deploy smoke uses this)
- Privacy: `/api/privacy/retention`
- Health: `/api/health{,z,/sources,/cron-activity,/portal}`, `/api/worker/{health,pulse}`
- Cron + webhooks (don't call from UI): `/api/cron/**`, `/api/pipeline/**`, `/api/webhooks/**`, `/api/internal/**`

**Lib accessors (in `src/lib/`):**
Every accessor follows: `await refreshXFromStore()` then `getX()`. 117 top-level files survive. See contract doc for full list grouped by domain (repo core, signals, agent commerce, funding, consensus, collections, compare, revenue, health, engagement, sidebar shell, infrastructure).

**Providers + middleware (auto-mounted by root layout):**
- `StoreProvider` (Zustand hydration), `PostHogProvider`
- `ClerkProvider` (when key present), `ClerkRefHandoff` (referral attribution)
- `PostHogIdentifyBridge`, `PostHogPageviewBridge`
- `ConsentBanner` (GDPR — legally required, keep visible)
- `IdleMount` (defer-mount utility)
- `src/middleware.ts` — Clerk auth + cost-guard + `tr_ref` cookie

**Zustand stores:**
- `src/lib/store.ts` — watchlist, compare, filters, sidebar slices (persisted to `trendingrepo-*` localStorage keys)
- `src/lib/tier-list/client-store.ts` — tier-list editor (if you rebuild that surface)

---

## WHEN MIRKO DROPS THE HTML

Suggested workflow when HTML lands:

### Step 1 — Survey the HTML
- Read each HTML file. Note: page name, sections, what data each section needs.
- For each "data hole" (a number, a list, a chart, a freshness timestamp),
  map it to a lib accessor in the contract doc.

### Step 2 — Pick one HTML file to convert first
- Recommend starting with the home page (`/`) — the contract is simplest
  (`refreshTrendingFromStore` + `getTrending`). Mirko's current placeholder
  already proves the data spine works on `/`.
- Convert HTML → JSX. Replace placeholders with `getX()` calls.
- Add `export const revalidate = 1800` (or appropriate).
- Add `<FreshnessBadge>` equivalent wired to `classifyFreshness`.

### Step 3 — Verify before moving on
- `npm run typecheck` → 0 errors
- `npm run dev` → page renders on :3023 with real data
- Playwright screenshot if visual change is substantive (M4: visual fix
  needs visual proof)

### Step 4 — Commit one route at a time
Suggested commit shape:
```
feat(ui): rebuild / home from new HTML design
feat(ui): rebuild /agent-commerce from new HTML design
...
```

Each commit should be deployable on its own. Don't bulk-commit 10 routes
in one go.

### Step 5 — When all routes are in, restore non-essentials
After core pages are live, return to:
- Restore `og/*` routes if the new design wants OG cards.
- Restore admin UI if Mirko asks (otherwise leave archived).
- Restore tier-list / compare features if the new design includes them.

---

## OPEN ITEMS for Mirko (before or during your session)

1. **Archive/residue commit cleanup.** Route rebuild commits are now on
   `HEAD`, but the shared working tree is still dirty with archive/docs/residue.
   Mirko should decide the remaining split. Do not use `git add -A`.
2. **48h HOSTUP access-log soak.** After commit + approved HOSTUP deployment,
   the 29 Phase 2A stubbed routes need 48h of clean access logs before final
   archive. Do not use Vercel preview or production deploys.
3. **Phase 2B (next week).** 13 ambiguous API routes get the same 410-stub
   treatment. 4 PARKED subdirs (`charts/`, `compare/`, `onboarding/`,
   `skills/`) get archived once confirmed no surprise consumers.
4. **TOOLBOX migration roadmap.** 18 main-repo scripts have worker
   counterparts; eventual retirement after rebuild stabilizes.
5. **Sentry global-error.tsx.** Currently archived; Sentry warning during
   build. Mirko can add a minimal one back when convenient — non-blocking.

---

## QUICK REFERENCE — commands you'll use most

```bash
# verify nothing broke
npx tsc --noEmit -p tsconfig.json
npm run lint:guards

# dev + smoke
npm run dev                              # :3023
curl http://localhost:3023/              # placeholder home
curl http://localhost:3023/api/healthz   # data spine alive

# add a new page (when HTML lands)
mkdir -p src/app/<route>
# write src/app/<route>/page.tsx  (RSC, wire to lib accessor)

# verify a specific route after change
curl -H "User-Agent: Mozilla/5.0" http://localhost:3023/<route>

# Playwright screenshot
node -e 'const {chromium}=require("playwright"); /* ... */'

# preserve git history when moving files
git mv <src> <dst>                       # NEVER plain `mv`

# kill stuck dev server (Windows)
powershell -Command "Stop-Process -Id $(netstat -ano | grep :3023 | head -1 | awk '\''{print $5}'\'') -Force"

# revert a Phase 2A step
git revert <commit-hash>                 # works cleanly because each step was its own commit
```

---

## DOCS YOU SHOULD READ FIRST

In order:

1. **`CLAUDE.md`** (project root) — project conventions, anti-patterns burned, where to look first
2. **`CLAUDE.local.md`** (project root) — Mirko's personal operator rules
3. **`docs/UI-REBUILD-CONTRACT.md`** — every surviving API endpoint, lib accessor, store, provider — your plug-in surface
4. **`docs/UI-LAYER-INVENTORY.md`** — what was in V1/V2/V3/V4, what got archived (in case you need to dig in `_archive/`)
5. **This file** (`docs/HANDOVER-2026-05-19-REBUILD.md`) — current state

Optional context:
- **`docs/ENGINE.md`** — every workflow + every API key + every cron + pool architecture
- **`docs/SITE-WIREMAP.md`** — every route → its data → collector → external API (refreshed 2026-05-02; will be stale post-rebuild)
- **`docs/OPERATOR.md`** — TL;DR situational awareness doc

---

## FAILURE MODES TO WATCH FOR

1. **Importing from `_archive/`.** Easy mistake. TypeScript won't catch it
   because `_archive/` is excluded. But the import path will resolve at
   runtime via Webpack's path-alias resolution and pull in archived code.
   Mitigation: never import using `_archive` in the path.

2. **Restoring a Sidebar/Header without thinking.** Yesterday's archive
   was intentional. The new HTML is the design source. Don't restore the
   old chrome — let the new HTML's chrome win.

3. **Hardcoding "live · 5m ago" instead of computing freshness.** Always
   compute via `classifyFreshness` so the badge is honest.

4. **Bypassing data-store for direct `data/*.json` reads.** Tempting
   when iterating fast. Don't. The pattern is canonical for a reason
   (production must treat bundled files as read-only; Redis is shared state).

5. **`grep -rn @/lib/X src/`** to find consumers — but excluding `_archive/`.
   Forgetting the exclusion will give you false positives.

6. **Not updating `perf/routes.json`** when adding a new page. The lint
   `check-routes-config` will catch this.

---

**Good luck. Read the contract doc, then ask Mirko for the HTML.**
