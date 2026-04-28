# Audit — trendingrepo.com: live vs planned vs missing
**Date:** 2026-04-28  •  **Mode:** read-only forensics (plan mode)
**Main HEAD:** `b762c6a` (test+a11y: featured-card tests, reduced-motion sweep)
**Public URL:** https://trendingrepo.com  •  Vercel main = production  •  Node 22.x, Next 15.5.15

> Per active plan-mode constraint, this audit lives at the plan path. The user-requested final destination is `tasks/AUDIT_TRENDINGREPO_2026-04-28.md` — move/rename after approval.

---

## Context

trendingrepo.com is in mid-migration. The live Next.js app on main branch (39 pages, 73 API endpoints, 11 collector scripts, 31 bundled JSON payloads, momentum-based scoring) is being progressively decomposed into a sister Railway microservice (`apps/trendingrepo-worker/`, ~36 fetchers, Sentry-wired). The microservice scaffold and three feature phases (3.1 engagement scoring, 3.3 GitHub events firehose, 3.4 Crunchbase + X funding) are pinned in three sibling worktree branches that have never been merged. A fourth worktree (`claude/quizzical-kilby-9a529a`) is a 752-file Supabase rewrite of the `/ideas` surface. None of the four are visible on production. Phase 4 (monetization: API keys, usage metering, webhook delivery, status page, separate API product domain) has zero commits anywhere. This audit answers what's live, what's queued, what wins on overlaps, and what's still missing.

---

## 1 · Live inventory (main, b762c6a)

| Surface | Count | Examples |
|---|---:|---|
| Pages | 39 | `/`, `/twitter`, `/ideas`, `/funding`, `/repo/[owner]/[name]`, `/admin/*` |
| API endpoints | 73 | `/api/repos`, `/api/pipeline/{ingest,persist,refresh}`, `/api/cron/*` |
| Data sources w/ `refreshXxxFromStore()` | 13 | `trending`, `deltas`, `bluesky-*`, `devto-*`, `hackernews-*`, `lobsters-*`, `npm-*`, `producthunt-*`, `reddit-*`, `funding-*`, `repo-{metadata,profiles}`, `hot-collections`, `revenue-*` |
| Bundled JSON payloads | 31 | `data/trending.json`, `data/funding-news.json`, `data/twitter-*.jsonl` |
| Collector scripts | 11 | `scripts/scrape-{trending,bluesky,devto,hn,lobsters,npm,ph,reddit,funding-news}.mjs`, `scripts/collect-twitter*.ts` |
| GitHub Actions workflows | 26 | 9 collectors + 10 cron pipeline + 7 utility |
| Scoring algorithm | 1 | `src/lib/scoring.ts` — 10-factor momentum (24h+7d star velocity, fork/contributor growth, commit/release freshness, social buzz, issue activity, community health, category momentum) |

**Persistence model.** Three-tier read (Redis → bundled file → in-memory LKG) via `src/lib/data-store.ts`. Collectors dual-write file + Redis through `scripts/_data-store-write.mjs`. Twitter collector runs Apify (`apidojo~tweet-scraper`); cookie-based providers were retired post-2026 anti-bot.

**Cadence (confirmed):** trending hourly :27, pipeline ingest every 2h :15, twitter outbound 14:00 UTC daily, cleanup/rebuild Sun 04:00/05:00 UTC.

**Deploy config.** `next.config.ts` with bundle analyzer + barrel-import opt + OneDrive `.next` junction workaround. No `vercel.json`. `NEXT_PUBLIC_APP_URL=https://trendingrepo.com` (defensively trimmed at module load — fix `93e2642`).

---

## 2 · Planned work — four unmerged worktrees

### 2.1 Worktree-1 — Phase 3.1 engagement composite scoring
- Branch `worktree-agent-a8a7ee90307f940b2`. 3 commits (`89d7b7b6 → 87acecf6 → f353cda9`). 572 files, +182k/−215k.
- Adds `apps/trendingrepo-worker/src/fetchers/engagement-composite/{index,scoring,types}.ts` — 7-component weighted blend (HN + Reddit + Bluesky + DevTo + npm + GitHub stars + ProductHunt) with **percentile-rank for social signals + log-normalize for heavy-tailed metrics**.
- New routes `/api/worker/health` (fleet probe) and `/api/worker/pulse` (single-slug liveness).
- New reader `src/lib/engagement-composite.ts` (mirrors `repo-profiles.ts` 30s cooldown + dedupe pattern).
- CI: `.github/workflows/ci.yml` modified to run worker tests.
- Clean working tree.

