# UI Rebuild Contract — TrendingRepo

## Phase A complete — UI v6 landed 2026-05-19

The UI v6 rebuild Phase A is on disk on `fix/csp-clerk-cname-fonts` (not yet
shipped to `main`). 14 routes shipped across 13 commits since the shell
foundation. Read [HANDOVER-2026-05-19-REBUILD.md](HANDOVER-2026-05-19-REBUILD.md)
for the post-rebuild handoff summary; read [UI-V6-SHELL.md](UI-V6-SHELL.md)
for the shell token / `window.TR.*` API / markup-contract quick reference.

| Route | Commit |
|---|---|
| Foundation (`shell.css` + `shell.js` + layout shell components) | `8fdc0af7f` |
| `/` Trending hub | `696fcd35f` |
| `/breakout` | `6d3dc35b9` |
| `/market-signals` | `324c8e21b` |
| `/repo/[owner]/[name]` repo detail | `85dea9845` |
| `/funding` | `330eddf5a` |
| `/agent-commerce` | `4448c75ec` |
| `/revenue` | `816349780` |
| `/tools` (absorbed legacy `/build`) | `658d3ecba` |
| `/account` | `b554e2108` |
| `/drop` | `010d5969e` |
| `/ideas` + `/ideas/[id]` | `d120a38a0` |
| `/preview` launcher tile grid | `16c432a68` |

Phase 4C (gap-fill endpoints) shipped separately: idea claim /
contributions / saved are live, and `/api/build/*` + `/api/timeline/*`
plus `/api/me/api-keys` + alert-rule CRUD detail endpoints landed as
**501 stubs** so the new pages compile cleanly until the worker plumbing
catches up.

---

**Status:** Pre-teardown reference, written 2026-05-19. Updated 2026-05-19
after Phase A landed all 14 rebuilt routes. Original status header below
preserved for archeology.
**Purpose:** This document is the **stable surface** the next-gen UI plugs into. Every API endpoint, library accessor, Zustand store, provider, and middleware contract listed here survives the Phase 2 archive. If your new HTML calls something listed here, it works. If it calls anything else, you're calling archived code.

**Current rebuilt public pages:** `/`, `/breakout`, `/market-signals`,
`/repo/[owner]/[name]`, `/funding`, `/agent-commerce`, `/revenue`,
`/tools` (absorbed `/build`), `/account`, `/drop`, `/ideas`,
`/ideas/[id]`, and `/preview`. `perf/routes.json` covers all rebuilt
public pages plus the health probe.

## Phase 2A archive (2026-05-19)

**Restored after rebuild Phase A (2026-05-19):**
- `/api/compare/*` (4 routes) — RESTORED. Compare lib + share/payloads
  endpoints are alive again; the rebuilt `/repo/[owner]/[name]` detail
  flow + the `/preview` launcher reference them.
- `/api/tier-lists/*` (3 routes) — RESTORED. Tier-list templates and
  share lookups are live for the rebuilt surfaces; the client Zustand
  store at `src/lib/tier-list/client-store.ts` continues to drive the
  editor.

**Still 410-stubbed (HOSTUP/access-log soak continues; do not use Vercel):**
- `/api/admin/*` (13 routes — see §1.4) — 410 stubbed
- `/api/og/{agent-commerce,devto,mcp,reddit,referral,signals,star-activity,tier-list,top10}` (9 OG routes) — 410 stubbed

**Archived lib helpers** (gone, restore from `git log` if rebuild needs):
- `browser-alerts.ts`, `bubble-pack.ts`, `category-icons.ts`, `routes.ts`,
  `star-activity-url.ts`, `recent-viewed-repos.ts`, `toast.ts`,
  `use-fresh-count.ts`, `app-meta.ts`, `seo-repo-schemas.ts`,
  `trending-score.ts`, `trendshift-trending.ts`, `github-token-pool-aggregate.ts`,
  `reddit-topics.ts`
- `src/hooks/useToast.ts`
- `src/lib/hooks/{useToggleAlertRule,useFilteredRepos,useSortedRepos}.ts`

**Archived scripts:** `add-funding-alias.mjs`, `seed-ai-unicorn-repos.mjs`,
`email-test.mjs`, `fetch-dune-x402.mjs`, `fetch-mcp-registries.mjs`.
`scripts/reconcile-repo-stores.mjs` stays live because the funding matcher
and reconciliation tests still depend on it.

