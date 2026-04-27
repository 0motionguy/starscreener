# Tech Debt Audit — STARSCREENER (trendingrepo.com)

Generated: 2026-04-27
Skill: [ksimback/tech-debt-skill](https://github.com/ksimback/tech-debt-skill)
Scope: full repo, 5 parallel module audits, 139 findings dedup'd to 87 below.
Method: Phase 1 orient → Phase 2 dispatch (`apps/trendingrepo-worker`, `src/app`, `src/lib`, `src/components`, `scripts/cli/bin/mcp`) → Phase 3 synthesis.

---

## Executive summary

1. **Stripe webhook is one bad config away from silently 200-ing every event.** The handler at `src/app/api/webhooks/stripe/route.ts:46-72` runs a stub fallback if `@/lib/pricing/user-tiers` import fails — and then logs success while doing nothing. Combined with `src/lib/stripe/events.ts:124,176` using an in-memory `Set` for idempotency that resets on every Lambda cold start, **paying customers may not be receiving tier upgrades right now and Stripe sees 200 OK**. P0.
2. **`ai-blogs` fetcher is dead code in production.** Migration `20260429000000_blog_post_type.sql` is applied to prod, the fetcher has 26-lab registry + 23 passing tests + 144 ingested rows from one-off smoke runs, but `apps/trendingrepo-worker/src/registry.ts` never imports it. Cron never ticks it. Six-line fix.
3. **`huggingface` stub is still ticking every 4h** in `registry.ts:78`, polluting Sentry with `"not yet implemented"` warnings on every cron run. The README at `apps/trendingrepo-worker/README.md:7` claims it works.
4. **The CLI ships in two places.** `bin/ss.mjs` and `cli/ss.mjs` are byte-for-byte identical 572-LOC files. Next CLI bug fix lands in only one. Replace `bin/ss.mjs` with a one-line shim.
5. **The Twitter collector defaults to the dead path locally.** `scripts/collect-twitter-signals.ts:130-131` defaults to `provider=nitter, mode=api` — both forbidden by `CLAUDE.md`. Production is fine because `.github/workflows/collect-twitter.yml` overrides; local invocations fail silently.
6. **`derived-repos.ts` is a 754-LOC god module on the cold-start critical path.** `src/lib/derived-repos.ts` does I/O, classification, scoring, cross-signal fusion, Twitter fold-in, ProductHunt fold-in, and ranking, gated by a string-concatenated cache key from four `statSync` calls. Every cold Lambda renders the homepage by running this file.
7. **Zod is documented as "Zod on all API boundaries" but used in 2 of 82 API routes.** Mutating endpoints (`/api/admin/*`, `/api/reactions`, `/api/keys`, `/api/watchlist/*`, `/api/ideas/*`) use hand-written `typeof` ladders. CLAUDE.md claim is false.
8. **Nine API handlers echo `err.message` straight to clients.** Stack-trace prefixes and DB error strings can leak internals; routes listed under F-API-09 below.
9. **Lab attribution on arxiv papers was over-greedy** (review fixed mid-audit). Old haystack matched against abstracts — Stanford papers benchmarking Mistral got tagged as Mistral. The fix tightened to affiliations + authors only; rerun on prod dropped attribution from 17 labs / 105 papers to 7 labs / 18 papers. Now correct, but the SQL migrations 0428/0429 each `create or replace` the entire 80-line `trending_score()` function — next type-add will copy from one of them and silently regress.
10. **No `ErrorBoundary` anywhere in `src/components/`.** A throw inside a `requestAnimationFrame` physics step or a malformed seed crashes the page tree. The largest canvas (`SubredditMindshareCanvas.tsx`, 1086 LOC) is unprotected.

---

## Architectural mental model

STARSCREENER is a **Next.js 15 App Router public dashboard** (`src/app`, ~38 routes + ~82 API handlers) backed by **shared backend libraries** (`src/lib`) and fed by **two parallel ingestion systems**:

1. **Cron worker** (`apps/trendingrepo-worker/`, ~18.2K LOC, 35 fetchers) — self-contained Node 20 service, croner-driven, dual-writes to Redis (`ss:data:v1:*`, hot leaderboard JSON) and Supabase (`trending_items`/`trending_metrics`/`trending_assets`, cold rows). Most fetchers are Redis-only; three (`arxiv`, `ai-blogs`, mcp-merger consumers) write through Supabase.
2. **Local/CI scripts** (`scripts/`, ~50 collectors) — ran from GitHub Actions and operator dev boxes, writes to `data/*.json` + `.data/*.jsonl` + Redis via `_data-store-write.mjs`. Per `CLAUDE.md`, must run in `direct` mode (NOT `api` — Vercel filesystem is ephemeral).

The **Next.js layer** assembles two competing data paths: in-memory `repoStore` (pipeline) and request-time `derived-repos.ts` (cold-Lambda path that reads committed JSON, runs trending merge → classify → score → cross-signal → twitter fold-in → ph fold-in → rank — every cold start). Auth is cookie-based admin sessions (no `middleware.ts` — every route owns its own auth check). Stripe + MCP usage + webhook drains live in `src/lib/stripe/`, `src/lib/mcp/`, `src/lib/webhooks/`.

The **CLI** (`bin/`, `cli/`) and **MCP server** (`mcp/`) are read-only HTTP clients over the Next.js API surface. CLI is published as `starscreener-cli`, MCP as `starscreener-mcp` — both v0.1.0.

A **third design-time layer** at `src/lib/db/schema.ts` (759 LOC) + `src/lib/db/stores.ts` describes a Postgres schema that does not yet exist in production. It's a TableDescriptor manifest with `throw NOT_IMPLEMENTED` Postgres-class scaffolds. Operators reading the codebase reasonably assume it runs.

The **README claim** ("Pulls trending data from HuggingFace, GitHub, ...") and the **registered worker fetchers** disagree: `huggingface`, `github`, `mcp-so`, `mcp-servers-repo` are stubs. Three are correctly excluded from `FETCHERS`; `huggingface` is not.

---

## Findings table

87 findings, ranked roughly by severity. Identifiers prefix with module: `WK-` (worker), `APP-` (`src/app`), `LIB-` (`src/lib`), `UI-` (`src/components`), `SCR-` (scripts/cli/bin/mcp), `XS-` (cross-cutting).

| ID | Category | File:Line | Sev | Effort | Description | Recommendation |
|----|----------|-----------|-----|--------|-------------|----------------|
| **XS-01** | Security/Money | `src/app/api/webhooks/stripe/route.ts:46-62` + `src/lib/stripe/events.ts:124,176` | **Critical** | S | Stub fallback silently 200s tier upgrades. In-memory idempotency Set resets per Lambda cold start. Together: customers pay, get nothing, Stripe sees success. | Replace dynamic import with static `import { setUserTier } from "@/lib/pricing/user-tiers"`. Move idempotency to Redis SETNX (data-store already speaks Redis). |
| **WK-01** | Architectural decay | `apps/trendingrepo-worker/src/registry.ts:78` | **Critical** | S | `huggingface` stub registered + scheduled. Logs `not yet implemented` every 4h to Sentry. | Remove from FETCHERS array (matches comment treatment of github/mcp-so/mcp-servers-repo). |
| **WK-02** | Architectural decay | `apps/trendingrepo-worker/src/fetchers/ai-blogs/` not in `registry.ts` | **Critical** | S | Migration applied, tests pass, but fetcher never imported. `post` rows never get refreshed in prod. | `import aiBlogs from './fetchers/ai-blogs/index.js'` + append to FETCHERS. |
| **APP-01** | Security | `src/app/api/admin/scan/route.ts:110-115` | High | M | `spawn(... env: process.env)` passes ALL admin env vars (STRIPE_SECRET_KEY, SESSION_SECRET, ADMIN_PASSWORD) to child. Source whitelist is the only protection. | Pass curated env subset; explicitly drop secrets. |
| **APP-02** | Type/contract debt | (every API route) | High | L | Zod used in 2 of 82 routes despite CLAUDE.md "Zod on all API boundaries". `typeof` ladders in 80+ files. | Land Zod on top 10 mutating endpoints; one shared `parseBody(schema)` helper. |
| **APP-03** | Error handling | `src/app/api/profile/[handle]/route.ts:40-46`, +8 others | Medium | S | Nine handlers `JSON.stringify({error: err.message})` — leaks DB/stack content to clients. | Generic 500 message + console.error. |
| **APP-04** | Architectural decay | `src/app/demo/page.tsx` (1644 LOC) | Medium | L | Single-file demo page, mostly inline mocks. | Split mock data into `_demo-fixtures.ts`. |
| **APP-05** | Architectural decay | `src/app/news/page.tsx` (982 LOC) | Medium | M | News terminal, 6 sources × 4 helpers each inlined. | Extract per-source `<NewsTab source="..."/>` server component. |
| **APP-06** | Test debt | `SCAN_SOURCES` whitelist duplicated in `api/admin/scan-log/route.ts:32` and `api/admin/scan/route.ts:27` | Medium | S | Drift = either route lying about valid sources. | Extract to `lib/admin/scan-sources.ts`. |
| **APP-07** | Security | `src/app/api/admin/queues/repo/route.ts:88-105` | Medium | S | Bypasses CRON_SECRET in non-production silently. Staging risk. | 503 in any non-development NODE_ENV when secret missing. |
| **APP-08** | Performance | `src/app/api/ideas/route.ts:95-104` | Medium | S | N JSONL reads for N visible ideas (no upper bound). | Cap N or batch into `listReactionsForObjects`. |
| **APP-09** | Consistency | (multiple) | Medium | M | Three different cache header constants in use across `api/compare/`, `api/repos/`, etc. | Centralize in `lib/api/cache.ts` (READ_FAST/READ_SLOW/READ_HEAVY). |
| **APP-10** | Consistency | (multiple) | Medium | M | Error envelope shapes drift: `{error}`, `{ok:false, error}`, `{ok:false, error, code}`, `{ok:false, error:{code,message,retryable}}`. | Pick the twitter-ingest envelope (best shape) and migrate. |
| **APP-11** | Security | `src/app/api/admin/login/route.ts:99-117` | Medium | S | No rate limit on admin login. Plaintext-compared via `timingSafeEqualStr`. 7-day cookie. | `checkRateLimitAsync` (5/min/IP), shorten to 24h. |
| **APP-12** | Security | `src/app/api/health/route.ts:158-329` + 3 more | Low | S | Public unauthenticated detail-rich health endpoints expose source freshness, circuit-breaker state — recon surface. | Gate verbose payload behind `?detail=1` + cron secret. |
| **APP-13** | Architectural | `src/app/api/admin/scan/route.ts:104-107` | Medium | S | `.data/admin-scan-runs/` log dir grows unbounded. Comment says "rolled by ops", no operator script in repo. | Add post-spawn rotation (newest N per source). |
| **APP-14** | Type/contract debt | `src/app/api/cron/webhooks/flush/route.ts:92-102` + 3 more | Low | S | `Symbol.for(...)` test override pattern walks production code on every request. | Move to DI param or env-gated branch. |
| **APP-15** | Documentation drift | `src/app/page.tsx:179-181` (FAQ JSON-LD) | Low | S | "Scrapers run every 20 minutes" — CLAUDE.md says "3h interval default". | Update one of them. |
| **LIB-01** | Architectural | `src/lib/derived-repos.ts:1-755` | High | L | 754-LOC god module on cold-start critical path. I/O, trending merge, classify, score, fold-in, rank. | Split: `loaders/`, `assembly.ts`, `decorators.ts`. |
| **LIB-02** | Architectural | `src/lib/twitter/service.ts:806-918` | High | M | Two leaderboard caches invalidated on every `upsertRepoSignal` → ~0% hit rate. | Drop the caches OR move invalidation into store events. |
| **LIB-03** | Architectural | `src/lib/pipeline/adapters/nitter-adapter.ts` | High | M | Dead Twitter provider, still imported (tests). CLAUDE.md says cookie scrapers dead. | Delete OR gate behind explicit env flag with stale warning. |
| **LIB-04** | Performance | `src/lib/twitter/storage.ts:163-202` | High | M | `pruneScansForRepo` sorts entire scan map on every upsert. `MAX_SCANS_PER_REPO = MAX_SAFE_INTEGER`. O(N log N) per ingest. | Per-repo Map<scanIds[]>, prune O(1) on insert. |
| **LIB-05** | Performance | `src/lib/pipeline/storage/memory-stores.ts:185-201` | High | M | `InMemorySnapshotStore.append`: full copy + filter + sort on every snapshot. | Guard the `withoutDupe` filter; reserve copy. |
| **LIB-06** | Test debt | `src/lib/pipeline/__tests__/stripe-events.test.ts:384-405` | High | M | Only one negative test for signature verification. No expired-timestamp, no replay, no missing-header tests. The verification stands between attackers and tier upgrades. | Add 3 negative cases. |
| **LIB-07** | Architectural | `src/lib/db/schema.ts` + `src/lib/db/stores.ts` (959 LOC dead) | Medium | L | `throw NOT_IMPLEMENTED` Postgres scaffolds. Operators read this and assume it runs. | Either delete or fence with `// PLAN_ONLY` header + lint rule. |
| **LIB-08** | Architectural | `src/lib/pipeline/pipeline.ts:392-482` vs `:176-389` | Medium | M | `recomputeRepo` (single repo) doesn't emit `rank_changed` / `breakout_detected` pipeline events that batch path emits. Single-repo recompute swallows breakouts. | Consolidate or document divergence. |
| **LIB-09** | Architectural | `src/lib/pipeline/pipeline.ts:176-389` | Medium | L | `recomputeAll` is 213-LOC god function, 6 numbered phases inlined. `recomputeRepo` duplicates phases 1-4. | Extract `phaseScore`, `phaseClassify`, `phaseRank`, `phaseAlerts`. |
| **LIB-10** | Performance | `src/lib/pipeline/storage/memory-stores.ts:474-639` | Medium | M | `InMemoryMentionStore.append` rewrites entire repo's mention array on each insert, full sort. TODO at line 547 acknowledges. | Sorted index per repo. |
| **LIB-11** | Performance | `src/lib/pipeline/pipeline.ts:269` | Medium | S | `for ... { ... repoStore.upsert ... }` calls debounce-schedule 1k× per recompute. Pattern to suspend exists in `singleton.ts`. | Suspend persist hook around recomputeAll's loop. |
| **LIB-12** | Type debt | `src/lib/twitter/service.ts:108-124` | Medium | S | `stableStringify(value: unknown)` — unbounded recursive serializer for `payloadHash`. No depth/cycle limit. OOM risk. | Cap depth at 32. |
| **LIB-13** | Architectural | `src/lib/twitter/storage.ts` vs `src/lib/pipeline/storage/singleton.ts` | Medium | M | Two parallel debounce-persist implementations with identical defaults. | Extract `createDebouncedPersist({flush, debounceMs})`. |
| **LIB-14** | Error handling | `src/lib/mcp/usage.ts:154-173` | Medium | S | `recordUsage` swallows ALL errors with `console.warn`. ENOENT/EACCES/ENOSPC collapse to "best effort dropped". | Bucket failure types. |
| **LIB-15** | Test debt | `src/lib/pipeline/__tests__/persistence-hydration.test.ts:55-72` | Medium | S | `?t=${bust}` cache busting via URL params; brittle on Windows ESM. | `vi.resetModules()` or factory `dataDir` param. |
| **UI-01** | Architectural decay | `src/components/detail/RepoChart.tsx` (366 LOC) | High | S | Dead — exported but no importers (`Grep RepoChart` returns only own declarations). Live chart is `repo-detail/RepoDetailChart.tsx`. | Delete file + verify rest of `detail/` directory. |
| **UI-02** | Architectural decay | `src/components/reactions/RepoReactions.tsx` ↔ `ObjectReactions.tsx` | High | M | Two ~250-line near-identical components. RepoReactions is ObjectReactions with `objectType="repo"` hardcoded. | Replace with `<ObjectReactions objectType="repo" objectId={fullName}/>`. |
| **UI-03** | Performance | `src/components/reddit-trending/SubredditMindshareCanvas.tsx:732-937` | High | M | `bubbleElements` `useMemo` deps include `draggingId` and `hoveredId`. Every hover rebuilds JSX for 50+ bubbles. Memoization defeats itself. | Drive hover/drag via `setAttribute` on `groupRefs` (same path the physics uses). |
| **UI-04** | Architectural decay | `src/components/reddit-trending/TopicMindshareCanvas.tsx:1-3` | Medium | M | "Forked from BubbleMapCanvas" — TopicMindshareCanvas (564) + SubredditMindshareCanvas (1086) + BubbleMapCanvas (683) duplicate verlet integrator + pointer capture + click-vs-drag. ~600 LOC × 3. | Extract `usePhysicsBubbles({seeds, width, height, onClick})` hook. |
| **UI-05** | Performance | `src/components/watchlist/WatchlistManager.tsx:142-172` | Medium | S | `useEffect(..., [watchlist])` refetches all watchlist repos when array reference changes. Every Zustand action recreates the array. | Diff on `repoId.sort().join(",")` or fetch-only-new. |
| **UI-06** | Consistency | `src/components/compare/CompareClient.tsx` ↔ `CompareProfileGrid.tsx` | High | M | Two compare clients each fetch `/api/repos`, both manage Zustand `onFinishHydration`. If `/compare` renders both, 4 sequential API calls covering overlapping data. | Single fetch upstream. |
| **UI-07** | Error handling | (entire `src/components/`) | Medium | M | Zero `ErrorBoundary` instances anywhere. Throw in physics rAF crashes whole page tree. | Wrap canvas mounts + RepoDetailChart in error boundary. |
| **UI-08** | A11y | `src/components/terminal/BubbleMapCanvas.tsx:445` | Medium | S | `window.location.href = href` for click-nav — full page reload, breaks scroll restoration. Comment claims it preserves cmd-click; pointerdown's preventDefault means it doesn't. | `useRouter().push(href)`; modifier-key pointerdown skips preventDefault. |
| **UI-09** | A11y | `src/components/reactions/RepoReactions.tsx:162` + `ObjectReactions.tsx:143` | Medium | S | `window.confirm` for Buy/Invest gates. Page-blocking, not screen-reader friendly. File header says "real modal in P0.5" (since 2026-Q1). | Ship the modal. |
| **UI-10** | Performance | `src/components/repo-detail/RepoDetailChart.tsx:599-636` | Medium | S | Custom Recharts Tooltip `content={(props) => ...}` — fresh closure per render → tooltip re-mount. | Stable component reference. |
| **UI-11** | Consistency | `src/components/shared/SearchBar.tsx:119-143` ↔ `compare/CompareSelector.tsx:73-119` | Medium | S | Two debounced-search-with-AbortController implementations. | Extract `useDebouncedSearch(q, opts)` hook. |
| **UI-12** | Architectural decay | `src/components/reddit-trending/AllTrendingTabs.tsx:240-320` | Medium | S | Three back-to-back `useMemo` blocks each compute identical `topicFiltered = activeTopic ? posts.filter(...) : posts`. | Hoist one shared memo. |
| **UI-13** | Performance | `src/components/reddit-trending/SubredditMindshareCanvas.tsx:1049-1062` | Medium | S | One `<radialGradient>` def per seed (80+ for 80 subreddits). Most share colors. | Collapse to ~4 tier-keyed defs. |
| **UI-14** | Performance | `src/components/repo-detail/RepoDetailChart.tsx:639-658` | Low | S | `<Bar dataKey={(p) => p.counts[src]}>` — Recharts treats fn-dataKeys as un-cacheable. | Use string keys after data transform. |
| **UI-15** | Consistency | `src/components/layout/SidebarSkeleton.tsx:1` | Low | S | `'use client'` but no hooks/events/browser APIs. | Drop directive; render in RSC parent. |
| **SCR-01** | Consistency | `scripts/collect-twitter-signals.ts:131` | High | S | Default `mode="api"` — anti-pattern per CLAUDE.md ("collectors run direct mode"). | Flip default to `direct`. |
| **SCR-02** | Consistency | `scripts/collect-twitter-signals.ts:130,305` | High | S | Default `provider="nitter"` — dead provider. Workflow forces `apify`. | Flip default. |
| **SCR-03** | Architectural | `scripts/scrape-funding-news.mjs` (1151 LOC) | High | M | ~470 LOC of inline `SEED_SIGNALS` + `KNOWN_COMPANY_LOGOS` data. | Move to `data/funding-seeds.json` + `data/company-logos.json`. |
| **SCR-04** | Consistency | `scripts/scrape-npm-daily.mjs:39-40` | High | S | Writes `.data/npm-daily.jsonl` only — never imports `_data-store-write.mjs`. CLAUDE.md anti-pattern. | Add `writeDataStore("npm-daily", ...)`. |
| **SCR-05** | Architectural | `bin/ss.mjs` ↔ `cli/ss.mjs` (572 LOC each, byte-identical) | High | S | Diff returns identical. Bug fixes will land in only one. | Replace `bin/ss.mjs` with `import "../cli/ss.mjs";` shim. |
| **SCR-06** | Architectural | `mcp/src/server.ts:1-597` | Medium | M | 597-LOC god file; 14 tool registrations + UNTRUSTED_CONTENT_NOTICE + withMetering + run + main inline. | Split into `mcp/src/tools/<name>.ts`. |
| **SCR-07** | Test debt | `mcp/` | High | M | Zero tests. `UNTRUSTED_CONTENT_NOTICE` exported "for tests" that don't exist. Metering fire-and-forget contract is load-bearing. | Add at least one test that mocks fetch + asserts metering doesn't throw on 500. |
| **SCR-08** | Type/contract debt | `mcp/src/client.ts:14-19,142-330` | Medium | S | Every endpoint returns `Promise<unknown>`. Server 200-with-wrong-shape surfaces to Claude as gibberish. | Validate `{ok, ...}` envelope. |
| **SCR-09** | Dependency drift | `mcp/package.json:46` (zod ^3) vs root `package.json:97` (zod ^4) | Medium | S | Two majors of zod across packages. | Pick one universe. |
| **SCR-10** | Architectural | `scripts/scrape-reddit.mjs` (1059 LOC) | Medium | M | Mix of fetch + classification + baselines + alias scrubbing. Inline `GENERIC_TERMS` belongs in `_reddit-shared.mjs`. | Move shared rules to shared module. |
| **SCR-11** | Test debt | `scripts/__tests__/` | Medium | M | 16 tests; missing for `_data-store-write.mjs` (linchpin), `compute-deltas.mjs`, `enrich-repo-profiles.mjs` (757 LOC), `scrape-funding-news.mjs:extractAmount/extractRoundType`. | Add smoke test for `writeDataStore` + fixture-driven funding extractor test. |
| **SCR-12** | Security | `mcp/src/server.ts:115` | Low | S | Metering POST hits `${baseUrl}/api/mcp/record-call` with no scheme check. `STARSCREENER_API_URL=http://evil/` leaks `x-api-key` in plaintext. | Reject non-https except localhost. |
| **SCR-13** | Architectural | `scripts/_twitter-web-provider.ts` (675 LOC, dead per CLAUDE.md) | Low | M | File is documented as replaced by ApifyTwitterProvider but still in repo + tests. | Mark deprecated; delete after one stable Apify cycle. |
| **WK-03** | Type debt | `apps/trendingrepo-worker/src/lib/types.ts:133` | High | S | `signalRunComplete: (counts: RunResult) => Promise<void>` typed but runner passes `() => recordRun()` ignoring `counts`. Type lies. | Tighten to `() => void`. |
| **WK-04** | Documentation | `apps/trendingrepo-worker/.env.example` vs `src/lib/env.ts` | High | S | env.ts schema accepts 38; .env.example documents 15. New operator can't tell which envs the worker honors. | Sync from schema; group by fetcher. |
| **WK-05** | Architectural | `apps/trendingrepo-worker/src/lib/publish.ts:46` | High | M | `loadAssets()` gated only on `type==='mcp'`, but `is_official_vendor` + `security_grade` read from `r.raw` for every type — silent data leak across types. | Move per-type fields into asset map. |
| **WK-06** | Consistency | 5 fetchers (hackernews, reddit, devto, lobsters, bluesky) | Medium | M | Velocity computed by 4-5 near-identical formulas in private helpers. | `lib/util/velocity.ts` with named variants. |
| **WK-07** | Test debt | `apps/trendingrepo-worker/tests/publish.test.ts:20-23` | Medium | S | Only test on the leaderboard publisher is `describe.skip` with two `it.todo`. 117 LOC of asset-merging untested. | Fixture-driven test of `publishLeaderboard`. |
| **WK-08** | Test debt | `apps/trendingrepo-worker/tests/fetchers/` | Medium | M | Tests cover 7 of 35 fetchers. Largest (producthunt 403, reddit 364, bluesky 375, hackernews 383, devto 351) untested. | Per-fetcher fixture-driven normalizer test. |
| **WK-09** | Architectural | `supabase/migrations/20260428000000_arxiv_paper_type.sql` + `..._blog_post_type.sql` | High | M | Each migration `create or replace function trending_score()` and copies the entire body. Next type-add will copy from the wrong one. | Move function body to `sql/trending_score.sql` + `\i` from migrations. |
| **WK-10** | Type debt | `apps/trendingrepo-worker/src/fetchers/skills-sh/client.ts:86-87` | Medium | S | `as unknown as any` to bridge zod 3↔4 with Firecrawl SDK. | Pin zod 3 via npm-overrides OR write `zodToJsonSchema()`. |
| **WK-11** | Performance | `apps/trendingrepo-worker/src/lib/http.ts:120-124` | Medium | S | Two parallel Redis SETs for `tr:etag:` + `tr:etag-body:`, 7-day TTL. No size cap, no compression. Balloons Redis memory. | Cap body size (skip if >256KB); consider gzip. |
| **WK-12** | Test debt | `apps/trendingrepo-worker/tests/sql/trending-score.test.ts` (skip-by-default) | Medium | M | SQL ↔ TS parity test skips if local Supabase not up. Lab/cross-source boosts in 0428/0429 have no equivalent in `src/lib/score.ts`. Parity claim broken. | Drop the parity claim OR extend `composite()`. |
| **WK-13** | Architectural | `apps/trendingrepo-worker/src/lib/util/github-token-pool.ts` | Medium | M | Comment says "intentionally simpler than `src/lib/github-token-pool.ts`" — two pools same name, different rate-limit semantics, in same monorepo. | Share via package OR rename to `worker-github-token-pool.ts`. |
| **APP-16** | Performance | `src/app/api/admin/stats/route.ts:142-144` | Low | S | `dirSizeBytes` recursively `lstat`s every file under `.data/` + `data/` per admin refresh. | Cache 60s in module memory. |
| **APP-17** | Type/contract debt | `src/app/api/repos/[owner]/[name]/route.ts:96-103` | Low | S | `?v=1` legacy path preserved indefinitely. No documentation of who's pinned. | `console.warn` once per cold start when v=1 hit; sunset after 30d zero traffic. |
| **APP-18** | Performance | `src/app/api/stream/route.ts:122-124` | Low | S | SSE 50-client cap + 15s heartbeat. Comment says "doesn't work on Vercel" — nothing prevents Vercel deploy. | Add `if (process.env.VERCEL) return 501`. |
| **LIB-16** | Type debt | `src/lib/data-store.ts:188-356` (`MemoryCache`) | Medium | S | Process-level singleton. Cache keys are bare slug — no per-tenant scoping. Today fine because all data is public global; pattern invites leak when scoped data lands. | Document public-only invariant or namespace with tenant prefix. |
| **LIB-17** | Architectural | `src/lib/derived-repos.ts:412` | Medium | S | `_cache` process-global. `__resetDerivedReposCache()` exists but not all callers know to call it. Tests can ping-pong each other. | Inject store via param or wrap in factory. |
| **LIB-18** | Type debt | `src/lib/webhooks/types.ts:65` | Medium | S | `WebhookDelivery.payload: unknown` reaches drain cron with no schema. Provider formatters re-introspect. | Discriminated union keyed on `event`. |
| **LIB-19** | Race | `src/lib/pipeline/pipeline.ts:130-141, :559-563` | Medium | S | `ensureReady()` then `hydrateAlertStores()` outside the cached promise; `withRecomputeLock` reads `readyPromise` twice. Confusing if not buggy. | Single `await ensureReady()` (idempotent). |
| **LIB-20** | Documentation drift | `src/lib/db/schema.ts:480-518` | Medium | S | Inline "Migration SQL" ALTER TABLE comments in a TS descriptor. No DBA exists. | Move to `docs/DATABASE.md` or generate from descriptor. |
| **WK-14** | Type debt | `apps/trendingrepo-worker/src/lib/types.ts:132` | Medium | S | `FetcherContext.since` computed in run.ts but no fetcher reads it (`grep ctx.since` returns 0). | Drop the field. |
| **WK-15** | Consistency | 12 fetchers | Medium | S | Every fetcher inlines identical `empty()`/`done()` RunResult helpers. ~12 copies. | One `emptyResult(name, startedAt)` in `lib/types.ts`. |
| **WK-16** | Architectural | `apps/trendingrepo-worker/src/fetchers/_template/index.ts` | Low | S | Template fetcher with placeholder body, in `tsconfig.rootDir`. Compiles to `dist/`. | Move to `templates/` outside src/, OR `tsconfig.exclude`. |
| **SCR-14** | Documentation drift | `scripts/collect-twitter-signals.ts:301-326` | Low | S | `printHelp` says `Default: api` and lists `nitter,fixture,web,apify` as equal-weight. | Update to match reality. |
| **SCR-15** | Performance | `scripts/compute-deltas.mjs:54-71` | Low | S | `git log` once per of 4 windows. Single command + JS partition saves 3 process spawns/cron run. | Single `git log` call. |
| **SCR-16** | Test debt | `cli/` | Medium | M | Zero tests on argv parsing + table formatting. | One fixture-driven `node --test`. |
| **SCR-17** | Documentation drift | `cli/README.md:50` | Low | S | Lists `ss stream` but help text omits its `--json` interplay. | Sync help/README/command surface. |
| **UI-16** | Type debt | `src/components/repo-detail/RepoDetailChart.tsx:600-630` | Low | S | Tooltip `content` callback type-asserts twice (`as ...`). Recharts ships `TooltipProps<...>`. | Use the typed version. |
| **UI-17** | Documentation drift | `src/components/watchlist/AlertConfig.tsx:77` | Low | S | `// const USER_ID = "local";` left as "doc reference". | Delete. |
| **UI-18** | Performance | `src/components/terminal/Terminal.tsx:81-92` | Low | S | `useWindowWidth` re-renders Terminal on every resize without throttle. 60+/s during drag. | rAF-throttle or `useDeferredValue`. |

---

## Top 5 — if you fix nothing else, fix these

### 1. **XS-01: Stripe webhook stub fallback + in-memory idempotency** — money on the table
**Files**: `src/app/api/webhooks/stripe/route.ts:46-72` + `src/lib/stripe/events.ts:124,176`

```diff
- const mod: any = await import("@/lib/pricing/user-tiers" as string);
- const setUserTier = mod?.setUserTier ?? setUserTierStub;
+ import { setUserTier } from "@/lib/pricing/user-tiers";
```

Then move idempotency from `Set` to Redis SETNX (the data-store already speaks Redis):

```ts
// src/lib/stripe/events.ts
const processed = await redis.set(`stripe:event:${event.id}`, "1", { ex: 86400, nx: true });
if (processed === null) return; // already processed
```

**Why first**: silent revenue loss. Today, every Stripe upgrade event 200s and logs; the customer pays, gets nothing. Across multiple Lambda instances, idempotency doesn't even hold. Verify with one fixture event before deploying.

### 2. **WK-01 + WK-02: Worker registry drift** — 6-line PR

```diff
// apps/trendingrepo-worker/src/registry.ts
- import huggingface from './fetchers/huggingface/index.js';
+ // huggingface stub removed from FETCHERS until real port lands
+ import aiBlogs from './fetchers/ai-blogs/index.js';
  ...
- huggingface,
+ aiBlogs,
```

**Why**: WK-01 stops Sentry pollution every 4h. WK-02 turns the entire `post` enum + `0429` migration + 23 passing tests + 144 ingested rows from "dead in prod" into "actually running". Both are zero-risk.

### 3. **LIB-01: Decompose `derived-repos.ts`** — cold-start critical path

754-LOC god module. Every cold Lambda renders the homepage by running this file.

```
src/lib/derived-repos.ts → split into:
  src/lib/derived-repos/loaders/{trending,recent,manual,pipeline-jsonl}.ts
  src/lib/derived-repos/assembly.ts
  src/lib/derived-repos/decorators/{twitter,producthunt,cross-signal}.ts
  src/lib/derived-repos/index.ts (orchestrator, ≤150 LOC)
```

Replace 4 `statSync` cache-key inputs with one mtime tracker (5s floor). Most painful refactor in this audit, but it's the primary cold-path renderer.

### 4. **SCR-05 + SCR-01 + SCR-02: CLI duplication + Twitter collector defaults** — 3 small fixes

```diff
// bin/ss.mjs (replace 572 LOC with):
+ #!/usr/bin/env node
+ import "../cli/ss.mjs";
```

```diff
// scripts/collect-twitter-signals.ts:130-131
- mode: "api",
- provider: "nitter",
+ mode: "direct",
+ provider: "apify",
```

**Why**: SCR-05 prevents the inevitable bug-fix-in-only-one. SCR-01/02 stops `npm run collect:twitter` from silently failing for every contributor.

### 5. **APP-02: Land Zod on top 10 mutating endpoints** — single helper unlocks the whole pile

The `typeof` ladders aren't broken, but they're brittle. Land a shared helper:

```ts
// src/lib/api/parse-body.ts
import type { ZodSchema } from "zod";
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T | { _error: Response }> {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return { _error: NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }) }; }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { _error: NextResponse.json({ ok: false, error: "validation", issues: parsed.error.issues }, { status: 400 }) };
  return parsed.data;
}
```

Then migrate `api/admin/{scan,revenue-queue,ideas-queue,drop-events}`, `api/reactions`, `api/keys`, `api/watchlist/private`, `api/ideas/[id]`, `api/repo-submissions`, `api/submissions/revenue`. Each route loses 10-30 LOC of `typeof` checks and gains compile-time contract.

---

## Quick wins (Low effort × Medium+ severity)

- [ ] **XS-01**: Static import for `setUserTier` (5 min — verify with Stripe test event first)
- [ ] **WK-01**: Remove `huggingface` from registry.ts FETCHERS (5 min)
- [ ] **WK-02**: Add `aiBlogs` to registry.ts FETCHERS (5 min)
- [ ] **WK-04**: Sync `apps/trendingrepo-worker/.env.example` from `env.ts` schema (15 min)
- [ ] **WK-15**: Extract `emptyResult()` helper, replace 12 copies (20 min)
- [ ] **WK-14**: Drop unused `ctx.since` (5 min)
- [ ] **APP-03**: Replace `err.message` echoes with generic 500 across 9 handlers (45 min)
- [ ] **APP-06**: Extract `SCAN_SOURCES` to shared module (10 min)
- [ ] **APP-11**: Add `checkRateLimitAsync(login, 5/min/IP)` (10 min)
- [ ] **APP-15**: Reconcile FAQ scraper cadence with reality (5 min)
- [ ] **SCR-01/02**: Flip Twitter collector defaults (5 min)
- [ ] **SCR-04**: Add `writeDataStore` to `scrape-npm-daily.mjs` (10 min)
- [ ] **SCR-05**: Replace `bin/ss.mjs` with one-line shim (5 min)
- [ ] **SCR-12**: Scheme check on MCP metering POST (5 min)
- [ ] **UI-01**: Delete `src/components/detail/RepoChart.tsx` (366 LOC dead) (5 min)
- [ ] **UI-15**: Drop `'use client'` from `SidebarSkeleton.tsx` (1 min)
- [ ] **UI-17**: Delete commented `USER_ID = "local"` in `AlertConfig.tsx:77` (1 min)
- [ ] **UI-12**: Hoist `topicFiltered` memo in `AllTrendingTabs.tsx:240-320` (10 min)
- [ ] **LIB-12**: Depth/cycle guard on `stableStringify` (10 min)
- [ ] **LIB-15**: Replace `?t=${bust}` cache busting in persistence-hydration test (15 min)

**Total quick-wins time: ~3 hours of focused work to clear 20 items.**

---

## Things that look bad but are actually fine

This section is required by the audit protocol. If it's empty, the audit is shallow.

- **`src/lib/data-store.ts` three-tier read with shared `MemoryCache` singleton.** Looks like a request-scoping leak vector. It's not — every key under `ss:data:v1:*` is genuinely public global data (30 cron-fed payloads served identically to every visitor). Pattern is correct *for now*. Flag the day scoped data lands here (LIB-16 captures this).
- **`apps/trendingrepo-worker/src/run.ts:113-138` `throwOnUseRedisHandle`/`throwOnUseDb` Proxies.** Look like over-engineering. Are load-bearing — prior pattern was lazy-init on first use, which surprised tests with env errors mid-run. Throwing at access time gives a clear stacktrace.
- **`apps/trendingrepo-worker/src/schedule.ts:42` `protect: true` on croner.** Looks like it could mask failures (skipped ticks). Deliberate and necessary — `engagement-composite` can run >60s, queueing a second tick would compound load on Supabase + GitHub PATs.
- **`src/app/api/health/route.ts` is 415 lines and reads from 6 module-level caches.** Looks like a god route. Each cache is a 30s rate-limited refresh + the response shape is intentionally flat for uptime-monitor consumers. Splitting just pushes complexity into a synthesizer.
- **`src/app/api/repos/route.ts` rejects unknown sort/filter/period with 400 instead of defaulting silently.** Looks user-hostile (typos break stale bookmarks). Comment argues this catches stale clients; public docs commit to the strict enum. Correct call.
- **`src/app/api/openapi.json/route.ts` uses `readFileSync` despite project ban.** The CLAUDE.md ban is on `readFileSync` for *data sources*. This is a build-time spec read once per cold start. Fine.
- **`src/app/api/stream/route.ts` cap of 50 SSE subscribers + 15s heartbeat.** Looks like premature limiting; comment correctly says it requires a long-lived process. Cap protects the process from misbehaving clients.
- **`src/app/api/mcp/record-call/route.ts:49-54` returns 200 on missing auth.** Looks like an auth bypass. Intentional — the MCP server never awaits the response, and stdio clients without a token would log 401s forever otherwise.
- **`src/app/api/auth/session/route.ts:118-202` allows POST without body.** Looks loose. Route's contract is "issue a session for whoever shows up"; refusing on empty body breaks the AlertConfig dev path.
- **`React.memo` used in only 1 of 106 client components.** Looks like a memoization hole. Most components are leaves over Zustand selectors that already short-circuit. The canvases bypass React via `setAttribute` in the physics loop. Wrapping in `React.memo` would help nothing (UI-03 is a different issue — memo dep list).
- **`src/components/reddit-trending/SubredditMindshareCanvas.tsx:167` `bodies = useRef(...)` initialized from `seeds`.** Looks like StrictMode tear bait. Follow-up `useEffect` re-parents the bodies; behavior is documented and intentional.
- **`src/lib/pipeline/locks.ts` `withRecomputeLock` resets on process restart.** Looks like a foot-gun — two deploys could each start a recompute. In practice Vercel's shaping + the 15s cooldown make multi-process race functionally rare. Don't fix until distributed deploy.
- **`src/lib/pipeline/storage/file-persistence.ts:withFileLock` uses a process-local Map.** Looks like a mistake — only single-process serialization. The module documents this; Next runs one process per region. Load-bearing-correct.
- **`src/lib/stripe/events.ts:255-321` keeps `past_due` users on Pro.** Looks like a billing leak. Intentional first-dunning grace; documented inline.
- **`scripts/_load-env.mjs:30-34` swallows `ERR_MODULE_NOT_FOUND` silently.** Looks like a hidden-failure trap. Comment documents the post-mortem (cost the team 2 days). Current shape is the *fix*, not the bug. (One-shot stderr line on first miss is the proper improvement — SCR-14 region.)
- **`scripts/_data-store-write.mjs:149-152` does parallel SETs not MULTI/EXEC.** Looks like a consistency hole. Comment explicitly justifies brief inconsistency window because the reader treats meta-missing as "fall back to file mtime". Acceptable.
- **`scripts/reset-data.mjs:16` blocks `NODE_ENV=production`.** Looks paranoid. Correct — production filesystem is ephemeral on Vercel anyway, the script would mostly do nothing useful, and the guard prevents accidental local→prod env contamination.
- **`mcp/src/server.ts:152-160` `UNTRUSTED_CONTENT_NOTICE` prefix on tool outputs.** Looks like LLM-prompt clutter. It's a documented Phase-2 prompt-injection mitigation for repo descriptions / Nitter tweet bodies. Keep.
- **CLI's two `SIGINT` handlers** in `bin/ss.mjs` and `cli/ss.mjs:485-487`. Looks like a leak. Node merges signal listeners; second is needed because `cmdStream` adds an `AbortController` tear-down.

---

## Open questions for the maintainer

1. **`@/lib/pricing/user-tiers` provenance.** Stub-fallback comments suggest a parallel agent owns this module. Does it ship complete, or is the stub still load-bearing today? XS-01 severity hinges on this.
2. **`apps/trendingrepo-worker/src/registry.ts` stub policy.** Three stubs (`github`, `mcp-so`, `mcp-servers-repo`) are correctly excluded with comment explanation. `huggingface` is included. Was that intentional or a merge oversight? (WK-01)
3. **`db/schema.ts` + `db/stores.ts` realisation timeline.** When does the Postgres app-tier go live? If >6 months, deleting saves ~960 LOC of cognitive overhead. (LIB-07)
4. **SQL ↔ TS scoring parity.** `apps/trendingrepo-worker/src/lib/score.ts:1-2` claims parity with `trending_score()`. Migrations 0428/0429 add lab/cross-source boosts with no equivalent in `composite()`. Is the parity claim still meant to hold, or only the SQL path is in production use? (WK-12)
5. **`MAX_SCANS_PER_REPO = MAX_SAFE_INTEGER`** in `src/lib/twitter/storage.ts:26`. Was the cap removed for a one-off test and never restored? `pruneScansForRepo` only prunes by age, never by count, so the comment "exceedsCap" check at line 172 is unreachable. (LIB-04)
6. **`bin/ss.mjs` vs `cli/ss.mjs` distribution intent.** Both have `bin` declarations in their respective package.json. Are they two distinct npm distributions intentionally, or is one vestigial? (SCR-05)
7. **Health endpoint detail level.** `/api/health` and 3 siblings are publicly unauthenticated and expose source-freshness map + circuit breaker state. Intentional for an external uptime page (statuspage.io)? Or just an internal monitor? (APP-12)
8. **`/api/stream` deployment target.** Comment says it requires a long-lived process; current Vercel deploy would silently 503 or time out. Should it be removed, moved to Railway worker, or env-gated? (APP-18)
9. **`db/schema.ts:480-518` Migration SQL comments**. Inline ALTER TABLE comments in a TS descriptor — there's no DBA. Move to docs, or generate the migration from the descriptor? (LIB-20)
10. **arxiv lab-attribution rate**. After fixing the haystack to affiliations + authors only, attribution dropped from 17 labs / 105 papers to 7 / 18. The signal is now trustworthy but very sparse. Acceptable, or do we want to expand affiliation patterns to recover more matches without re-introducing benchmark-citation false positives? (Out of scope but worth noting.)

---

## Methodology

5 parallel subagent passes. Each agent received its scope, the SKILL.md protocol, and a citation requirement. Findings dedup'd manually where multiple agents flagged the same root cause (Stripe shows up in both `src/app` and `src/lib` audits — collapsed to XS-01). Severity calibrated against impact + reachability:

- **Critical**: production money, security, or signal-correctness — fix today.
- **High**: data drift, performance pain at current scale, or signal contamination.
- **Medium**: tech-debt accumulation that doesn't bite yet but compounds.
- **Low**: stylistic, documentation, or "looks bad but works".

Effort sizes: **S** (≤30 min), **M** (≤4 hours), **L** (≥1 day).

Validation: typecheck clean (`npm run typecheck` in worker, `tsc --noEmit` at root); 293/293 vitest in worker, 184/184 vitest at root before today's session. Live arxiv re-run + score recompute completed against prod Supabase mid-audit (1389 papers, 7 distinct labs after stricter haystack — see Open Question 10).