### 2.2 Worktree-2 — Phase 3.3 GitHub events firehose
- Branch `worktree-agent-a5b609bc139d02c8e`. 3 commits (`67a5a7c3 → 530cf481 → e9fb7ce0`). 575 files, +182k/−215k.
- **Three unstaged rate-limit mods** in `src/app/api/{repo-submissions,repos/[owner]/[name]/aiso,submissions/revenue}/route.ts` — not yet committed.
- Adds `apps/trendingrepo-worker/src/fetchers/github-events/{index,parser,types,watchlist}.ts` — top-50 repo public-events firehose, normalized per repo.
- New routes `/api/worker/health`, `/api/skills` (trending-skill leaderboard, 6h cron), `/api/repos/[owner]/[name]/events` (per-repo slice, 30s cache + SWR).
- New reader `src/lib/github-events.ts` (index cached 30s; per-repo reads stay async for freshness).
- New CI workflow `.github/workflows/trendingrepo-worker.yml` (Node 22, vitest excluding SQL parity tests).
- `tsconfig.json` exclusion list extended to `["node_modules", "mcp", "apps"]` — prevents Next from typechecking the Railway worker. **This is the right pattern; 3.1 is missing it.**

### 2.3 Worktree-3 — Phase 3.4 Crunchbase + X funding
- Branch `worktree-agent-a11da8e0110929e99`. 2 commits (`38a7c43 → 77d7d7b`). ~180 files net (129 in worker app).
- **Most complete worker scaffold (36 fetchers vs 35 in others).**
- Adds three funding fetchers in worker: `crunchbase/` (4–6 venture-tag RSS, 6h :00, 21-day window, slug `funding-news-crunchbase`), `x-funding/` (Apify actor, 2× daily 00:30/12:30 UTC, slug `funding-news-x`, graceful degradation if `APIFY_API_TOKEN` unset), `funding-news/` (base + seed-signal boosting).
- All fetchers use `writeDataStore()` — Redis-compliant, no filesystem reads. **No new `src/app/api/funding/*` routes** — this branch reuses the existing live `src/lib/funding-news.ts` consumer.
- Two new cron route handlers: `/api/cron/twitter-{daily,weekly-recap}`.

