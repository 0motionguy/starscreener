# HANDOVER — Velocity engine PHASE 2 (hardening shipped + roadmap) — 2026-05-29

Continuation of [docs/HANDOVER-VELOCITY-ENGINE-2026-05-29.md](HANDOVER-VELOCITY-ENGINE-2026-05-29.md)
(the engine BUILD, now shipped). This doc = what's live after the hardening pass +
the ranked roadmap for the next session. **Read this first, then ENGINE.md.**

## ✅ WHAT'S LIVE + VERIFIED (prod = TOOLBOX + Cloudflare, NOT Vercel)

Branch `bot/swarm-a6-producthunt-reader` (prod deploys off THIS branch; GH Action
cron only fires from `main`, so new recurring jobs MUST be a worker fetcher or
TOOLBOX cron.d — never a GH Action).

**The velocity engine (our own, OSS-Insight-independent):**
- `velocity-refresh` (`*/40 * * * *`) — cheap 1-call `/repos` refresh of the top-300
  by current velocity → updates today's `star-activity` point → recomputes the delta
  entry (`entryFromPayload`) → merges into the `star-activity-deltas` slug. Hardened:
  re-reads slug right before merge (shrinks cross-fetcher race), try/catch on write,
  empty-recompute → ERROR signal.
- `velocity-seed` (`13 6 * * *`) — bounded (top-150) throttled newest-first stargazer
  walk seeding recent 7d/30d anchors. Retry-After + 403 backoff + token rotation.
- Files: `apps/trendingrepo-worker/src/fetchers/velocity-{refresh,seed}/index.ts`.
- App reads `star-activity-deltas` via `src/lib/star-activity-deltas.ts` + the Delta
  Engine `resolveDelta` (`src/lib/derived-repos/delta-engine.ts`, prefers it for 7d/30d).

**Shipped fixes (all verified in prod):**
- **% correctness** — `src/lib/velocity-pct.ts` (period-start base `stars-delta`,
  young-repo guard) applied to 5 display surfaces (PeriodCell, TopMoversRail,
  FeaturedRepos, RepoOrgSnapshot, RepoKpiStrip).
- **Surfacing** — `requireWindowDelta` extended to Gainer/Trend tabs (`src/app/page.tsx`)
  so stale-OSS `trendScore` no longer floats "— — —" rows to the top.
- **Stars accuracy** — `saEntry.stars_now` wired into `repo.stars` precedence (both
  `derived-repos.ts` loops) — registry repos no longer show "2 stars" beside +939.
- **Observability** — `star-activity-deltas` added to freshness `SOURCE_SPECS`
  (`src/app/api/cron/freshness/state/route.ts`, blocking 6h). Silent engine death now
  surfaces. Verified GREEN in prod.
- **Home perf** — 7 serial `refresh*FromStore()` reads parallelized (`Promise.all`).

**Commits (newest last):** `2d566e963` (engine+%), `0dea85501` (surfacing+docs),
`682af263c` (stars), `96f2dad02` (handover banner), `43832d7c2` (observability+hardening+perf).
**Live images:** `…vps-20260529100910-43832d7c2` (both app + worker).

**Coverage now:** `star-activity-deltas` slug = 325 repos, real24 184 / real7 152 /
real30 178. Broad long-tail coverage keeps WARMING via the daily `star-activity`
snapshot accruing points — leave it; don't force-seed.

## 🧭 ROADMAP — ranked (what the fresh session should do)