**Annotated subdirectories** (4 PARKED-FOR-REBUILD candidates for Phase 2B):
- `src/lib/charts/_PARKED.md` — 0 external consumers
- `src/lib/compare/_PARKED.md` — 0 external consumers
- `src/lib/onboarding/_PARKED.md` — 0 external consumers
- `src/lib/skills/_PARKED.md` — 0 external consumers

The remaining 15 subdirs (`analytics/`, `consent/`, `digest/`, `export/`,
`feeds/`, `hooks/`, `llm/`, `mcp/`, `newsletter/`, `observability/`,
`pool/`, `pricing/`, `referrals/`, `stripe/`, `tier-list/`) have `_README.md`
files documenting their live-consumer counts.

---

## 0. TL;DR — the data spine in 5 minutes

```
[ External APIs / Scrapers ]
        │
        ▼  ( bin/ + scripts/ + apps/trendingrepo-worker/ )
[ Collectors writing to Redis + data/*.json ]
        │
        ▼  ( src/lib/data-store.ts — three-tier read: Redis → bundled JSON → memory )
[ src/lib/<source>.ts — refreshXFromStore() + getX() ]
        │
        ├─► [ src/app/api/<route>/route.ts ]  (JSON over HTTP)
        │
        └─► [ src/app/<route>/page.tsx ]      (SSR/RSC consumption)
                │
                ▼  ( client hooks read from Zustand: src/lib/store.ts )
            [ React components ]
```

**Rebuild rule:** any new page/route must (a) call the per-source `refreshXFromStore()` once near the top of the RSC, (b) then call `getX()` for the data it renders. Never bypass and `readFileSync`. Never call collectors directly.

---

## 1. API endpoints (143 route files)

All under `src/app/api/`. None of these change as part of the archive — they're the JSON surface for both server pages and external callers (MCP, Portal, embeds).

### 1.1 Public read endpoints (data surfacing)

| Route | Returns | Notes |
|---|---|---|
| `GET /api/repos` | Trending repos list | Composite ranking from Redis |
| `GET /api/repos/[owner]/[name]` | Repo detail | Aggregated mentions, scores, history |
| `GET /api/repos/[owner]/[name]/aiso` | AISO portal readiness | |
| `GET /api/repos/[owner]/[name]/events` | GitHub event stream | |
| `GET /api/repos/[owner]/[name]/freshness` | Per-source last-fetched | |
| `GET /api/repos/[owner]/[name]/hover` | Hover-card payload | Light, fast |
| `GET /api/repos/[owner]/[name]/mentions` | Cross-source mention list | |
| `GET /api/agent-commerce` | x402 + agent-actionable index | |
| `GET /api/agent-commerce/[slug]` | Single agent-commerce entity | |
| `GET /api/agent-commerce/categories` | Category facets | |
| `GET /api/agent-commerce/signals` | Live signal ticker | |
| `GET /api/agent-commerce/trending` | Top movers | |
| `GET /api/categories` | Category list | |
| `GET /api/collections` | Curated collections | |
| `GET /api/collections/[slug]` | Single collection | |
| `GET /api/funding/events`, `funding/sectors` | Funding-radar payloads | |
| `GET /api/ideas`, `ideas/[id]` | Ideas/intake | |
| `GET /api/mcp`, `mcp/trending`, `mcp/usage` | MCP registry surfaces | |
| `GET /api/mcp/record-call` | MCP call telemetry intake | |
| `GET /api/model-usage/{overview,models,features,rankings,[modelId]}` | LLM model usage analytics | |
| `GET /api/profile/[handle]` | Public user profile | |
| `GET /api/reactions` | Reaction counts | |
| `GET /api/scoring/{consensus,engagement}` | Scoring debug | |
| `GET /api/search` | Repo/skill search | |
| `GET /api/skills` | Skills index | |
| `GET /api/tools/revenue-estimate` | Revenue benchmark surface | |
| `GET /api/twitter/leaderboard` | X/Twitter leaderboard | |
| `GET /api/twitter/repos/[owner]/[name]` | Per-repo Twitter mentions | |
| `GET /api/oembed` | OEmbed metadata | |
| `GET /api/openapi.json` | API schema | |
| `GET /api/stream` | SSE stream (live updates) | |

### 1.2 Auth-gated user endpoints