### 2.4 Worktree-4 — Supabase ideas + reactions + predictions
- Branch `claude/quizzical-kilby-9a529a`. 1 commit (`280679e`). 752 files, +159k.
- Scope = **replacement of `/ideas` surface**, not parallel feature.
- Top churn dirs: `src/components/` (23.6%), `src/lib/` (20.0%), `src/app/api/` (9.9%), `src/app/` (9.9%), `scripts/` (7.7%), `skills/` (5.0% — Postgres best-practices reference docs only, not runtime).
- Schema (`scripts/builder-migration.sql`): tables `builder_builders`, `builder_ideas` (slug, thesis, problem, why_now, linked_repos JSONB, stack JSONB, tags[], phase, sprint, agent_readiness), `builder_reactions` (kind ∈ {use, build, buy, invest}), `builder_sprints`, `builder_predictions` (p20/p50/p80 distribution, horizon, outcome JSONB). RLS deny-all; service-key-only writes.
- Auth: cookie-bound `builder_builders.id` (same pattern as admin session); GitHub OAuth field present but not enforced in P0.
- Store factory `getBuilderStore()` returns `JsonBuilderStore` (P0 dev) or `SupabaseBuilderStore` (P1 prod) based on env. Route code is store-agnostic.
- New surfaces: `/ideas` (replaces 272-line v2 with 42-line `IdeaFeedClient`), `/ideas/[id]` + `/[slug]` (with OG/twitter images), `/admin/ideas-queue`, `/api/ideas{,/[id],/[slug]}`, `/api/reactions`, `/api/predictions`, `/api/cron/predictions{,/calibrate}`, `/api/predict`.
- Four read-only MCP tools in `src/tools/builder-tools.ts`: `top_ideas`, `idea`, `reactions_for`, `predictions_for_repo`.
- **Risk:** P0 mode reads `data/builder/*.json` via `JsonBuilderStore`. This pairs with the April 2026 burn ("bundled JSON = stale data, 17–34 deploys/day from data churn"). Mitigation already in place: `SupabaseBuilderStore` is built; flipping `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env switches it over.

---

## 3 · Overlap verdicts (Live vs Planned)

| Domain | Live | Planned | Verdict | Reasoning |
|---|---|---|---|---|
| Engagement scoring | `src/lib/scoring.ts` (10-factor momentum, single-source) | Worker `engagement-composite/` (7-component cohort-relative percentile + log) | **NEW (additive)** | Different goal: live = per-repo momentum rank; planned = cross-source relative engagement. They complement; do not collide. |
| GitHub events stream | none | Worker `github-events/` + `/api/repos/[o]/[n]/events` | **NEW** | No firehose on main today. |
| Funding fetchers | `scripts/scrape-funding-news.mjs` (Crunchbase HTML scrape) | Worker `crunchbase/` (RSS) + `x-funding/` (Apify) + `funding-news/` (seed-signal boost) | **REPLACES (Crunchbase) + EXTENDS (X)** | RSS is more robust than HTML scraping; X funding signals are net-new. |
| Reddit / HN / DevTo / Lobsters / npm / Bluesky / ProductHunt collectors | Untyped JS scripts (~480 LOC avg) writing files + Redis | Typed TS worker fetchers (~340 LOC avg) with shared http/log/sentry infra | **WORKER WINS** (see §4) | Strict TS, shared rate-limit + retry, Sentry instrumentation, vitest, atomic Redis publish. |
| GitHub stars/repo metadata | `scripts/scrape-trending.mjs` (OSS Insight) + enrichment | Worker `github/index.ts` (26-line stub) | **LIVE WINS — for now** | Worker is explicit stub; Phase B port deferred. Keep legacy until then. |
| Twitter signals | Apify `apidojo~tweet-scraper`, GHA every 3h | No worker fetcher (intentional — anti-pattern memory) | **LIVE STAYS** | Worker delegates Twitter to legacy; do not migrate. |
| `/ideas` surface | Redis-backed v2 page + ideas.ts hotScore + reactions tally | Supabase-backed builder layer | **REPLACES** | Old logic deleted in worktree-4. Verdict contingent on flipping env to `SupabaseBuilderStore` before merge to avoid P0 file-read regression. |
| Admin ideas queue | `/admin/ideas-queue` (live) | `/admin/ideas-queue` reworked over `IdeasQueueAdmin` | **REPLACES** | Same route, new component + Supabase backing. |
| arXiv | `scripts/scrape-arxiv.mjs` (uncommitted on working branch) + `data/arxiv-trending.json` | None in any worker | **LIVE-only (uncommitted!)** | Working tree has unstaged arXiv scraper + JSON; no worktree migrates it. Risk of bit-rot. |

---

## 4 · trendingrepo-worker scaffold — fetcher-by-fetcher

Scaffold is identical across worktrees 1/2/3 except for the unique Phase fetcher each commits. Worktree-3 has the most fetchers (36); 1 and 2 have 35.

**Shared infra (993 LOC):** `lib/sentry.ts` (Sentry org `agnt-pf`, project `4511285393686608`, 5% trace sample), `lib/redis.ts` (dual ioredis/Upstash, namespace `ss:data:v1:<slug>`), `lib/db.ts` (Supabase client + typed schema), `lib/{http,log,cron,types}.ts`, `sources/` (9 vendor-specific modules), `jobs/` (recompute-scores, publish-leaderboards). Railway start: `node --enable-source-maps --max-old-space-size=512 dist/index.js --cron`. Healthcheck `/healthz` 30s, restart-on-failure max 5.

| Domain | Worker (path, ~LOC) | Legacy (path, ~LOC) | Winner | Why | Retire? |
|---|---|---|---|---|---|
| Reddit | `fetchers/reddit/index.ts` (364) | `scripts/scrape-reddit.mjs` (1001) | **Worker** | Typed, 65s shared backoff, Sentry, structured errors, atomic Redis publish, baseline merging deferred to Phase D | Yes |
| HackerNews | `fetchers/hackernews/index.ts` (383) | `scripts/scrape-hackernews.mjs` (476) | **Worker** | Batched Algolia, shared Firebase client, in-module velocity, Sentry hooks | Yes |
| Dev.to | `fetchers/devto/index.ts` (351) | `scripts/scrape-devto.mjs` (420) | **Worker** | Typed article shapes, 429-fallback, central `sources/devto.ts`, Sentry | Yes |
| Lobsters | `fetchers/lobsters/index.ts` (274) | `scripts/scrape-lobsters.mjs` (289) | **Worker** | Shared http (4× retry, 5s backoff), zod schema validation, testable | Yes |
| NPM | `fetchers/npm-packages/index.ts` (289) | `scripts/scrape-npm.mjs` (581) | **Worker** | Configurable `NPM_SEARCH_DELAY_MS`, batched download ranges, range-miss tolerance | Yes |
| Bluesky | `fetchers/bluesky/index.ts` (375) | `scripts/scrape-bluesky.mjs` (490) | **Worker** | `@atproto/api` client, session pool, Sentry, mockable | Yes |
| ProductHunt | `fetchers/producthunt/index.ts` (403) | `scripts/scrape-producthunt.mjs` (490) | **Worker** | Cursor pagination, no global state, Sentry, atomic publish | Yes |
| GitHub | `fetchers/github/index.ts` (26 — stub) | `scripts/scrape-trending.mjs` (active) | **Live (for now)** | Worker stub: "Phase B port lands later" | Coexist until Phase B |
| Twitter | none | `scripts/collect-twitter-signals.ts` (Apify) | **Live** | Intentional — Apify path lives outside worker | Keep legacy |
| arXiv | none | `scripts/scrape-arxiv.mjs` (uncommitted!) | **Live-only** | Not yet ported; not even committed on main | Commit and port |

**Migration intent.** Comments like *"once Phase D archives the legacy script"* (in `repo-metadata/index.ts`) confirm legacy retirement is the goal. Reddit fetcher already does prior-state-merge with 7d cutoff to mirror the legacy script across run boundaries. Skills fetchers (`claude-skills` vs `skills-sh`) coexist via separate Redis slugs — frontend chooses which to surface.

---

## 5 · Plan-vs-reality gap (still missing)

| Deliverable | Source | Status |
|---|---|---|
| Phase 3.1 engagement composite | `tasks/data-api.md:61` | **In worktree-1 — needs PR** |
| Phase 3.3 GitHub events firehose | `tasks/data-api.md:63` | **In worktree-2 — needs PR** |
| Phase 3.4 Crunchbase + X funding | `tasks/data-api.md:64` | **In worktree-3 — needs PR** |
| Phase 2 — 40k-star cap fix (dual-ended fetch from daily-stars-explorer) | `tasks/data-api.md:48` | PARTIAL (fallback `77a9cc5`, dual-ended not ported) |
| Phase 3 — ClickHouse / GH Archive integration | `tasks/data-api.md:62` | NOT STARTED (zero commits) |
| Phase 4 — API key issuance + management | `tasks/data-api.md:73` | NOT STARTED (only `canUseFeature()` tier check exists) |
| Phase 4 — Tiered rate limits per API key | `tasks/data-api.md:74` | PARTIAL (schema exists, no plumbing) |
| Phase 4 — Stripe usage metering | `tasks/data-api.md:75` | NOT STARTED (CLAUDE.md confirms "not billed yet") |
| Phase 4 — Public API docs at `api.starscreener.com` | `tasks/data-api.md:76` | PARTIAL (`/docs` redirects to `/reference.html`; subdomain not provisioned) |
| Phase 4 — Status page (uptime + p50/p95) | `tasks/data-api.md:77` | NOT STARTED |
| Phase 4 — Webhook alerts as paid feature (delivery layer) | `tasks/data-api.md:78` | PARTIAL (UI + tier gate exist; pipeline `src/lib/pipeline/events.ts` marked "future consumers") |
| Phase 4 — MCP as enterprise-tier feature | `tasks/data-api.md:78` | PARTIAL (cron routes exist; no entitlement gate) |
| Phase 4 — Standalone API product landing page | `tasks/data-api.md:79` | NOT STARTED |
| Phase 2.5 — Disable git-push from 11 collector workflows | `workflow-strip-rollout.md` | OPEN PR #10 (blocked on GH Actions runner queue) |
| arXiv pipeline commitment | working tree (uncommitted), `scripts/scrape-arxiv.mjs`, `data/arxiv-trending.json` | UNCOMMITTED — not in any worktree, not in main |

**Sitemap gaps.** `src/app/sitemap.ts` covers all live routes (`/twitter`, `/ideas`, `/funding`, `/reddit`, `/bluesky`, `/devto`, `/lobsters`, `/hackernews`, `/producthunt`, `/npm`, `/papers`, `/research`, `/news`, `/skills`, `/mcp`). Missing: `api.starscreener.com` subdomain (no domain separation), no API-product-only landing surface.

**Anti-pattern reintroduction.** Spot-checks across all 4 worktrees: no `readFileSync(process.cwd(), "data", ...)` in request paths; Redis data-store contract honored by all Phase 3 fetchers (`writeDataStore()` used); Twitter collector remains Apify (not reverted to cookie-based). **One caution:** worktree-4's `JsonBuilderStore` reads `data/builder/*.json` from the request path during P0 mode — it must be flipped to `SupabaseBuilderStore` (env-controlled) before/at merge to avoid the April-2026 deploy-churn pattern.

---

## 6 · Recommended merge order

1. **Worktree-2 first** — its `tsconfig.json` exclude-`apps` fix is mandatory before any other worker code lands; without it Next typechecks the worker and breaks. Also delivers the `.github/workflows/trendingrepo-worker.yml` CI runner. Address the 3 unstaged rate-limit mods first (commit or revert).
2. **Worktree-1** — engagement-composite is purely additive once worker CI + tsconfig from (1) are in.
3. **Worktree-3** — Phase 3.4 fetchers are isolated additions; 36-fetcher scaffold is a strict superset, no scaffold conflicts expected.
4. **Worktree-4** — flip `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env in Vercel **before** merging so `getBuilderStore()` returns `SupabaseBuilderStore` on first deploy. Otherwise P0 file-reads ship to prod.
5. **Commit the working-tree arXiv scraper** (`scripts/scrape-arxiv.mjs`, `data/arxiv-trending.json`, `src/lib/arxiv-trending.ts`) on a small dedicated branch — currently bit-rotting outside any tracked work.
6. **Then start Phase 4** (API keys → metering → status page → API product domain). None of it has any commits yet; this is the largest remaining greenfield.

---

## 7 · Verification (read-only sanity for next session)

```bash
# Confirm main HEAD and unmerged worktree shas match this audit
git -C c:/Users/mirko/OneDrive/Desktop/STARSCREENER log -1 --oneline main
for w in agent-a8a7ee90307f940b2 agent-a5b609bc139d02c8e agent-a11da8e0110929e99 quizzical-kilby-9a529a; do
  git -C "c:/Users/mirko/OneDrive/Desktop/STARSCREENER/.claude/worktrees/$w" log --oneline main..HEAD
  git -C "c:/Users/mirko/OneDrive/Desktop/STARSCREENER/.claude/worktrees/$w" status --porcelain
done

# Sentry project still alive
# Org agnt-pf, project id 4511285393686608 — check via Sentry UI

# Confirm Phase 4 still empty
git -C c:/Users/mirko/OneDrive/Desktop/STARSCREENER log --all --oneline | grep -i -E '(api[- ]key|usage[- ]meter|status[- ]page)' | head
```

---

## Summary

- **Live:** 39 pages, 73 endpoints, 11 collectors, 13 Redis slugs, 10-factor momentum scoring, 26 GHA workflows.
- **Queued (4 worktrees, 0 PRs):** engagement-composite scoring, GitHub events firehose, Crunchbase RSS + X funding, Supabase-backed `/ideas` rewrite. Plus the trendingrepo-worker microservice scaffold (36 fetchers, Sentry-wired, Railway-ready).
- **Worker beats legacy** on 7 of 7 ported domains (Reddit, HN, DevTo, Lobsters, npm, Bluesky, ProductHunt). GitHub stays on legacy until Phase B; Twitter stays on Apify by design.
- **Missing entirely:** Phase 4 monetization stack (API keys, metering, webhooks delivery, status page, API subdomain), ClickHouse depth, the 40k-star dual-ended fix, and a committed arXiv pipeline.
- **Critical merge blocker:** worktree-4's P0 `JsonBuilderStore` must not ship without the Supabase env flip.