### 1. ★ Public GitHub-events SQL → daily star-delta engine  (HIGHEST LEVERAGE — NO GCP, NO KEYS, FREE)
**Problem it solves:** the stargazer walk hits GitHub's secondary rate limit by
construction (700-repo sweep failed 571/700). A pre-aggregated GH-Archive copy removes
pagination entirely — one query gets every repo's daily star counts.
**Use ClickHouse's PUBLIC playground (no account, no key, no Google):** it mirrors the GH
Archive `github_events` table (7.5B rows, refreshed hourly). One HTTP request returns
per-repo daily new-star counts for the WHOLE registry:
```
curl 'https://play.clickhouse.com/?user=play' --data-binary \
"SELECT repo_name, toDate(created_at) AS d, uniqExact(actor_login) AS stars
 FROM github_events
 WHERE event_type='WatchEvent' AND created_at >= now() - INTERVAL 35 DAY
   AND repo_name IN ('owner/a','owner/b', ...)
 GROUP BY repo_name, d ORDER BY repo_name, d FORMAT JSON"
```
Write the per-repo daily points into the `star-activity:*` slugs (or deltas straight into
`star-activity-deltas`). **No GCP, no service account, no GitHub rate limit.**
**Build as:** worker fetcher `velocity-archive` (daily). FIRST `DESCRIBE github_events`
to confirm column names against the live schema. CRITICAL: play.clickhouse.com is a free
demo with NO SLA — treat it as a BACKFILL/enrichment source: cache results into OUR slugs
(source of truth) and degrade gracefully if it's unreachable (keep velocity-seed + the
daily `/repos` snapshot as fallback). Chunk the `repo_name IN (...)` list if the registry
is large. Effort: M.
**Note — you may not need this at all:** the existing daily `star-activity` `/repos`
snapshot ALREADY broadens 7d/30d coverage over ~7–30 days at $0 with no rate-limit
("let it warm"). This item just buys INSTANT broad coverage instead of waiting.
**Fallbacks:** GH Archive raw hourly files (data.gharchive.org, no account, heavier —
process on the TOOLBOX box) if ClickHouse-play is flaky; BigQuery is the SAME data but
only worth it if you specifically want GCP + an SLA — otherwise skip it.

### 2. velocity-seed REST → GraphQL stargazers  (no new keys)
Replace the REST `star+json` page-walk with GraphQL
`repository(owner,name){ stargazers(first:100, orderBy:{field:STARRED_AT,direction:DESC}){ totalCount edges{ starredAt } } }`
— gets the recent tail + `totalCount` in ONE request, cursor-paginate (`after:`) only
until `starredAt < cutoff`. Far fewer requests than probing `rel="last"` + REST pages.
Uses existing `GH_TOKEN_POOL`. **Careful rewrite — do with eyes on it** (subtle
pagination; velocity-seed bug would silently under-seed). Effort: M. Test the cursor
loop as a pure fn.

### 3. Enable dormant integrations  (NEEDS KEYS)
Wired but key-less in BOTH app + worker `.env`: **Apify** (`APIFY_API_TOKEN`) →
unblocks Twitter + x-funding mention coverage; **libraries.io** (`LIBRARIES_IO_API_KEY`)
→ npm-dependents/funding signals. Drop keys on TOOLBOX → they light up.

### 4. Deferred / lower-urgency (do when convenient)
- **`recordRateLimit` coordination** — only 3 fetchers record GH rate-limit headers
  back to the shared pool. Most use `ctx.http.json()` (not raw fetch), so the RIGHT
  fix is to instrument the HttpClient ONCE (`apps/trendingrepo-worker/src/lib/http.ts`),
  not per-fetcher. M, touches shared infra — verify carefully.
- **Perf (cache-gated, low urgency):** `getDerivedRepos` cache-key floor 5s→30s + hoist
  the mentions-rollup lifetime-index out of the decorator. Both run behind the
  `getDerivedRepos` cache (per cron-write, not per-request) → modest. Floor change risks
  staleness — verify `getXxxDataVersion` semantics first.
- **Hygiene:** `star-activity` pick token per-repo (not once/run); cap merged delta map.
- **Pre-existing product staleness** (NOT the velocity engine): freshness shows ~13
  DEAD sources (dormant MCP/Apify/Reddit producers, tracked since 2026-05-05). Separate
  cleanup initiative; each dead source needs a keep/kill/key decision.

## 🚀 DEPLOY RECIPES (exact, verified repeatedly this session)

Both compose files pin a **versioned `vps-<ts>-<sha>` tag** (NOT `:current-prod` — that's
an alias). Build ON the box from the git checkout. `ssh toolbox` works.