| Route | Purpose |
|---|---|
| `POST /api/auth/session` | Issue `ss_user` cookie for anonymous flow |
| `GET/PUT /api/me/profile` | Authenticated profile |
| `* /api/me/alert-rules`, `me/alert-rules/[id]`, `me/alert-rules/[id]/rotate-secret` | Alert rule CRUD |
| `GET /api/me/alert-events` | Alert event history |
| `POST /api/account/delete` | Account deletion |
| `* /api/watchlist/private` | Per-user watchlist |
| `POST /api/repo-submissions` | Submit a new repo |
| `POST /api/submissions/revenue` | Self-reported MRR |
| `* /api/referrals/{intake,me}` | Referral tracking |
| `POST /api/billing/portal`, `POST /api/checkout/stripe` | Stripe handoff |

### 1.3 Cron + pipeline (NEVER call from UI)

These live in `src/app/api/cron/**`, `src/app/api/pipeline/**`, `src/app/api/internal/**`, `src/app/api/webhooks/**`. They're invoked by:
- GitHub Actions workflows (`.github/workflows/*.yml`)
- scheduled automation (`vercel.json` legacy config / HOSTUP workflows)
- External webhooks (Clerk, Stripe)
- Internal pipeline scripts

The UI does NOT call these. If you find yourself wanting to, you want a public read endpoint instead.

### 1.4 Admin endpoints (ss_admin gated)

All under `src/app/api/admin/**`. Auth via `ss_admin` cookie set by `POST /api/admin/login`. Not part of the rebuild surface — admin UI can stay archived or be rebuilt last.

**Phase 2A (2026-05-19) status:** 13 admin endpoints stubbed with HTTP 410 Gone pending HOSTUP access-log soak:
`overview`, `stats`, `drop-events`, `scan-log`, `scrape/run`, `ideas-queue`,
`revenue-queue`, `referrals`, `queues/repo`, `pool-state`, `sentry-verify`,
`soft-404`, `unknown-mentions`. Only `POST /api/admin/login` (cookie issuer)
and `POST /api/admin/scan` (external scraper trigger) remain functional.
If the rebuild needs an admin endpoint, restore from `git log` rather than
re-implement.

### 1.5 Health + observability

- `GET /api/health`, `healthz` — overall service health
- `GET /api/health/portal`, `health/sources`, `health/cron-activity` — granular
- `GET /api/worker/health`, `worker/pulse` — Railway worker
- `GET /api/_internal/sentry-canary`, `admin/sentry-verify` — Sentry round-trip

---

## 2. Library accessors — `src/lib/`

The data spine. Every accessor follows the convention:

```ts
// In every src/lib/<source>.ts:
export async function refreshXFromStore(): Promise<void>;  // call once per request
export function getX(): XPayload;                          // sync read, returns last-known-good
```

**Internal rate-limiting:** every `refreshXFromStore` has a 30-second per-process throttle + in-flight dedupe, so calling it on every render is cheap.

### 2.1 Top-level accessors (alphabetical, ~130 modules)

Grouped by domain. Each module exports the `refreshXFromStore` / `getX` pair unless noted.

**Repo + trending core**
- `trending.ts` — top trending repos (main `/` data)
- `trending-score.ts` — scoring logic (pure functions)
- `recent-repos.ts`, `recent-viewed-repos.ts`
- `derived-repos.ts`, `derived-insights.ts`
- `manual-repos.ts` — curated overrides
- `repo-metadata.ts`, `repo-profiles.ts`, `repo-profile-input.ts`
- `repo-reasons.ts` — why a repo is trending
- `repo-related.ts` — adjacency
- `repo-mentions.server.ts` — cross-source mention server helpers
- `repo-ideas.ts`, `repo-submissions.ts`, `repo-intake.ts`
- `briefs.ts` — repo briefs

**Signals + sources** (`refreshXFromStore` pattern across all)
- `reddit.ts`, `reddit-all.ts`, `reddit-all-data.ts`, `reddit-baselines.ts`, `reddit-data.ts`, `reddit-topics.ts`
- `hackernews.ts`, `hackernews-trending.ts`
- `bluesky.ts`, `bluesky-trending.ts`
- `devto.ts`, `devto-trending.ts`
- `lobsters.ts`, `lobsters-trending.ts`
- `producthunt.ts`
- `arxiv.ts`
- `huggingface.ts`, `hf-datasets.ts`, `hf-spaces.ts`
- `npm.ts`, `npm-daily.ts`, `npm-dependents.ts`
- `trendshift-trending.ts`
- `research-signals.ts` — combined HF + arXiv
- `cross-source-mentions.ts`

**Agent commerce / x402**
- `agent-commerce.ts` — main accessor
- `agent-repos.ts`
- `base-x402-onchain.ts`, `solana-x402-onchain.ts`, `dune-x402-volume.ts`
- `model-usage.ts` — LLM-side
- `mcp-ranking.ts`, `mcp-detail.ts`

**Funding**
- `funding-news.ts`

**Consensus + verdicts**
- `consensus-trending.ts`, `consensus-verdicts.ts`

**Collections / leaderboards**
- `collections.ts`, `collection-rankings.ts`
- `ecosystem-leaderboards.ts`
- `hot-collections.ts`

**Compare / star activity**
- `github-compare.ts`, `compare-selection.ts`
- `star-activity.ts`, `star-activity-url.ts`

**Revenue tools**
- `revenue-benchmarks.ts`, `revenue-overlays.ts`, `revenue-startups.ts`, `revenue-submissions.ts`
- `trustmrr-url.ts`

**Health + freshness**
- `freshness-health.ts`, `source-health.ts`, `source-health-thresholds.ts`, `source-health-tracker.ts`

**Engagement / reactions**
- `engagement-composite.ts`, `reactions.ts`, `reactions-shape.ts`
- `use-fresh-count.ts`

**Sidebar shell**
- `sidebar-data.ts`, `sidebar-source-counts.ts`

**Infrastructure (non-data accessors)**
- `data-store.ts`, `data-store-reader.ts` — Redis/file/memory three-tier read
- `redis.ts` — Redis client (auto-picks ioredis vs Upstash REST)
- `env.ts`, `env-helpers.ts`, `bootstrap.ts` — env validation, runs at server boot
- `errors.ts`, `api-helpers.ts` — envelope + zod helpers
- `notify.ts`, `healthcheck.ts` — ops
- `seo.ts`, `seo-repo-schemas.ts`, `sitemap-xml.ts`, `indexnow.ts`, `routes.ts`
- `app-meta.ts`, `constants.ts`, `types.ts`, `utils.ts`, `filters.ts`
- `search-query.ts`
- `logos.ts`, `logo-url.ts`, `category-icons.ts`
- `mention-windows.ts`
- `repo-mentions.server.ts`
- `data-retention-policy.ts`, `drop-events.ts`, `adapter-fallthrough-alert.ts`
- `soft-404.ts`, `sentry-verification.ts`
- `aiso-persist.ts`, `aiso-queue.ts`, `aiso-tools.ts`
- `github-fetch.ts`, `github-events.ts`, `github-live.ts`, `github-repo-homepage.ts`, `github-user.ts`
- `github-token-pool.ts`, `github-token-pool-aggregate.ts`
- `profile.ts`
- `rss-feeds.ts`
- `toast.ts` — toast invocation helper
- `bubble-pack.ts` — used by charts (KEEP, pure logic)
- `toolbox-store*.ts` — toolbox state (5 files)
- `watchlist-items.ts`, `browser-alerts.ts`
- `why-narrative.ts`

### 2.2 Subdirectory accessors (`src/lib/<domain>/`)

| Domain | Purpose |
|---|---|
| `auth/` | Clerk integration: `clerk-config`, `clerk-appearance`, `redirect-url` |
| `db/` | Drizzle client, `client.ts` (postgres-js with `ssl:'require'` for Supabase pooler) |
| `stripe/` | Stripe SDK wrapper, webhook verification |
| `email/` | Resend / SMTP helpers |
| `newsletter/` | Subscribe + confirm + unsubscribe |
| `referrals/` | Referral cookie signing, attribution, qualifier |
| `webhooks/` | Webhook signature verification (Clerk svix, Stripe) |
| `digest/` | Weekly email digest assembly |
| `onboarding/` | Welcome modal gate, day-3/day-7 nudge state |
| `analytics/` | PostHog server-side identify |
| `consent/` | Cookie consent state read/write |
| `pipeline/` | Internal pipeline orchestration (refresh, ingest, persist, rebuild) |
| `pool/` | GitHub token pool aggregation |
| `signals/` | Twitter signal layer v1 |
| `twitter/` | Apify scrape + ingest + findings |
| `feeds/` | RSS/Atom feed generation |
| `export/` | CSV export |
| `top10/` | Top-10 embed payload |
| `tier-list/` | Server tier-list helpers + client Zustand store |
| `watchlist/` | Authenticated watchlist server helpers |
| `alerts/` | Alert rule schema, dispatch, cleanup |
| `compare/` | Compare payload + share helpers |
| `news/` | Freshness classification, `classifyFreshness('source', ts)` |
| `skills/` | Skills taxonomy |
| `mcp/` | MCP server-side helpers |
| `llm/` | LLM aggregation, model sync |
| `hooks/` | Reusable React hooks (KEEP if not visual) |
| `charts/` | Chart data shaping (logic; visual ECharts wrappers archive) |
| `funding/` | Funding round parsing |
| `agent-commerce/` | Agent commerce typing + aggregation |
| `api/` | Generic API helpers |
| `admin/` | Admin auth, queues |
| `observability/` | Sentry init, logging |
| `pricing/` | Pricing tier resolver |
| `types/` | Shared types |