**Worker:**
```
ssh toolbox 'bash -s' <<EOF
cd /opt/trendingrepo && git fetch origin <branch> -q && git checkout <sha> -- apps/
TAG=toolbox-trendingrepo-worker:vps-$(date +%Y%m%d%H%M%S)-<sha>
docker build -q -t "$TAG" apps/trendingrepo-worker
sed -i "s|image: toolbox-trendingrepo-worker:.*|image: $TAG|" /opt/toolbox-trendingrepo-worker/docker-compose.yml
cd /opt/toolbox-trendingrepo-worker && docker compose up -d
EOF
```
**App:**
```
cd /opt/trendingrepo && git checkout <sha> -- src/ content/ public/ next.config.ts package.json package-lock.json perf/ scripts/ apps/
TAG=trendingrepo-app:vps-$(date +%Y%m%d%H%M%S)-<sha>
docker build -q -t "$TAG" .
sed -i "s|image: trendingrepo-app:.*|image: $TAG|" docker-compose.trendingrepo.yml
docker tag "$TAG" trendingrepo-app:current-prod
docker compose -f docker-compose.trendingrepo.yml up -d --force-recreate
# healthz: curl -s localhost:3023/api/healthz
```
Next builds are slow (~5-8 min) — run in background. `--force-recreate` clears the app
ISR cache (bare `/` comes back fresh; query-param routes are already dynamic).

## 🔍 VERIFICATION COMMANDS
- Slug coverage: `docker exec toolbox-trendingrepo-worker-1 node -e "import('/app/dist/lib/redis.js').then(async({readDataStore})=>{const p=await readDataStore('star-activity-deltas');const ids=Object.keys((p&&p.repos)||{});let r24=0,r7=0,r30=0;for(const k of ids){const e=p.repos[k];if(e.delta_24h?.value!=null&&e.delta_24h.basis!=='cold-start')r24++;if(e.delta_7d?.value!=null&&e.delta_7d.basis!=='cold-start')r7++;if(e.delta_30d?.value!=null&&e.delta_30d.basis!=='cold-start')r30++;}console.log('repos',ids.length,'r24',r24,'r7',r7,'r30',r30);process.exit(0);})"`
- Freshness (engine monitored): `docker exec toolbox-trendingrepo-1 node -e "fetch('http://localhost:3023/api/cron/freshness/state',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d.sources.find(x=>x.name==='star-activity-deltas'))))"`
- Trigger a fetcher once: `docker exec toolbox-trendingrepo-worker-1 node /app/dist/index.js <name>`
- Prod visual: Playwright `https://trendingrepo.com/?rank=gainer` + `?rank=trend`; extract `.period-cell` (`.period-delta` + `.period-pct`); top rows must NOT be "— — —".

## ⚠️ GOTCHAS / RULED OUT (don't re-litigate)
- OSSInsight is dead (500s for days) — its `oss-trending` zero-write guard ALREADY exists
  (route preserves last-good). Not an open gap.
- Don't retry the naive full-registry stargazer walk (rate-limit cascade).
- `recent-velocity-points.mjs` is already committed.
- gz1: read the registry/slugs via the WORKER container's `readDataStore` (decompresses);
  app-side `_data-store-write.mjs readDataStore` does NOT.
- Node probes: `process.exit(0)` at the end or ioredis hangs the pipe.
- No push/deploy without explicit operator consent; stage exact files (parallel-session
  staging hazard).

## 📋 PASTE-READY KICKOFF PROMPT (for the fresh session)

> Read `docs/HANDOVER-VELOCITY-PHASE2-2026-05-29.md` fully, then `docs/ENGINE.md`. The
> velocity engine (velocity-refresh */40 + velocity-seed daily) + % fix + surfacing fix +
> stars fix + freshness monitoring are SHIPPED and live on TOOLBOX (branch
> `bot/swarm-a6-producthunt-reader`). Don't rebuild them. GOAL: build roadmap item #1 — a
> daily star-delta engine sourced from the PUBLIC ClickHouse `github_events` dataset
> (`https://play.clickhouse.com/?user=play`, no account/key/GCP) to make 7d/30d coverage
> broad and cheap WITHOUT the GitHub stargazer rate-limit. Build it as a new worker fetcher
> `velocity-archive` (daily): `DESCRIBE github_events` first, then query per-repo daily
> WatchEvent counts (uniqExact(actor_login)) for the registry, chunk the repo IN-list,
> write per-repo points into the `star-activity:*` slugs. CRITICAL: ClickHouse-play has no
> SLA — cache into our slugs + degrade gracefully (keep velocity-seed + the daily snapshot
> as fallback). Verify slug coverage climbs, deploy to TOOLBOX (recipes in the doc),
> confirm `/`, `/?rank=gainer`, `/?rank=trend` still lead with real velocity. Prod =
> TOOLBOX/Cloudflare, NOT Vercel. Don't re-diagnose: OSSInsight is dead, token pool healthy,
> engine works — this is purely cheap BROAD coverage. Get explicit consent before any deploy.