### 2.3 Freshness classification (used by every page)

```ts
import { classifyFreshness } from "@/lib/news/freshness";

// Returns { status: 'live' | 'recent' | 'stale' | 'cold', minutesAgo, budget }
const verdict = classifyFreshness("skills", file.fetchedAt);
```

**Source ladders:** `repos`, `skills`, `mcp`, `twitter`, `reddit`, `hn`, `bluesky`, `devto`, `lobsters`, `producthunt`, `arxiv`, `huggingface`, `github`, `npm`, `funding`, `x`, `claude`, `openai`. Each has its own budget (12h for skills/mcp, 1h for hot sources, etc.).

---

## 3. Zustand stores

Only two. Both client-side.

### 3.1 `src/lib/store.ts` — main app store

Persisted to `localStorage` under key `trendingrepo-*` (migrated from legacy `starscreener-*`). Slices:
- **watchlist** — `{ items: WatchlistItem[], add, remove, has }`
- **compare** — `{ items: CompareItem[], toggle, clear, max: 4 }`
- **filters** — `{ category, sort, window }`
- **sidebar** — `{ collapsed, focused, focusedSection }`

The store hydrates from `<StoreProvider>` (kept alive — see Section 4).

### 3.2 `src/lib/tier-list/client-store.ts`

Tier-list editor state. Slices:
- `title`, `tiers`, `unrankedItems`, `addTier`, `resetAll`, `hydrate`
- URL-state encoding for share links

---

## 4. Providers and middleware (KEEP across archive)

These are functional plumbing. The archive must NOT touch them.

| File | Role | Imported by |
|---|---|---|
| `src/middleware.ts` | Clerk auth wrap + cost-guard + `tr_ref` first-touch referral cookie | Next.js auto |
| `src/components/providers/StoreProvider.tsx` | Zustand hydration on client | Root layout |
| `src/components/providers/PostHogProvider.tsx` | PostHog init | Root layout |
| `src/components/analytics/PostHogIdentifyBridge.tsx` | Identify on Clerk session | Root layout |
| `src/components/analytics/PostHogPageviewBridge.tsx` | Page tracking | Root layout (Suspense) |
| `src/components/auth/ClerkRefHandoff.tsx` | Pass `tr_ref` into Clerk sign-up | Root layout |
| `src/components/consent/ConsentBanner.tsx` | Cookie consent toggle | Root layout |
| `src/components/util/IdleMount.tsx` | Defer mount to requestIdleCallback | Wraps several bridges |
| `src/components/shell/Sidebar.tsx` | Rebuilt HTML left rail; legacy layout sidebar stays archived | Root layout |
| `src/components/shell/Topbar.tsx` | Rebuilt HTML topbar/search/share client island | Root layout |
| `src/components/shell/Ticker.tsx` | Rebuilt HTML global ticker | Root layout |
| `src/components/shell/Statusbar.tsx` | Rebuilt HTML footer/status strip | Root layout |
| `src/components/trending/*` | Rebuilt `/` trending hub components | `src/app/page.tsx` |
| `src/components/breakout/*` | Rebuilt `/breakout` components | `src/app/breakout/page.tsx` |
| `src/components/market-signals/*` | Rebuilt `/market-signals` components | `src/app/market-signals/page.tsx` |
| `src/components/repo/*` | Rebuilt `/repo/[owner]/[name]` components | `src/app/repo/[owner]/[name]/page.tsx` |
| `public/shell.css` | Rebuilt shell design tokens and layout CSS | Root layout `<head>` |
| `public/shell.js` | Rebuilt shell behavior: drawer, clocks, sharing, sparklines | Root layout after interactive |

Archived 2026-05-19, restore only if the rebuild explicitly needs them:
`src/components/feedback/ToasterLazy.tsx`,
`src/components/alerts/BrowserAlertBridgeLazy.tsx`, and
`src/components/v3/DesignSystemProvider.tsx`.

**Clerk pages (KEEP, stub UI):** `src/app/sign-in/`, `src/app/sign-up/`, `src/app/api/webhooks/clerk/`. The pages render Clerk's `<SignIn/>` and `<SignUp/>` components with appearance from `@/lib/auth/clerk-appearance`. The rebuild can re-style via `appearance` prop without changing route or logic.

---

## 5. Bootstrap order (server boot)

```
1. src/lib/bootstrap.ts        ← validates env vars; crashes app on misconfig
2. src/lib/db/client.ts        ← lazy postgres-js client (ssl:'require')
3. src/lib/redis.ts            ← picks REDIS_URL vs UPSTASH_* automatically
4. src/lib/data-store.ts       ← three-tier read facade
```

Every page calls accessors that touch (3) and (4) — `(1)` runs once at module load.

---

## 6. Example: a page using the data spine correctly

```tsx
// src/app/<route>/page.tsx
import { refreshTrendingFromStore, getTrending } from "@/lib/trending";
import { classifyFreshness } from "@/lib/news/freshness";

export const revalidate = 1800;  // ISR 30 min

export default async function Page() {
  await refreshTrendingFromStore();          // cheap if hot, fetches if cold
  const data = getTrending();                // sync, returns last-known-good
  const verdict = classifyFreshness("repos", data.fetchedAt);

  return <YourNewHtml data={data} verdict={verdict} />;
}
```

Anything more exotic than this pattern probably wants an API endpoint instead.

---

## 7. Surfaces that DO NOT survive the archive

For completeness, here's what's going away (don't try to import these in the rebuild):

- `src/components/ui/v4.css` and every `*.css` under `src/components/`
- `src/components/layout/{Header,Sidebar,AppShell,MobileNav*,MobileDrawer*}.tsx`
- `src/components/ui/*` (PageHead, KpiBand, VerdictRibbon, ErrorPanel, Card, CardHeader, CardBody, TerminalChromeBar, BarcodeStrip, MonoCaption, SectionHead, FreshnessBadge — visual)
- `src/components/charts/EChart.tsx` and every chart-wrapper component (data shaping in `src/lib/charts/` stays)
- All old `src/components/<feature>/` directories (agent-commerce, funding, signals, news, repo-detail, etc.) except the providers/wiring, rebuilt shell, and current rebuilt route folders listed in Section 4
- `src/app/<route>/page.tsx` for every visual route
- `src/app/<route>/loading.tsx`, `error.tsx`
- Old monolithic `src/app/globals.css` and `design/v4/tokens.css` content. Current branch uses a slim base `src/app/globals.css` plus `public/shell.css`.

The rebuilt repo detail page is live. Its sitemap entries intentionally omit
repo OG image blocks until a rebuilt `/repo/[owner]/[name]/opengraph-image`
route exists again.

These move to `_archive/ui-v4/` in Phase 2.

---

## 8. Critical conventions to preserve in rebuild

1. **Page-level `revalidate`** — never zero on heavy pages; default 600-1800 seconds.
2. **`refreshXFromStore` at top of RSC, then sync `getX()`** — cache lives in module state.
3. **`<FreshnessBadge>` (or its successor) must wire `lastUpdatedAt` to `classifyFreshness()`** — no hardcoded "FRESH" / green dots.
4. **Stripe checkout flow** — POST `/api/checkout/stripe` from client, redirect to returned URL.
5. **Clerk session check** — `auth()` from `@clerk/nextjs/server` in RSC, NOT `useUser()` in server code.
6. **`tr_ref` cookie** — set by middleware on first touch with `?ref=<code>`. Don't write referral logic in the page.
7. **`/api/revalidate` POST with `CRON_SECRET`** — the post-deploy smoke workflow flushes 5xx-cached ISR routes via this endpoint. Keep the endpoint, don't re-implement.

---

**End of contract. Anything not described here is implementation detail you can change. Anything described here is load-bearing.**
