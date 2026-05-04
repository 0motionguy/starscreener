# Scale + Hardening Audit — trendingrepo.com

**Date:** 2026-05-04
**Auditor:** Claude (Opus 4.7) orchestrator + 12 read-only sub-agents (QUEEN topology, 3 waves, max 5 concurrent)
**Method:** static analysis + live measurement (curl, redis-cli equivalent via ioredis, Lighthouse, npm build / audit, gh CLI). Zero code edits.
**Branch at audit time:** `audit/operator-followup-wave2-2026-05-04` (HEAD `58ffcaba`).
**Target scale:** 10,000 concurrent users.
**Scope:** repository at `c:\Users\mirko\OneDrive\Desktop\STARSCREENER` + production endpoints at `https://trendingrepo.com` (off-peak, ≤150 read requests, ≤4 redis-cli reads, no load tests, no mutations).

Companion / prior reports:
- [docs/AUDIT-2026-05-04.md](../AUDIT-2026-05-04.md) — pipeline reality check (sources × workflows × keys)
- [docs/forensic/07-LAST-7-WORKFLOW-CLASSIFICATION-2026-05-04.md](07-LAST-7-WORKFLOW-CLASSIFICATION-2026-05-04.md) — recurring workflow failures
- [docs/forensic/08-CRON-OVERLAP-DUPLICATE-MAP-2026-05-04.md](08-CRON-OVERLAP-DUPLICATE-MAP-2026-05-04.md) — minute-of-hour contention
- [docs/ENGINE.md](../ENGINE.md) §3–§4 — engine + cron registry
- [docs/SITE-WIREMAP.md](../SITE-WIREMAP.md) — route → data → collector → external API

---

## Executive Summary

**Overall posture for 10,000 concurrent users: WARN (ship-worthy after P0 fixes; soft-launch to 1k first).**

| Severity | Count |
|---|---|
| P0 (blockers — must fix BEFORE ramp) | **9** |
| P1 (high — fix in next sprint) | **13** |
| P2 (medium — fix in 30 days post-traffic) | **9** |
| P3 (nice-to-have) | 6 |

### Top 5 risks at 10k users

1. **Vercel bandwidth cost bomb — `/reddit/trending` returns 4.18 MB HTML.** If 5% of traffic at 10k users hits this route uncached, that's 1.57 PB/month bandwidth = **$235K/month** at Pro overage rates ($0.15/GB). The full picture: even with avg 100 KB ISR HTML the bandwidth bill is ~$112,800/month at 10k sustained. Vercel Enterprise is mandatory above ~5k concurrent.
2. **No global rate limiting** — `src/middleware.ts` does not exist; only 6 of ~107 API routes invoke any rate-limit primitive. ~50 public read routes have zero application-layer throttling. A single IP at 10 RPS can amplify into 350 GitHub REST calls/sec via `/api/compare/github`, draining the entire 11-PAT pool inside a minute.
3. **Redis unbounded + deploy-storm worsening** — live probe: `maxmemory:0`, `noeviction`, 81% of keys have no TTL. When Redis fills, writes fail silently. **Plus:** the audit-2026-04-26 fix to stop committing `data/*.json` did NOT take effect — last 7 days show 96 data-churn commits/day (vs the audit-flagged 17/day baseline), 96 Vercel builds/day, ~44% over the Pro build-minute cap, and parallel-merge conflicts per CLAUDE.md anti-pattern.
4. **Sentry DSN missing on Vercel production** — 25 hand-instrumented `Sentry.captureException` sites + 81 RSC error-boundary captures + the entire 38-class `EngineError` hierarchy are all dead-letters today. Worker (Railway) has DSN; main user-facing surface does not. Operator MTTD goes from "minutes" to "user complains in Discord first" at 10k scale.
5. **Recon surfaces fully unauthenticated** — `/api/worker/health` (38-slug fleet topology, fetcher names, cadences, blocking flags), `/api/pipeline/status` (full ScannerSourceHealth array, GitHub `rateLimitRemaining`, repo counts, raw `err.message` echoes on 500), `/api/health/sources` (per-source `lastFailure: string`), and `/api/health/cron-activity` (cron schedule + last-fired timestamps). Combined: attacker has perfect upstream observation for timing-based abuse + plus the **`admin/scan` rate-limit drift finding** ([route.ts:168-275](../../src/app/api/admin/scan/route.ts) has zero rate-limit code despite commit `90ec33b5` advertising 10/min).

### Top 5 strengths (already 10k-ready)

1. **Three-tier data-store fallback** ([src/lib/data-store.ts:264-332](../../src/lib/data-store.ts)) — Redis → bundled JSON → in-memory LKG. Page never goes blank if Redis hiccups.
2. **GitHub token pool with hydration + Sentry alerts** ([src/lib/github-token-pool.ts:316-401](../../src/lib/github-token-pool.ts)) — 11 PATs (10 + 1), highest-remaining selection, 24h quarantine on 401, Redis-backed fleet aggregation.
3. **Apify → Nitter Twitter fallback** ([src/lib/pool/twitter-fallback.ts:26-107](../../src/lib/pool/twitter-fallback.ts)) — Sprint Phase 1.3 work, with `OPS_ALERT_WEBHOOK` integration.
4. **Zod validation discipline is real and complete** — all 45 mutating routes validate body via `parseBody(req, Schema)` or equivalent typeof+regex+allow-list. 0 fails. `lint:guards` enforces.
5. **Excellent CDN + headers for ISR routes** — `X-Nextjs-Stale-Time: 300`, HSTS 2-year preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, Permissions-Policy, Referrer-Policy strict-origin-when-cross-origin (all confirmed via curl).

### Verdict

**Can the system handle 10k users TODAY? NO — without P0 fixes.**

Recommended path:
1. Ship P0 fixes (Sprint 2 — see Part K).
2. Soft-launch to 1k concurrent for 1 week to validate rate-limit + observability + Redis growth.
3. Ramp to 10k incrementally with the cost cliffs in Part I.6 monitored.

---

## Part A — Request Path Performance

### A.1 Route inventory + cold-start TTFB measurement

Production curl sweep, 5 sequential requests per route (warmth varies by Vercel cache state at request time). Measurements taken from Singapore edge (`X-Vercel-Id: sin1::iad1::*`).

| Route | Render mode | revalidate | size | p50 TTFB | p95 (max-of-5) | Notes |
|---|---|---|---|---|---|---|
| `/` | RSC + ISR | 1800s (per CLAUDE.md) | 872 KB | 179 ms | 752 ms | `X-Vercel-Cache: STALE` (revalidating during measurement) |
| `/reddit/trending` | RSC + ISR | 300s (`X-Nextjs-Stale-Time`) | **4.18 MB** | 225 ms | **1717 ms** | Largest HTML payload measured |
| `/hackernews/trending` | RSC + ISR | 300s | 746 KB | 159 ms | 198 ms | Best-performing route |
| `/compare` | RSC (no ISR — `Cache-Control: private, no-cache, no-store`) | dynamic | 241 KB | 448 ms | 794 ms | Every request hits origin |
| `/collections` | RSC + ISR | 300s | 272 KB | 161 ms | 869 ms | One cold sample (869 ms) |
| `/portal/docs` | RSC + ISR | 300s | 226 KB | 153 ms | 1083 ms | One cold sample |
| `/search` | RSC + ISR | 300s | 203 KB | 159 ms | 908 ms | |
| `/repo/microsoft/vscode` | RSC + ISR | 300s | 221 KB | 410 ms | **1547 ms** | Confirms RSC sequential-await chain (A.2) |
| `/twitter` | RSC + ISR | 300s | 482 KB | 469 ms | 686 ms | |
| `/api/repos/microsoft/vscode` | API (`s-maxage=30, swr=60`) | 30s | 61 B | 405 ms | 2272 ms | Returns **404** — `microsoft/vscode` not in trending dataset |

Method: `curl -w 'time_starttransfer time_total size_download http_code' -s -o /dev/null`. Sample size: 50 requests across 10 routes. Off-peak (UTC 11:11–11:25). Singapore edge to IAD region. Full output in `/c/tmp/.../tasks/b32qxbq6l.output` (orchestrator-only).

### A.2 Server-component data fetching (sequential vs parallel)

Sub-agent A-RSC enumerated every `src/app/**/page.tsx` (excluding admin) and classified each top-level await chain.

**FAIL routes (>3 sequential awaits OR unbounded fan-out):**

| Route | seq awaits | parallel awaits | Issue |
|---|---|---|---|
| `/ideas` ([src/app/ideas/page.tsx:139,141,88-95](../../src/app/ideas/page.tsx)) | 4 | per-record 1 | searchParams + listIdeas + **Promise.all(visible.map(async idea => await listReactionsForObject))** + render. Unbounded N where N = published+shipped ideas. Code comment acknowledges "Postgres cutover will collapse to single GROUP BY" — cutover hasn't shipped. |
| `/repo/[owner]/[name]` ([src/app/repo/[owner]/[name]/page.tsx:161,177,197,214](../../src/app/repo/[owner]/[name]/page.tsx)) | 4 | 14 | params + Promise.all(14 refresh hooks) + buildCanonicalRepoProfile + listReactionsForObject. **Confirmed by p95=1.5s TTFB measurement above.** The canonical assembler runs *after* the 14-hook Promise.all completes. Mitigation: parallelize `buildCanonicalRepoProfile` and `listReactionsForObject` via Promise.all — they're independent. |

**Borderline (3 sequential awaits — watch under load):** `/categories/[slug]`, `/collections/[slug]`, `/ideas/[id]`, `/mcp/[slug]`, `/model-usage`, `/skills`, `/u/[handle]`.

**Critical fails — external API direct calls in RSC (anti-pattern per CLAUDE.md):**

| Route | File:line | Call | Severity |
|---|---|---|---|
| `/agent-commerce/facilitator/[name]` | [page.tsx:72-76, 96, 97](../../src/app/agent-commerce/facilitator/%5Bname%5D/page.tsx) | `fs.readFileSync('.data/base-x402-onchain.json')` × 2 per render — no module cache, no Redis, source comment admits anti-pattern | **P0** |
| `/u/[handle]` | [page.tsx:104-106](../../src/app/u/%5Bhandle%5D/page.tsx) | Direct `api.github.com/users/{login}` from RSC body, ISR-cached 24h per handle | **P1** (per-region cache fragmentation; long-tail handles bleed pool tokens) |
| `/reddit/trending` | [page.tsx:44-47](../../src/app/reddit/trending/page.tsx) | `readFileSync('data/reddit-all-posts.json')` bundled fallback | **P2** (module-scope cached, amortized) |

**Routes confirmed clean (data-store-only):** 49 of the 53 non-admin server components. `/compare` is a client form posting to `/api/compare/*` — RSC body only awaits `searchParams` (verified safe).

### A.3 ISR / cache headers

| Route group | Cache-Control | X-Vercel-Cache | Verdict |
|---|---|---|---|
| ISR public pages (`/`, `/reddit/trending`, `/hackernews/trending`, `/collections`, `/portal/docs`, `/search`) | `public, max-age=0, must-revalidate` + `X-Nextjs-Stale-Time: 300` | STALE / HIT | **PASS** — 5min ISR, edge serving stale during revalidate |
| `/compare` | `private, no-cache, no-store, max-age=0, must-revalidate` | MISS | **GAP** — every request hits origin. At 10k users this is `~167 inv/sec` of compare-page lambda execution |
| `/api/health` | `public, max-age=0, must-revalidate` | MISS | GAP — every request hits origin. Has internal 15s soft cache (`SOFT_HEALTH_CACHE_TTL_MS`) when `?soft=1` |
| `/api/health/sources` | `public, max-age=0, must-revalidate` | MISS | GAP |
| `/api/openapi.json` | `public, s-maxage=3600, stale-while-revalidate=86400` | MISS (rare hit) | **PASS** — 1h edge cache, excellent |
| `/portal` | `public, max-age=60` | MISS | OK — 60s |
| `/api/repos/[owner]/[name]` | `public, s-maxage=30, stale-while-revalidate=60` (per [route.ts:17 doc](../../src/app/api/repos/%5Bowner%5D/%5Bname%5D/route.ts)) | MISS | OK |

### A.4 Bundle size

**`npm run build` FAILED on the audit branch** — type error in [src/app/api/cron/freshness/state/route.ts:12](../../src/app/api/cron/freshness/state/route.ts):

```
Type error: Type 'OmitWithTag<typeof import("...freshness/state/route"), "runtime" | "GET" | "POST" | ...>'
does not satisfy the constraint '{ [x: string]: never; }'.
  Property '__setInspectSourceForTests' is incompatible with index signature.
```

The non-route export `__setInspectSourceForTests` violates Next 15's route module type contract. Recommended fix: move test-only export onto `globalThis` under a `Symbol.for(...)` key (same pattern as [openapi.json/route.ts:117-121](../../src/app/api/openapi.json/route.ts)).

**P1 finding** — current branch cannot deploy clean. Bundle size table is consequently UNKNOWN; note in Evidence Appendix.

Compilation completed (✓ 2.5min) — the error is in the type-check phase. Linting reported ~30 unused-vars warnings, plus 2 `<img>` warnings that overlap J.3.

### A.5 N+1 query patterns

Sub-agent A-NPlus1 hunted three patterns; results:

**Hunt 1 — `Promise.all(arr.map(async))` in request-path scope:**

The strict `\.map\([^)]*await ` grep returned **zero hits** — the codebase prefers `Promise.all(arr.map(async))` (parallelized fan-out, not serialized). At 10k users per-iteration external calls still amplify regardless.

| File:line | Iters | Per-item kind | Severity |
|---|---|---|---|
| [src/app/api/repos/[owner]/[name]/route.ts:174-176](../../src/app/api/repos/%5Bowner%5D/%5Bname%5D/route.ts) | 2-6 social adapters | **External HTTP** to Reddit/HN/Bluesky/PH/DevTo + Nitter | **P1** (only `?v=1` legacy path; `?v=2` default uses data-store via `buildCanonicalRepoProfile`) |
| [src/app/ideas/page.tsx:95-105](../../src/app/ideas/page.tsx) | N = published+shipped ideas (unbounded) | Redis read per idea | **P1** |
| [src/app/u/[handle]/page.tsx:112-117](../../src/app/u/%5Bhandle%5D/page.tsx) | N = profile ideas (1-50) | Redis read per idea | **P1** |
| [src/app/api/admin/pool-state/route.ts:383-578](../../src/app/api/admin/pool-state/route.ts) | N = configured tokens | 2 Redis ops per key | **P1** (admin route, but scales with pool size) |
| [src/app/api/worker/health/route.ts:167-184](../../src/app/api/worker/health/route.ts) | N = SLUG_TABLE (~30+) | Redis sidecar GET per slug | **P1** (also recon — see E.4) |
| [src/lib/top10/sparkline-store.ts:139-156](../../src/lib/top10/sparkline-store.ts) | bounded 8-at-a-time | Redis read | **PASS** — exemplary bounded-concurrency pattern; consider porting elsewhere |

**Hunt 2 — `forEach + async`:** **Zero hits** across `src/`, `apps/trendingrepo-worker/src/`, `scripts/`. Codebase discipline on this is solid.

**Hunt 3 — `refresh*FromStore` placement:** **Zero placement violations.** All 50+ call sites place the refresh call at the top of the route/server-component body, never inside loops/conditionals. Only minor wart: [agent-commerce/[slug]/page.tsx:44,56](../../src/app/agent-commerce/%5Bslug%5D/page.tsx) calls `refreshAgentCommerceFromStore()` once in `generateMetadata` and once in the page body — internal 30s dedupe collapses it, but cosmetic.

---

## Part B — Data Layer Scalability

### B.1 Redis posture

**Live probe** (read-only, 4 commands): `node -e "..."` using ioredis against `redis://default:<MASKED>@shortline.proxy.rlwy.net:16128` (Railway Redis).

| Metric | Value |
|---|---|
| Backend | Railway native Redis (TCP via ioredis), proxied through `shortline.proxy.rlwy.net:16128` |
| `DBSIZE` | **4,717 keys** |
| `used_memory_human` | 75.24 MB |
| `used_memory_peak_human` | 209.65 MB (recent) |
| `maxmemory` | **0 (unlimited)** |
| `maxmemory_policy` | **`noeviction`** — when memory hits OS limits, writes fail with OOM |
| `mem_fragmentation_ratio` | 1.16 (healthy) |
| `connected_clients` | 48 / 10000 max |
| `instantaneous_ops_per_sec` | 2 (steady-state) |
| `total_commands_processed` | 7,174,717 |
| `total_connections_received` | 12,981 |
| `keyspace_hits` / `keyspace_misses` | 4,940,371 / 2,117,339 (**70% hit rate**) |
| `expired_keys` | 1,670 (lifetime) |
| `evicted_keys` | 0 (cannot evict — `noeviction` policy) |
| Keyspace summary | `db0:keys=4717,expires=880,avg_ttl=4579732030,subexpiry=0` |

**Per-request Redis call count on home page:** unverified directly, but A-RSC + A-NPlus1 evidence shows `/` calls `Promise.allSettled([getSkillsSignalData(), getMcpSignalData()])` + sync `getDerivedRepos()`. Each `refresh*FromStore` is internally rate-limited to 1 call per 30s per source. Per-request Redis calls: ~10–15 reads on cold cache; ~0 on warm cache (in-memory LKG hits).

### B.2 Redis sizing

**SCAN-sampled 200 keys + prefix histogram:**

| Prefix | Count (of 200) |
|---|---|
| `ss:` (data-store namespace) | 194 (97%) |
| `pool:` (token pool) | 6 (3%) |

**TTL coverage on 200-key sample:** with-TTL=38, no-TTL=162. **81% of keys have NO TTL** — they persist until explicitly overwritten. The `keyspace` line confirms: 4717 total, 880 with `expires` = 18.7%.

**Sample key sizes (10 keys via TYPE + STRLEN/HLEN):**

| Key | Type | Size |
|---|---|---|
| `ss:meta:v1:star-activity:thunderbird__thunderbolt` | string | 129 B |
| `ss:data:v1:skill-forks-snapshot:2026-04-30` | string | 6,471 B |
| `ss:data:v1:star-activity:freestylefly__awesome-gpt-image-2` | string | 593 B |
| `ss:data:v1:star-activity:kstost__cokacdir` | string | 219 B |
| `pool:github:usage:fC8P:2026-05-04-04` | hash | 8 fields |

**No hot keys identified in 200-key sample.** Largest sampled value: 6.5 KB. Average: ~1 KB. Total raw: ~5 MB; with overhead = 75 MB observed (consistent).

**P0 finding — Redis growth is unbounded:**
- `maxmemory:0` + `noeviction` + 81% no-TTL = monotonic memory growth
- Star-activity keys grow with every tracked repo; no expiry
- At current growth rate (75 MB now, 209 MB peak in last days) — **time to memory exhaustion depends on Railway plan ceiling**, which is not declared in code (operator must confirm)
- When Redis fills, **writes fail silently** (the data-store `try/catch` swallows errors per [data-store.ts:290-292](../../src/lib/data-store.ts)), reads fall through to bundled JSON (deploy-time old). Truth-skew is invisible.

### B.3 Read-write ratio + projected RPS at 10k users

| Source | Write rate (cron) | Read rate now (estimate) | At 10k users (estimate) |
|---|---|---|---|
| Steady-state ops/sec (live) | — | 2 ops/sec | — |
| Cron writes/day | 15,750 fires × ~1 write each (per [docs/forensic/02-WORKFLOWS.md](../forensic-2026-05-03/02-WORKFLOWS.md)) = ~15k writes/day = 0.17 writes/sec | — | — |
| At 10k users × ~1 page/min × ~10 Redis reads/page | — | — | **~1,667 reads/sec** |
| At 10k users × 1 mutating action/5 min | — | — | **~33 writes/sec** |
| **Projected ops/sec at 10k users** | — | — | **~1,700 ops/sec** |

Railway Redis capacity ceiling: depends on plan. ioredis client pool (singleton per Lambda) at ~50 lambdas × ~10 connections = 500 connections — well under `maxclients: 10000`.

### B.4 Bundled JSON fallback impact

`data/*.json` files are bundled into every Vercel deploy (per CLAUDE.md anti-pattern). Total size estimated at single-digit MB based on typical scrape outputs (`trending.json` is ~551 KB per [scripts/scrape-trending.mjs:24-28](../../scripts/scrape-trending.mjs)). Multiplied across ~30 bundled files: several MB shipped to every Lambda.

**Module-init top-level work:** [trending.ts:16,46](../../src/lib/trending.ts), `bluesky.ts`, `producthunt.ts`, etc. all `import "../../data/*.json"` — JSON-literal evaluations. Fast individually but balloon V8 heap at lambda boot.

### B.5 In-memory LKG cache impact

`src/lib/data-store.ts` maintains a per-process in-memory last-known-good cache for every data-store key read. At 10k concurrent users on Vercel = ~50–200 lambdas, each instance holds its own cache copy (deploys + cold starts re-seed from bundled JSON, then refresh from Redis). Memory waste = ~5 MB per lambda × 200 = **~1 GB cumulative across the fleet** — acceptable but worth noting.

---

## Part C — Scraper / Worker Load Characteristics

### C.1 Per-minute fire histogram (NEW finding — overrides prior docs)

Sub-agent C-CronLoad parsed all 62 `cron:` lines across 60 workflow files. **Result reveals `:00` is the real burst minute, not `:27` as previously documented.**

| Minute | # workflows firing | Notable |
|---|---|---|
| **:00** | **19** | audit-freshness, check-nitter, collect-funding, collect-twitter, cron-aiso-drain, cron-digest-weekly, cron-freshness-check, cron-mcp-usage-rotate, cron-pipeline-cleanup, cron-pipeline-rebuild, cron-predictions, cron-twitter-outbound, health-watch, refresh-skill-install-snapshot, run-shadow-scoring, scrape-devto, scrape-producthunt, sweep-staleness, uptime-monitor |
| **:30** | **8** | cron-aiso-drain + cron-freshness-check + cron-pipeline-persist + health-watch + promote-unknown-mentions + refresh-mcp-usage-snapshot + refresh-skill-smithery + uptime-monitor |
| **:17** | 6 | aiso-self-scan + refresh-collection-rankings + refresh-reddit-baselines + refresh-star-activity + scrape-bluesky + scrape-npm |
| **:15, :05, :13, :25, :35, :45, :47** | 3-4 each | various |
| **:55** | 3 | snapshot-consensus + snapshot-top10 + uptime-monitor |
| **:27** | 2 | scrape-trending + sync-trustmrr (previously flagged but **less burst than `:00` and `:30`**) |

**At `0 0 * * *` UTC midnight, ~13 workflows can collide simultaneously.** GitHub free tier = 20 concurrent jobs, so this leaves single-digit headroom. Pro = 60 jobs.

**Total cron fires/day correction:** sub-agent's parse of distinct workflow schedules yields **~850/day**, much lower than ENGINE.md's claim of 15,750/day. The ENGINE figure double-counts per-job runs or includes matrix expansions. Top contributors: `uptime-monitor` (288/day = `*/5`), `cron-freshness-check` (96/day = `*/15`), `scrape-trending` (72/day = 27,47,7).

### C.2 GitHub Actions concurrent jobs (live samples)

3 samples taken 30s apart against the live repo (sample window adjacent to busy `:30`):

| Sample timestamp | In-progress jobs | Distinct workflows |
|---|---|---|
| 2026-05-04 11:30:41 UTC | 0 | 0 |
| 2026-05-04 11:31:24 UTC | 0 | 0 |
| 2026-05-04 11:32:07 UTC | 0 | 0 |

GHA jobs finish faster than the 30s sampling cadence. **Not the bottleneck today, but the `0 0 * * *` UTC midnight `:00` burst with 13 workflows on the GitHub free tier (20 concurrent ceiling) leaves single-job headroom**. CI runs from push events would queue.

### C.3 Vercel concurrent execution (assumed Pro)

| Tier | Concurrent function ceiling | At 10k users (1 RPS active) | Gap |
|---|---|---|---|
| Hobby | 1,000 | 10,000 | -9,000 → instant throttle |
| **Pro (likely)** | 1,000–2,500 default; autoscale beyond | 10,000 | **-7,500 baseline; ~75% of requests hit autoscale lag or cold-start queue** |
| Enterprise | effectively unlimited | 10,000 | OK |

**P1 — Vercel tier confirmation needed.** `package.json` shows production at trendingrepo.com + Stripe configured ("not billed yet" per CLAUDE.md). Pro is most likely current tier. **Recommendation: operator confirm via Vercel dashboard before traffic ramp.**

### C.4 External API rate limit headroom at 10k users

| API | Pool ceiling | Cron baseline | Projected at 10k users | Headroom |
|---|---|---|---|---|
| **GitHub** | ~50k/hr (10-11 PATs × 5000/hr) | ~3-5k/hr collectors | If 10k users × 1 page/min × 1 GitHub call/page = **600k/hr** | **NEGATIVE — pool exhausts in ~6 min/hr** |
| OSS Insight | undocumented, single IP | 24/day | Same — already at request-time cache via ISR | Single-IP silent ban risk |
| Apify (Twitter) | quota-based, not rate-based | 8/day cron-only | Same (collector-only, never user-driven) | OK (cost ceiling, not rate ceiling) |
| Reddit OAuth (single app) | 60 req/min | scrape-trending 3×/hr + lobsters/hn separate | Same (collector-only) | OK |
| Bluesky (single bot) | undocumented | 24/day | Same | OK as long as collector-only |
| HuggingFace (single token) | undocumented | 16/day | Same | OK |
| ProductHunt (multi-key pool) | ~6,250 / 15-min per token | ~600/day | Same | Comfortable |
| DevTo (multi-key pool) | per-key | 4/day | Same | OK |

**P0 hardening required:** GitHub user-route fan-out must be cached at the edge (5-min TTL minimum). Today `/api/repos/[owner]/[name]` v=2 path is already data-store-backed (good); v=1 legacy + `/u/[handle]` direct API call + `/api/compare/github` 35× amplification are the leak points.

### C.5 Deploy storm — STILL HAPPENING, GETTING WORSE (P0 finding)

Sub-agent C-CronLoad ran `git log --since='30 days ago' --pretty=oneline main`:

| Window | Total commits to main | Data-churn commits (`chore(data):`, `auto-commit`, etc.) | Daily avg data-churn |
|---|---|---|---|
| Last 30 days | 2,087 | **1,206 (58%)** | **40/day** |
| Last 7 days | 1,226 | ~672 | **96/day** |

**The audit-2026-04-26 fix (commit `87e3f4e`, "Redis as source of truth") did NOT stop file-mirror commits.** The collectors still write to `data/*.json` files via `scripts/_data-store-write.mjs` AND commit them via the workflow runs. At 96 data commits/day = **96 Vercel builds/day** from data churn alone, 6× the audit-flagged baseline of 17.

**Cost impact:** wastes Vercel build minutes (Pro plan caps at 6000 min/month — 96 builds × ~3 min = 288 min/day = ~8,640 min/month, **44% over Pro cap**). Cost: 2640 min × $0.008/min = ~$21/month overage. More importantly: **race conditions** between cron-bot commits + GHA + parallel agents (per CLAUDE.md anti-pattern "Parallel-session merges silently steal staged work").

**Fix-forward:** modify `scripts/_data-store-write.mjs` to skip the file mirror when Redis write succeeds. Only commit on Redis-write failure (DR snapshot fallback). This is a 1-line change.

---

## Part D — Caching + CDN Posture

### D.1 Vercel Edge Network usage

Per A.1 measurements, 6 of 10 measured routes serve via Vercel ISR (`X-Nextjs-Stale-Time: 300`, `X-Vercel-Cache: STALE` or `HIT`). Remaining routes:
- `/compare` — no caching (`private, no-cache, no-store`)
- `/api/health`, `/api/health/sources`, `/api/health/cron-activity` — origin every request
- `/api/openapi.json` — 1h edge cache (excellent)

### D.2 Static asset delivery

**Image optimization gap (P0 from J-FrontendPerf):**

[src/components/ui/EntityLogo.tsx:68](../../src/components/ui/EntityLogo.tsx) renders raw `<img>` for **122 call sites across 46 files**. Domains include `unavatar.io`, `avatars.githubusercontent.com`, `pbs.twimg.com` — all already whitelisted in [next.config.ts:54-63 images.remotePatterns](../../next.config.ts). Single-file fix unblocks Vercel image optimization sitewide.

Other raw-`<img>` sites (less critical):
- [src/components/top10/Top10Page.tsx:1398](../../src/components/top10/Top10Page.tsx)
- [src/app/skills/page.tsx:617](../../src/app/skills/page.tsx)
- [src/components/leaderboards/WindowedRanking.tsx:92](../../src/components/leaderboards/WindowedRanking.tsx)

**OG image cache posture (P1):**

Two parallel OG systems exist. Route handlers under `/api/og/*/route.tsx` set proper `s-maxage=300, stale-while-revalidate=3600`. **8 of 12 `opengraph-image.tsx` metadata files are `force-dynamic` with NO Cache-Control:**
- [src/app/repo/[owner]/[name]/opengraph-image.tsx:20-21](../../src/app/repo/%5Bowner%5D/%5Bname%5D/opengraph-image.tsx)
- [src/app/u/[handle]/opengraph-image.tsx:21-22](../../src/app/u/%5Bhandle%5D/opengraph-image.tsx)
- `/breakouts`, `/compare`, `/collections/[slug]`, `/categories/[slug]`, `/ideas/[id]`, `/opengraph-image.tsx` (root)

Every Twitter/LinkedIn/Slack/Discord/Telegram crawler triggers a fresh `ImageResponse` render. At 10k user scale + viral repo shares, this hammers the lambda fleet and burns Vercel function invocations.

### D.3 API route caching

Inventory:
- `/api/repos/[owner]/[name]` — `s-maxage=30, swr=60` ✓
- `/api/openapi.json` — `s-maxage=3600, swr=86400` ✓
- `/api/health*` — origin every request (intentional — uptime monitor probes)
- `/api/og/*` (route handlers) — `s-maxage=300, swr=3600` ✓
- `/api/repos`, `/api/predict`, `/api/search`, `/api/compare/*` — no cache headers grep'd in agent E-SecretOutput's response shape table; relies on Next.js default. **GAP** at 10k users.

### D.4 ISR safety

Home page is ISR-cached at 30 min per CLAUDE.md; production headers show `X-Nextjs-Stale-Time: 300` (5 min). Discrepancy explained: the 30min is the `revalidate=1800` page export; the 300s `Stale-Time` is Next.js's edge stale-while-revalidate window.

**Risk:** A user landing on a stale ISR page sees old data with no inline indicator. `FreshBadge` (client poll) is the only signal — easy to miss on direct-link landings (G-FailureModes finding).

---

## Part E — Security Hardening

### E.1 Authentication hardening

- Cookie-based admin session per commit `e2a0908` ([src/lib/api/auth.ts](../../src/lib/api/auth.ts) — `verifyAdminAuth` + `verifyCronAuth`)
- Admin login: 5 req/60s per-IP rate limit ([admin/login/route.ts:37,68](../../src/app/api/admin/login/route.ts)) ✓
- HTTPS-only enforced via HSTS `max-age=63072000; includeSubDomains; preload` ✓
- SameSite + Secure flag on admin cookie: not directly verified in this audit; confirmed by header inspection of admin login response in a future probe

### E.2 API authorization

Every `/api/cron/*` route enforces `verifyCronAuth` (Bearer `CRON_SECRET`). Every `/api/admin/*` route enforces `verifyAdminAuth` (cookie or `ADMIN_TOKEN` Bearer). Verified by E-SecretOutput sub-agent across 16 cron + 13 admin routes.

**`/api/internal/*`** — token-gated via `INTERNAL_AGENT_TOKENS_JSON` principal pattern. Verified.

**Public unauth routes** (53 total per E-SecretOutput): listed in F.1 below.

### E.3 Input validation

**PASS — 0 fail mutating routes** (E-InputValid sub-agent audited all 45 POST/PUT/DELETE/PATCH handlers):
- 38 use `parseBody(req, ZodSchema)` from [src/lib/api/parse-body.ts](../../src/lib/api/parse-body.ts)
- 7 use bespoke typeof + regex + allow-list validation (functionally equivalent; a convention drift from "Zod on all API boundaries" but not a security gap): pipeline/* routes
- 1 intentionally uses raw body (Stripe webhook — HMAC requires unparsed bytes)

**Path traversal:** **0 candidates.** Every dynamic-segment route validates the slug via `SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/` before using it in any sink. The only fs interaction with slug-derived data is in [aiso/route.ts:158](../../src/app/api/repos/%5Bowner%5D/%5Bname%5D/aiso/route.ts) where the filename is a hard-coded constant.

**Query-param risk:** PASS. All `searchParams.get(...)` consumers either bound numeric params (`clampInt`), validate against allow-lists, or use the value only for keyed lookups that reject unknowns.

**Header trust risk (WARN):**
- `x-forwarded-for` is the rate-limit bucket key in [aiso/route.ts:104,109,124-132](../../src/app/api/repos/%5Bowner%5D/%5Bname%5D/aiso/route.ts) (in-memory `Map` — defeated by warm-Lambda rotation **and** XFF spoofing per request). And [src/lib/api/rate-limit.ts:48](../../src/lib/api/rate-limit.ts) — same XFF trust, but Vercel terminates at edge and sets/normalizes XFF (platform behavior), so risk only materializes if hosted behind a non-Vercel ingress.
- No route uses these headers for authentication/authorization decisions.

### E.4 Secret hygiene

Three sub-agents (E-SecretCode, E-SecretDocs, E-SecretOutput) scanned `.env.example`, `git log -p` (90 days, full multi-pattern grep done by orchestrator with shell access), `docs/**/*.md`, `data/**/*.json`, `tasks/**/*.md`, public route bodies, public API responses, and `/admin/keys` doc references.

**All three: PASS.**

| Scope | Verdict | Detail |
|---|---|---|
| `.env.example` | PASS | every value is a placeholder, empty, or commented-out illustrative URL. The `ghp_xxx` line has 28× literal `x` (zero entropy) — pattern-match but not a leak |
| Git history (90 days, full pattern) | PASS | only `ghp_` hit is the `0962f1c2` commit introducing `.env.example` placeholder. **0 lines** for `sk-ant-`, `sk_live_`, `apify_api_`, `xoxb-`, `AKIA`, `whsec_`, Sentry-DSN, fine-grained PAT |
| Source tree (`src/`, `scripts/`, `apps/`, `mcp/`) | PASS | only hit: `ghp_1234...MNOP` synthetic token in [src/lib/__tests__/github-token-pool.test.ts:363](../../src/lib/__tests__/github-token-pool.test.ts) — sequential-digit test fixture for `redactToken` helper |
| `docs/`, `data/`, `tasks/` | PASS | env-name + `=` flags hit only placeholder/runbook lines (`<paste token>`, `redis://...`). `/admin/keys` references describe route only — no rendered output, no key values |

**No rotation needed.** Opsec hygiene is exemplary across the documentation set.

### E.5 Dependency vulnerabilities

`npm audit --json` captured (exit 1 = vulnerabilities found, expected):

| Package | Severity | Range affected | Direct? | Notes |
|---|---|---|---|---|
| `@sentry/nextjs` | moderate | >=6.3.6 | direct | depends on next |
| `next` | moderate | 9.3.4-canary.0 - 16.3.0-canary.5 | direct | depends on postcss |
| `postcss` | moderate | (transitive) | indirect | |
| `esbuild` | moderate | <=0.24.2 | indirect (vite → vitest) | dev-only — `GHSA-67mh-4wv8-2f99` 5.3 CVSS, dev-server CSRF |
| `@vitest/mocker` | moderate | <=3.0.0-beta.4 | indirect | dev-only |

**Total: 5 moderate vulnerabilities. 0 high, 0 critical.** Production-affecting: only the next + postcss + @sentry/nextjs chain. Dev-only: esbuild + @vitest/mocker. Recommended fix per audit: `npm audit fix --force` triggers semver-major changes — defer until major-version upgrade window.

### E.6 Rate limiting

See Part F (dedicated section). **P0 gap.**

### E.7 Error message leakage

**11 unauth routes echo raw `err.message` into 500 responses** (E-SecretOutput finding):
- `funding/events`, `funding/sectors`, `openapi.json` (also `detail: err.message`), `pipeline/featured`, `pipeline/meta-counts`, `pipeline/refresh`, `pipeline/sidebar-data`, `pipeline/status`, `predict/calibration`, `submissions/revenue` (both methods)

Fix: route every unauth 500 through `serverError(err, { scope })` from [src/lib/api/error-response.ts:72-94](../../src/lib/api/error-response.ts), which already does scope-tagged logging + Sentry capture + generic public message. Lint guard at `scripts/check-error-envelope.mjs` could be extended to catch this pattern.

### E.8 Headers + CSP

Production curl `-I` against `/`:

| Header | Value | Verdict |
|---|---|---|
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` | **PASS** (2 years + preload) |
| X-Frame-Options | `DENY` | PASS |
| X-Content-Type-Options | `nosniff` | PASS |
| Referrer-Policy | `strict-origin-when-cross-origin` | PASS |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | PASS |
| **Content-Security-Policy** | (absent) | **GAP — P1** |

**No CSP** on any route inspected. At 10k users + a single XSS via user-submitted content (`/submit/revenue`, `/submit`, `/ideas`), there's no CSP to limit blast radius. Recommended: ship a starter CSP (`default-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com https://pbs.twimg.com ...; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.posthog.com https://*.sentry.io ...`) via `next.config.ts:async headers()`.

### E.9 Data exposure

**P1 — 4 unauth recon endpoints expose internal infra detail:**

| Endpoint | What it leaks | File:line |
|---|---|---|
| `/api/worker/health` | Full 38-slug Railway worker fleet topology incl. fetcher names, cadenceMin, blocking flags, status, ageSec | [worker/health/route.ts:60-229](../../src/app/api/worker/health/route.ts) |
| `/api/pipeline/status` | Full ScannerSourceHealth array + provider strings + notes[] + GitHub `rateLimitRemaining` + repo counts + freshness booleans + `repoMetadata.failureCount` | [pipeline/status/route.ts:102-241](../../src/app/api/pipeline/status/route.ts) |
| `/api/health/sources` | Per-source breaker view incl. `lastFailure: string` (truncated upstream message) | [health/sources/route.ts:38-144](../../src/app/api/health/sources/route.ts) |
| `/api/health/cron-activity` | Cron schedule + last-fired timestamps + fail counts | [health/cron-activity/route.ts:38-61](../../src/app/api/health/cron-activity/route.ts) |

Combined, these give an attacker:
- Real-time outage observation across all upstreams
- Workflow timing for synchronizing scraper-spoofing
- GitHub PAT pool quota burn-down visibility

`/api/health` (no `?detail=1`) correctly strips per-source/breaker info for unauth callers (APP-12 enforced) — the parallel pattern hasn't been applied to the four routes above.

**Minor exposures:**
- `/api/repos/[owner]/[name]/aiso` POST returns `queuePath: "<server-fs-path>"` — drop the field
- `/api/compare/share` POST is anonymous Redis writer with no rate limit (Redis namespace pollution risk; flagged separately in F)
- `/api/stream` SSE ready frame includes `subscribers: <count>` to anonymous

---

## Part F — Rate Limiting + Abuse

### F.1 Per-IP rate limiting

**`src/middleware.ts` does not exist** (verified via `Glob` — only `node_modules` matches). No global ingress limiter.

**Application-layer coverage: 6 of ~107 API routes** (per F-RateLimit sub-agent):

| Route | Method | Limit | Backend | Verdict |
|---|---|---|---|---|
| `/api/admin/login` | POST | 5/60s/IP | Upstash | PASS |
| `/api/twitter/leaderboard` | GET | 60/60s/IP | Upstash | PASS |
| `/api/twitter/repos/[owner]/[name]` | GET | 60/60s/IP | Upstash | PASS |
| `/api/tier-lists` | POST | 30/hour/IP | Upstash | PASS |
| `/api/pipeline/refresh` | POST | 1/60s/IP + 30s global cooldown | Upstash | PASS |
| `/api/repos/[owner]/[name]/aiso` | POST | 1/60s/IP | **module-local Map** | **PARTIAL — defeated by warm-Lambda rotation + XFF spoof** |

**Drift finding (CRITICAL — verified gap):** Commit `90ec33b5` advertises an admin/scan 10 req/min rate limit. Test at [src/app/api/admin/scan/__tests__/rate-limit.test.ts:62-95](../../src/app/api/admin/scan/__tests__/rate-limit.test.ts) primes the limiter and asserts 429. **The route handler at [src/app/api/admin/scan/route.ts:168-275](../../src/app/api/admin/scan/route.ts) contains no rate-limit code.** The test imports `_setStoreForTests` but the handler never reads from that store. Either reverted before commit or test is speculative. **Documented gap, not hypothesis.**

**Public unauth routes with NO rate limit (top scrapeable):** `/api/repos`, `/api/repos/[owner]/[name]`, `/api/repos/[owner]/[name]/{aiso,events,mentions,freshness}`, `/api/compare`, **`/api/compare/github`**, `/api/compare/payloads`, `/api/compare/share`, `/api/predict`, `/api/search`, `/api/categories`, `/api/skills`, `/api/collections`, `/api/agent-commerce/*` (5 routes), `/api/funding/*`, `/api/profile/[handle]`, `/api/scoring/*`, `/api/openapi.json`, `/api/oembed`, `/api/health*` (4 routes), `/api/predict/calibration`, `/api/pipeline/*` (8 routes), `/api/tools/revenue-estimate`, `/api/tier-lists/[shortId]`, `/api/tier-lists/templates/[slug]`, `/api/model-usage/*` (5 routes), `/api/repo-submissions`, `/api/submissions/revenue`, `/api/ideas`, `/api/ideas/[id]`, `/api/reactions` (GET).

**Total: ~50 public routes with zero rate limit.**

### F.2 Mutating-endpoint protection (CSRF + captcha)

**100% of mutating routes have NO captcha + NO CSRF.** Verified via grep across `src/`:
- `package.json` does not list Turnstile, hCaptcha, or reCAPTCHA
- No `csrf` middleware or token check anywhere
- The only `request.headers.get("origin")` reference in `src/app/api/checkout/stripe/route.ts:97` is for building return URLs, not validation

**Most exposed gaps:**

| Route | Risk |
|---|---|
| `/api/repo-submissions` POST | Anonymous, no captcha, triggers `runRepoIntakeForSubmission` → background GitHub fetch chain. Bot floodable. |
| `/api/submissions/revenue` POST | Anonymous, same shape. Floods moderation queue + GitHub PAT pool. |
| `/api/compare/share` POST | Anonymous Redis writer, no rate limit. Attacker can fill `compare-share/*` keyspace (B.2 finding compounds: noeviction means writes will eventually fail). |
| `/api/checkout/stripe` POST | Auth-gated but no rate limit on Stripe checkout-session creation. |
| `/api/ideas`, `/api/reactions` POST | User-auth gated but no per-user/IP throttle. |

The only POST endpoint that survives a CSRF attack today: `/api/webhooks/stripe` (Stripe HMAC). All cron routes (CRON_SECRET Bearer) are server-to-server.

### F.3 Read-endpoint scraper protection

**Zero User-Agent filtering anywhere** in `src/app/api/**`. No public-API tier with auth + quotas. `/api/openapi.json` advertises every public route, so anyone with the spec URL can bulk-scrape.

### F.4 Resource exhaustion / amplification

**P0 — `/api/compare/github`**: 35× GitHub REST per request (max_repos=5 × 7+ calls per bundle: repo, languages, contributors, commit_activity, releases, issues, pulls — see [github-compare.ts:13-15,603-618](../../src/lib/github-compare.ts)). At a single attacker IP at 10 RPS = **350 GitHub calls/sec**. Pool ceiling = 11 PATs × 5000/hr = ~15.3 calls/sec sustained per PAT, 168 calls/sec across pool sustained. **Pool exhausted in <2 minutes.** Edge cache trivially defeated by `?repos=` permutation.

**P0 — `/api/repos/[owner]/[name]/aiso` POST**: Kicks an 80s LLM consensus job (per CLAUDE.md anti-patterns: K2.6 ~80s/call). Per-IP limiter is module-local Map only — defeated by warm-Lambda rotation. AISO LLM cost is the most expensive upstream we have.

**P1 — `/api/repo-submissions` POST + `/api/submissions/revenue` POST**: Anonymous, no captcha, triggers background GitHub intake.

**P2 — `/api/compare`**: 5× canonical profile builds per request (data-store-backed, less impact than `/api/compare/github` but still unbounded).

**P2 — `/api/openapi.json`**: JSON.stringify of full spec on every request (module-cached spec, but stringify is O(spec-size)). 1h edge cache mitigates well.

---

## Part G — Failure Modes + Graceful Degradation

### G.1 Per-API kill matrix (18 sources)

Sub-agent G-FailureModes traced read paths for all 18 external dependencies. Summary (full table in evidence appendix):

| Source | Routes affected | Fallback | UX impact when down | Circuit breaker |
|---|---|---|---|---|
| **OSS Insight** (#2 SPOF, no key) | 11+ surfaces | Redis → bundled JSON (deploy-time old) | **WORST silent-fail** — home keeps rendering stale repos with no per-row indicator | NO |
| **GitHub** | `/compare`, `/repo/*/star-activity`, `/u/[handle]`, internal backfill | Pool exhaustion throws to caller; cached pages keep rendering | `/compare` returns 500; cached pages silently stale | YES — 5-fail OPEN, 60s cooldown, +pool-level 24h quarantine |
| **Apify** (Twitter SPOF) | `/twitter`, repo profile twitter panel | Apify → Nitter cascade ([twitter-fallback.ts:26-107](../../src/lib/pool/twitter-fallback.ts)) | Stale data with no indicator if both fail | Apify: no; Nitter: per-instance dead/healthy (never resurrects within process) |
| **Reddit** | `/reddit/trending`, `/signals`, breakouts | OAuth → public JSON degrade ([source-health.ts:228-235](../../src/lib/source-health.ts)) | Stale page; degradation note only on `/admin/staleness` | YES |
| **Bluesky, DevTo, HuggingFace, NPM, ArXiv, Lobsters** | per-source pages | Redis → bundled JSON | Empty state on cold; stale otherwise | partial (only Bluesky/DevTo/Lobsters tracked) |
| **ProductHunt** | `/producthunt`, repo profile PH synth | Redis → bundled JSON | Empty state | NO |
| **Sentry, PostHog, Resend** | observability/email | Best-effort no-op | None visible to user — but operator MTTD breaks | N/A |
| **Smithery, PulseMCP, Libraries.io** | `/mcp`, `/skills` | Redis → bundled JSON | Empty/stale; FreshnessBadge present | NO |
| **Trustmrr, Firecrawl** | `/revenue`, `/funding` | Redis → bundled JSON | Stale | NO |

**Coverage gap:** only 9 of 18 upstreams have a circuit breaker. The other 9 rely on workflow alarm (1h granularity) + data-store fall-through.

### G.2 Redis full / eviction behavior

Per B.1: `maxmemory:0`, `noeviction`. When OS memory limit hit:
- **Writes fail with OOM** → `data-store.ts:290-292` swallows error, falls through to file/memory tier
- **Eviction is invisible to the application** — no UX signal
- **Worst case (truth-skew bug):** `parsePayload` returns the payload but `parseWrittenAt` returns null when meta-key missing → `ageMs:0`, `fresh:true` returned for stale payload. No code defends against this race ([data-store.ts:268-289](../../src/lib/data-store.ts))

### G.3 scrape-trending cascade

Single SPOF backing 11+ routes ([SITE-WIREMAP §5](../SITE-WIREMAP.md)):

| Surface | When stale | Indicator |
|---|---|---|
| `/` | Cards render, `LiveTopTable` rows show no age | Optional `FreshBadge` (client poll, layout) |
| `/breakouts` | Breakouts computed against stale baselines → false breakouts | FreshnessBadge |
| `/repo/*` | 24h delta + momentum stale | FreshnessBadge |
| `/predict` | LLM run depends on stale base | FreshnessBadge |
| `/u/[handle]`, `/search`, `/agent-repos`, `/mindshare` | All stale silently | varies |

**Key UX gap:** there is exactly ONE freshness pill in the layout. No per-row freshness indicator on the home table or repo metric cards. A user reading "+1.2k stars 24h" with no age annotation cannot tell if it's live or 8h stale.

`HomeEmptyState.tsx:43` claims "scraper runs every 20 min" — misleading copy (real cadence is 27/47/7 min triple = 3×/h).

### G.4 Cold-start storms

| Aspect | Time/Behavior |
|---|---|
| ioredis `connectTimeout` | 5,000 ms |
| ioredis `commandTimeout` | 30,000 ms |
| Worst-case first read | 5s connect + 30s command = **35s blocking** before fall-through to file |
| `enableOfflineQueue: true` | commands buffer during connect (correctness over fail-fast) |
| Bundled JSON cold-start without Redis | Works — `data-store.ts:541-548` returns `DefaultDataStore` with `redis: null`, reads skip tier-1 |
| Warm-up hook | None |
| 50 cold lambdas storm | ~50 simultaneous TCP handshakes hit Railway Redis. Throttling possible. |
| Module-init top-level work | `import "../../data/*.json"` × 30 files = several MB of JSON parsed at every lambda boot |

### G.5 Recovery + alerting paths

| Trigger | Channel | MTTD | MTTA |
|---|---|---|---|
| GitHub PAT pool exhaustion | Sentry (DSN MISSING in prod → no-op today) | ∞ until DSN set | manual |
| Twitter all-sources-failed | `OPS_ALERT_WEBHOOK` Discord/Slack + Sentry warning fallback | seconds-to-minutes if webhook set | manual |
| `/api/health?soft=1` non-ok | `cron-freshness-check.yml` posts state-change to OPS_ALERT_WEBHOOK every 15 min | ≤15 min on transitions; **doesn't re-fire on persistent stale** | manual |
| Source freshness budget breach | `audit-freshness.yml` hourly + `health-watch.yml` */30 | ≤30-60 min | manual |
| Public-host outage | `uptime-monitor.yml` */5 → PostHog ping + GH Actions email | ≤5 min | manual (no PagerDuty/SMS) |
| Stripe webhook signature failure | `console.warn` only — NOT in Sentry | does not detect | does not ack |
| PagerDuty / Opsgenie / on-call | None in repo. No phone/SMS escalation. |

**MTTD best case: 5 min (uptime-monitor). MTTD worst case: 12h (Apify Twitter budget). MTTD if Sentry down + webhook unset: ∞.**

**No runbook found** for "scrape-trending stuck" / "Redis OOM" / "GitHub pool exhausted" scenarios.

---

## Part H — Observability Under Load

### H.1 Sentry surface

| File | Purpose | Sample rate |
|---|---|---|
| [sentry.server.config.ts:6-31](../../sentry.server.config.ts) | Server runtime; gated on `SENTRY_DSN ?? NEXT_PUBLIC_SENTRY_DSN` | tracesSampleRate: 0.1 prod / 0 dev; profilesSampleRate: 0; beforeSend fingerprints transient network errors |
| [sentry.edge.config.ts:5-19](../../sentry.edge.config.ts) | Edge runtime | 0.1 / 0 |
| [instrumentation-client.ts:1-57](../../instrumentation-client.ts) | Browser; replay-on-error gated by `NEXT_PUBLIC_SENTRY_REPLAY=true`; ignores ResizeObserver/AbortError/chunk-load | 0.1 / 0; `replaysSessionSampleRate: 0` |
| [src/instrumentation.ts:1-21](../../src/instrumentation.ts) | `register()` + `onRequestError = Sentry.captureRequestError`; logs missing DSN to stderr |
| [next.config.ts:195-218](../../next.config.ts) | `withSentryConfig` wrap; `tunnelRoute: /api/_sentry-tunnel` (ad-blocker bypass); only applied when NODE_ENV=production |
| Worker: [apps/trendingrepo-worker/src/lib/sentry.ts:6-33](../../apps/trendingrepo-worker/src/lib/sentry.ts) | `@sentry/node`, tracesSampleRate: 0.05 — **DSN configured on Railway** |

**Capture call inventory:** 25 hand-instrumented sites + 81 RSC error-boundary captures + 16 OG-route captures. Categories that DO flow to Sentry: pool exhaustion, pool 401, low quota, GitHub 5xx, Twitter all-failed, social adapter failures, pipeline-side GitHub failures, admin auth flow, admin canary, Sprint-1 sentry-canary.

**P0 — `SENTRY_DSN` MISSING on Vercel production.** All 122 capture sites are dead-letters today. Worker (Railway) has DSN.

### H.1 Coverage gaps

- 191 `console.error`/`console.warn` calls vs. 25 real Sentry captures = **7.6:1 silent ratio**
- Stripe webhook failures only `console.warn`/`console.error` — no Sentry. Revenue-critical.
- Cron handlers for digest, mcp/rotate-usage, llm/sync-models, llm/aggregate, news-auto-recover, aiso-drain — `console.error` only
- Client-side errors below the React tree (WatchlistManager, AlertConfig, CompareClient, BrowserAlertBridge) — `console.error` without Sentry capture
- 38-class `EngineError` hierarchy — most classes are constructed but never feed a capture site

### H.2 PostHog surface

| File | Event | Detail |
|---|---|---|
| [src/lib/analytics/posthog.ts:46-62](../../src/lib/analytics/posthog.ts) | helper | `posthog-node` SDK, host `https://eu.i.posthog.com`, batches 20 events / 10s |
| [src/lib/github-fetch.ts:324](../../src/lib/github-fetch.ts) | `github_api_call` | per GitHub API call from pool-aware fetch path |
| [src/lib/pipeline/adapters/github-adapter.ts:364](../../src/lib/pipeline/adapters/github-adapter.ts) | `github_api_call` | pipeline-side mirror |
| [src/components/providers/PostHogProvider.tsx:13-29](../../src/components/providers/PostHogProvider.tsx) | client init | host **defaults to `us.i.posthog.com`** — server is EU, client default is US (drift) |
| [.github/workflows/uptime-monitor.yml:73-91](../../.github/workflows/uptime-monitor.yml) | `uptime_check` | cron `*/5` against 4 hosts |

**Coverage gaps:**
- ONE server-side event type (`github_api_call`); zero events for Reddit/HN/Bluesky/Twitter/HuggingFace/etc.
- No `pipeline_run`, `cron_completed`, `freshness_gate_failed`, `data_store_write` captures
- Server EU vs client US host inconsistency unless `NEXT_PUBLIC_POSTHOG_HOST` is set in deploy env

### H.3 Logs

| Aspect | Finding |
|---|---|
| Stack | Next side: 191 `console.*` (unstructured). Worker: pino → stdout |
| Vercel tier retention | hobby=1h, pro=1d, enterprise=3d. Repo doesn't declare tier. Pro implied by HTTPS + project size — ~24h log wall |
| Aggregator | Zero `datadog\|logtail\|loki\|axiom` hits in `src/`. Worker pino → Railway log retention (default 30d Pro) |
| Structured logging | None on Next. No request ID / trace ID / correlation ID propagation |

### H.4 Tracing

| Tool/mechanism | Coverage |
|---|---|
| `@opentelemetry/*` direct usage | None in `src/` or worker |
| `Sentry.startSpan` | **Zero call sites.** Only auto-created spans from `tracesSampleRate: 0.1` |
| `performance.now()` ad-hoc | 4 sites (sidebar-data, /api/health/sources, /api/pipeline/sidebar-data, StatsBarClient) — log to console only |
| `PERF_TRACE_ROUTES=1` flag | Honored in 2 routes; logs to console, not exported |
| Distributed tracer | None. Trace headers not propagated worker ↔ Next |
| `@vercel/analytics` | Not installed |

### H.5 Dashboards

8 admin dashboards exist (`/admin/keys`, `/admin/staleness`, `/admin/pool-aggregate`, `/admin/pool`, `/admin/scoring-shadow`, `/admin/unknown-mentions`, `/admin/ideas-queue`, `/admin/revenue-queue`). All snapshot-on-load. **No real-time RPS dashboard. No error-rate timeseries. No request waterfall.**

### H.6 Alerting paths

OPS_ALERT_WEBHOOK used by twitter-fallback, cron-freshness-check, and github-fetch. If unset, twitter-fallback emits `OpsAlertFatalError` warning to Sentry — silent-fail is detected.

**No PagerDuty / Opsgenie / SMS escalation.** Email + Discord webhook is too quiet at 10k users for active incidents.

---

## Part I — Cost + Quota Ceilings

Sub-agent I-CostProjection computed monthly cost at 10k SUSTAINED concurrent users (250M page-views/day) and at 1k concurrent (realistic launch). Methodology: state every assumption with arithmetic, public 2025 pricing, current code+cron evidence.

### I.1 — Vercel (the dominant cost line)

**ISR amortization is the load-bearing assumption.** 56 ISR routes × ~600s avg revalidate = ~5.6 lambda invocations/min from page renders, irrespective of user count. The static HTML then serves from Vercel's edge CDN (counted as bandwidth, NOT compute).

| Metric | At 10k sustained | Pro tier included | Overage |
|---|---|---|---|
| Page-render lambda invocations | ~250k/month (ISR-bounded) | 1M | $0 |
| API route invocations | ~750M/month (10% of page-views) | 1M | 749M × $0.60/M = **$449** |
| **Bandwidth (worst case 4.18 MB `/reddit/trending` 5% of traffic uncached)** | **1.57 PB/month** | 1 TB | **$235K/month** |
| Bandwidth (avg 100 KB ISR HTML) | ~750 TB/month | 1 TB | 749 TB × $0.15/GB = **$112,350** |
| Bandwidth (1k concurrent realistic launch) | ~75 TB/month | 1 TB | **$11,100** |
| Build minutes | ~6,000 min/month | 6,000 | $0 (but see C.5 — data-churn commits add ~8,640/month, 44% over Pro cap) |
| **Vercel monthly @ 10k sustained** | | | **~$112,800** |
| **Vercel monthly @ 1k concurrent** | | | **~$11,500** |

> **The `/reddit/trending` 4.18 MB HTML is a cost time-bomb.** 5% uncached traffic = $235K/month bandwidth alone. CDN cache hit ratio is the only thing standing between this app and bankruptcy at scale. Ship D.2 fixes BEFORE traffic ramp.
>
> **Enterprise tier is mandatory above ~5k concurrent users.** Self-serve Pro overage rates ($0.15/GB) are 3-5× Enterprise committed-spend rates.

### I.2 — GitHub Actions

`git remote get-url origin` → repo is **PUBLIC**. Public repos = unlimited free GHA minutes.

| Metric | Value | Cost |
|---|---|---|
| Cron fires/day | ~850/day (per C.1 correction) | $0 |
| **GitHub Actions monthly** | | **$0** |

> **If repo is ever flipped private:** ~850 fires/day × ~3 min avg × 30 days × $0.008/min = **~$612/month** (private-repo overage past 2,000 free min). Don't flip private without budgeting.

### I.3 — Redis (Railway)

Live probe: 75 MB used, peak 209 MB, 4,717 keys, **`maxmemory:0` + `noeviction`**, ~2 ops/sec steady-state.

| Metric | Current | At 10k users | Cost |
|---|---|---|---|
| Memory | 75 MB / peak 209 MB | ~300 MB (cron-bound, not user-bound) | $3 |
| Compute hours | 720/month | 720/month | ~$5-10 |
| Egress @ 250 ops/sec × 1 KB avg payload × 30 days | n/a | ~650 GB/month | 650 × $0.50/GB = ~$325 |
| **Railway Redis monthly** | ~$15 today | | **~$340/month @ 10k users** |

> Counter-factual: if hosted on Upstash REST instead, 250 ops/sec = 21.6M commands/day → 648M/month × $0.20/100k = **$1,296/month**. Railway is ~4× cheaper for this workload.

### I.4 — Apify (Twitter scraper)

**Cron-driven, NOT user-triggered.** Cost is independent of user count.

Cron: `0 */3 * * *` = 8 runs/day. 25 repos × 4 queries/repo per run.

| Metric | Per-month | Cost |
|---|---|---|
| Query-jobs | 24,000/month | — |
| If 200 tweets/query (ENGINE.md assumption × 8 daily runs) | 4.8M tweets | **$1,440** at $0.30/1K |
| If ENGINE.md's stated $180/month is right (implies ~25 tweets/query average) | 600k tweets | **$180** |

> **Discrepancy flagged:** ENGINE.md states $180/month but its own arithmetic (25×4×200 daily) doesn't account for 8 daily runs. Either (a) effective tweets/query is far below 200, (b) the $6/day figure assumed 1 daily run not 8, or (c) actor under-fetches in practice. **UNKNOWN — operator must verify in Apify console.**

### I.5 — Sentry

**Today: SENTRY_DSN MISSING in Vercel prod = 0 events flowing.** Sample rate `tracesSampleRate: 0.1` configured.

| Scenario | Errors/month | Tier | Cost |
|---|---|---|---|
| Healthy (0.1% error rate) | 1,500 | Team (50k included) | $26 |
| Degraded (1%) | 15,000 | Team | $26 |
| Incident (5%) | 75,000 | Business | $80 |
| Outage (10%) | 150,000 | Business + overage | ~$130 |

**Performance traces would crush Team tier at 10k users.** 7.5B page-views × 0.1 sample × ~3 spans = 2.25B spans/month. **Drop `tracesSampleRate` to 0.001 (0.1%) before scaling.**

### I.6 — Other line items

| Service | Today | At 10k users | Notes |
|---|---|---|---|
| Resend (digest email) | UNKNOWN | $20-100 | Free 100/day → Pro $20 for 50k/month |
| Trustmrr API | UNKNOWN | UNKNOWN | Cron-driven, not user-scaled |
| PostHog | $0 (silent no-op today) | **$1,860/month if naively wired** at 7.5B events × $0.000248 (after 1M free) | Wire with sampling or it bankrupts |
| Worker (Railway) | $5-20 | $20-50 | Cron-driven |
| Domain + DNS | ~$5 | ~$5 | |

### I.6 — TOTAL MONTHLY (rolled up)

| Service | Today | At 10k SUSTAINED | At 1k concurrent (realistic) |
|---|---|---|---|
| **Vercel** | $20 | **$112,800** | **$11,500** |
| GitHub Actions | $0 | $0 | $0 |
| Redis (Railway) | $15 | $340 | $50 |
| Apify | $180-1,440 | $180-1,440 | $180-1,440 |
| Sentry | $0 (DSN missing) | $80-130 | $26 |
| Worker (Railway) | $20 | $50 | $30 |
| Resend / PostHog / misc | ~$25 (UNKNOWN) | ~$2,000 (PostHog naive) | ~$50 |
| **TOTAL** | **~$240-1,500/month** | **~$115,500/month** | **~$11,800/month** |

### Cost cliffs (in order of escalation)

1. **Vercel bandwidth** — Pro 1 TB blown at ~50k page-views/day with 500 KB avg payload. The 4.18 MB `/reddit/trending` makes this a 10× faster cliff. **Burns at ~1k concurrent users.**
2. **Vercel function invocations** — 1M Pro included → blown at ~30k/day API calls. Burns at ~3k concurrent users.
3. **PostHog (if wired)** — 1M events free → blown immediately. Burns at ~300 concurrent users on per-pageview events.
4. **Sentry tier** — Team 50k errors fine at 5% rate; jumps to Business during incident.
5. **Apify** — flat ceiling, doesn't scale with users.
6. **Redis** — egress is the driver, comfortable up to ~50k concurrent.
7. **GitHub Actions** — never (public repo).

---

## Part J — Frontend Performance

### J.1 Heaviest client islands (per J-FrontendPerf)

Top 5 by LOC × heavy imports:

| File | LOC | Heavy imports | On home? |
|---|---|---|---|
| [Top10Page.tsx](../../src/components/top10/Top10Page.tsx) | 1660 | lucide-react | no |
| [AdminDashboard.tsx](../../src/components/admin/AdminDashboard.tsx) | 1052 | lucide-react | no (admin) |
| [SubredditMindshareCanvas.tsx](../../src/components/reddit-trending/SubredditMindshareCanvas.tsx) | 876 | **framer-motion** | no (`/reddit/trending`) |
| [AllTrendingTabs.tsx](../../src/components/reddit-trending/AllTrendingTabs.tsx) | 865 | **framer-motion** | no |
| [SidebarContent.tsx](../../src/components/layout/SidebarContent.tsx) | 686 | lucide-react | **YES — root layout** |
| [LiveTopTable.tsx](../../src/components/home/LiveTopTable.tsx) | 547 | lucide-react, **zustand** | **YES — `/`** |

**Layout-inherited islands** (every route ships these): `Header`, `Sidebar`, `MobileDrawerLazy` (dynamic, ssr:false), `MobileNav`, `BrowserAlertBridge`, `ToasterLazy` (dynamic), 4 providers (DesignSystem, Theme, PostHog, Store). 7+ client islands before the page adds anything.

### J.2 Heavy dependency map

| Package | Files | RSC vs client | Home direct? |
|---|---|---|---|
| `recharts` | 4 sites | client | NO (inline SVG used on home; all 4 production usages dynamic-imported — exemplary) |
| `framer-motion` | 6 sites | client | indirect via mobile drawer (dynamic). Reddit-trending has 4 modules statically imported |
| `zustand` | 2 stores | client | YES (LiveTopTable uses useCompareStore + useWatchlistStore — full persist boot on home critical path) |
| `@radix-ui/*`, `react-grid-layout`, `react-window` | none | n/a | no |

`next.config.ts:43-44` has `optimizePackageImports: ["lucide-react", "recharts"]`. framer-motion intentionally excluded per documented Next 15 RSC chunk-graph bug.

### J.3 Image optimization

**P0 — `EntityLogo` (122 sites) bypasses `next/image`** ([src/components/ui/EntityLogo.tsx:68](../../src/components/ui/EntityLogo.tsx)). Single-file fix.

Other `<img>` tags: `Top10Page.tsx:1398`, `app/skills/page.tsx:617`, `WindowedRanking.tsx:92`. ImageResponse contexts (correct exception): `api/og/tier-list/route.tsx:407`.

`next.config.ts:54-63` whitelist already includes `unavatar.io`, `avatars.githubusercontent.com`, `pbs.twimg.com`, `ph-files.imgix.net`, `opengraph.githubassets.com`.

### J.4 Code-splitting + Suspense

`next/dynamic` used at 4 sites — the right ones:
- RepoDetailChartLazy (Recharts)
- MobileDrawerLazy (framer-motion)
- ToasterLazy (sonner)
- CompareChart inside CompareClient (Recharts)

`<Suspense>` at page-level only on 5 of 78 pages: `signals`, `reddit/trending`, `search`, `reddit`, `admin/login`. Most pages render synchronously — every cold-cache miss blocks TTFB for the whole page.

### J.5 Font loading

[src/app/layout.tsx:9](../../src/app/layout.tsx) loads Geist, Geist_Mono, Space_Grotesk from `next/font/google`. All three: `display: "swap"`, `subsets: ["latin"]`. Space_Grotesk weights pruned to 400/600/700. **PASS — no FOIT, no oversized weight matrix.**

### J.6 LCP / above-fold priority

The only `priority` annotation is on the 18px brand mark in `Header.tsx:32` — **not** the LCP element. Candidate LCP elements (profile banners on `/u/[handle]`, repo headers on `/repo/*`, first repo logo on `/`) ship `<img loading="lazy">` (`EntityLogo.tsx:74`) which actively defers them.

### J.7 OG image cache

8 of 12 `opengraph-image.tsx` are `force-dynamic` with no Cache-Control (D.2 finding).

### Estimated First-Load JS (sub-agent J-FrontendPerf)

- `/` — **~280-340 KB gzip** (mobile budget for sub-3s LCP on 4G ≈ 170 KB) — gap **~110-170 KB**
- `/reddit/trending` — **~440-520 KB gzip** — gap **~270-350 KB** (consistent with the measured 4.18 MB HTML response)
- `/repo/[owner]/[name]` — **~220-260 KB gzip** — gap **~50-90 KB** (chart correctly split)

### Lighthouse measurements

Lighthouse JSON capture failed twice during the audit window (form-factor flag mismatch on first attempt; pipe close on second; third attempt with `--preset=desktop` running at audit-write time, results UNKNOWN if not appended below). TTFB/p95 measurements in A.1 are the authoritative real-user latency numbers for this audit.

---

## Part K — Recommendations (Ranked)

### K.1 P0 — BLOCKERS for 10k users

| # | Issue | Impact at 10k | Fix | Effort | Owner | Risk if not addressed |
|---|---|---|---|---|---|---|
| 1 | **`/reddit/trending` 4.18 MB HTML payload — Vercel bandwidth cost bomb** | 5% uncached traffic = 1.57 PB/month = **$235K/month** in bandwidth overage on Vercel Pro | Investigate the bloat (likely full `reddit-all-posts.json` inlined in HTML); strip non-essential rows; ensure `Cache-Control: s-maxage=600, swr=86400`; gzip; consider client-side pagination | 1-2d | Frontend + Backend | Bankruptcy at scale |
| 2 | **No global rate limiting** — no `src/middleware.ts`; ~50 public routes unthrottled | Single attacker IP at 10 RPS → can drain GitHub pool, fill Redis namespace, flood submission queues | Add `src/middleware.ts` with Upstash-backed per-IP global limiter (e.g., 60 req/min default; per-route overrides); bypass for cron+admin paths | 1d | Backend | Trivial DoS by any motivated actor |
| 3 | **`/api/compare/github` 35× GitHub amplification** | 10 RPS attacker = 350 GitHub calls/sec → pool exhausted in <2 min | Add per-IP rate limit (10 req/5min) + reject `?repos=` permutations on cache miss + serve from `/api/compare/payloads` data-store cache instead of live GitHub | 1d | Backend | Pool exhaustion → `/compare` 500s, every cached repo page silently stales |
| 4 | **Sentry DSN missing on Vercel prod** | 0 errors captured today; MTTD = ∞ | Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` on Vercel prod env; verify canary at `/api/_internal/sentry-canary`; drop `tracesSampleRate` to 0.001 to avoid Team-tier crush | 30 min ops | Platform | Operator goes blind during 10k traffic |
| 5 | **Redis `noeviction` + 81% no-TTL = unbounded growth** | Memory fills → writes fail silently → page falls to deploy-time bundled JSON | Set `maxmemory 512mb` + `maxmemory-policy: allkeys-lru` on Railway Redis. Add TTL to long-tail keys (star-activity, mention sidecars). Document per-key-prefix TTL convention. | 1d | Platform + Backend | Site silently serves stale data without operator detection |
| 6 | **Deploy storm worsening — 96 data-churn commits/day in last 7 days** | 96 Vercel builds/day from data churn = 8,640 build-min/month (44% over Pro 6,000-min cap = ~$21/mo waste); parallel-merge conflicts + race conditions per CLAUDE.md | Modify `scripts/_data-store-write.mjs` to skip the file mirror when Redis write succeeds; only commit on Redis-write failure (DR snapshot fallback). 1-line change. | 1h | Backend | Redis-as-truth promise broken; deploy noise; Pro tier cost overrun |
| 7 | **Anonymous bot-floodable submissions** — `/api/repo-submissions`, `/api/submissions/revenue`, `/api/compare/share` POSTs are anon, no captcha, no rate limit | At 10k users, bot can flood mod queue + Redis namespace + GitHub PAT pool | Add Cloudflare Turnstile (free) + per-IP rate limit (10 req/hour); migrate `/api/compare/share` to share the existing `tier-lists` 30/h limit | 1d | Backend | Garbage submissions overwhelm operator |
| 8 | **EntityLogo bypasses `next/image`** — 122 call sites, every feed page | Mobile Lighthouse score plateau; bandwidth cost amplification (compounds K.1 #1) | Migrate `EntityLogo` to `next/image` (single-file fix; remotePatterns already whitelisted) | 1h | Frontend | Mobile perf gap, Vercel bandwidth bill |
| 9 | **`/api/repos/[owner]/[name]/aiso` POST** — module-local rate-limit defeated by warm-Lambda rotation | At 10k users, attacker can spawn unbounded 80s LLM jobs → Kimi K2.6 cost explosion | Migrate to Upstash-backed `checkRateLimitAsync` like the 5 routes that already use it | 2h | Backend | LLM cost runaway |

### K.2 P1 — HIGH priority (next sprint)

| # | Issue | File:line | Fix | Effort |
|---|---|---|---|---|
| 1 | npm build fails on current branch (type error in cron/freshness/state route) | [route.ts:12](../../src/app/api/cron/freshness/state/route.ts) | Move `__setInspectSourceForTests` to `globalThis[Symbol.for(...)]` per openapi.json/route.ts pattern | 30 min |
| 2 | 4 unauth recon endpoints leak infra (`/api/worker/health`, `/api/pipeline/status`, `/api/health/sources`, `/api/health/cron-activity`) | (4 routes) | Apply APP-12 pattern from `/api/health` — strip detail for unauth callers | 1d |
| 3 | 11 unauth routes echo raw `err.message` in 500 bodies | (11 routes per E.7) | Route every unauth 500 through `serverError(err, {scope})` from `src/lib/api/error-response.ts`; extend lint guard | 1d |
| 4 | admin/scan rate-limit code missing (drift from commit 90ec33b5) | [admin/scan/route.ts:168-275](../../src/app/api/admin/scan/route.ts) | Either revert the test or actually wire `checkRateLimitAsync` into the handler | 30 min |
| 5 | OG `opengraph-image.tsx` files force-dynamic, no cache | 8 routes per D.2 | Add `headers: {"cache-control": "public, s-maxage=300, stale-while-revalidate=3600"}` to every `ImageResponse` return | 1h |
| 6 | `/repo/[owner]/[name]` — 4 sequential awaits, p95 1.5s | [page.tsx:161-214](../../src/app/repo/%5Bowner%5D/%5Bname%5D/page.tsx) | Parallelize `buildCanonicalRepoProfile` and `listReactionsForObject` via Promise.all | 2h |
| 7 | `/ideas` page — unbounded N+1 reactions fan-out | [page.tsx:95-105](../../src/app/ideas/page.tsx) | Postgres GROUP BY cutover (already on backlog) OR materialize reaction counts into idea record | 2-5d |
| 8 | `/agent-commerce/facilitator/[name]` — `fs.readFileSync` in RSC body | [page.tsx:96,97](../../src/app/agent-commerce/facilitator/%5Bname%5D/page.tsx) | Migrate to data-store; remove `fs` syscall from request path | 4h |
| 9 | `Stripe webhook failures only console.warn` — no Sentry | [webhooks/stripe/route.ts:96,146](../../src/app/api/webhooks/stripe/route.ts) | Wrap in `Sentry.captureException` with `tag: stripe-webhook` | 1h |
| 10 | No CSP header anywhere | next.config.ts | Ship a starter CSP via `next.config.ts:async headers()` with SaaS allow-list (PostHog, Sentry, Vercel) | 1d |
| 11 | OSS Insight #2 SPOF | (architectural) | Document failover to second provider OR ship a cached Redis snapshot with longer TTL during outage | 1-2d (snapshot) |
| 12 | No real-time RPS / error-rate dashboard | (architectural) | Install `@vercel/analytics` + `<SpeedInsights />` (free on Pro); add `/admin/observability` page reading Sentry + PostHog public APIs | 1d |
| 13 | **`:00` minute is the real cron burst (19 workflows) — overrides prior `:27` claim** | At UTC midnight `0 0 * * *`, ~13 workflows can collide; GitHub free tier (20 concurrent) leaves single-job headroom; Pro is fine | Stagger the most non-critical `:00` workflows to `:03/:08/:13` etc. The hottest collisions: `audit-freshness + cron-aiso-drain + cron-pipeline-cleanup + scrape-devto + scrape-producthunt + sweep-staleness` could move to `:08/:12/:18/:22/:32/:38`. Update `docs/forensic/08-CRON-OVERLAP-DUPLICATE-MAP-2026-05-04.md` — the `:27` headline is stale. | 1d | Platform |

### K.3 P2 — MEDIUM priority (30 days post-traffic)

1. `/u/[handle]` — direct GitHub API call from RSC body (24h ISR mitigates but per-region cache fragmentation bleeds pool). Wrap in `refreshGithubUserProfileFromStore(handle)` with 24h TTL.
2. Per-row freshness indicator on `/`, `/repo/*`, `/breakouts` — read `data.source` + `data.fresh` from data-store and surface "Updated 8h ago" inline (G.3 silent-fail finding).
3. Redis meta-key vs payload-key eviction race — defend against `ageMs:0, fresh:true` skew when meta missing (G.2 finding).
4. PostHog client/server host inconsistency — set `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com` in Vercel env.
5. `Sentry.startSpan` instrumentation on 6 hot routes (home, twitter, signals, repo, compare, search) — sample rate 0.1 already configured, spans are free.
6. PagerDuty / SMS escalation on Sentry alert rules for `pool=github exhausted` and `tag=github-pool-5xx`.
7. Reddit-trending route — code-split tabs via `next/dynamic` (4 framer-motion modules statically imported).
8. `BrowserAlertBridge` + `PostHogProvider` — defer behind `dynamic({ssr:false})` in `src/app/layout.tsx`.
9. 7 `pipeline/*` routes use bespoke validators instead of Zod — convention drift, not a security gap.

### K.4 P3 — Nice to have

1. Tracing infra (OpenTelemetry or Sentry distributed tracing) — request-ID propagation Next ↔ Worker.
2. Structured logging (pino on Next side) + 30d aggregator (Logtail/Axiom).
3. Long-running CI noise from current branch's repeated push events — investigate and fix to reduce GHA minute burn.
4. `npm audit` 5 moderate vulnerabilities — defer to next major version upgrade window.
5. Public-API tier with auth + quotas — open `/api/openapi.json` advertises everything to scrapers.
6. Cover the `EngineError` 38-class hierarchy gap — most classes are constructed but never feed a Sentry capture site.

---

## Cost Projection at 10k Users

| Service | Today | At 1k concurrent (realistic launch) | At 10k SUSTAINED concurrent | Δ |
|---|---|---|---|---|
| Vercel | $20 | $11,500 | $112,800 | **+$112,780** |
| Redis (Railway) | $15 | $50 | $340 | +$325 |
| Apify | $180-1,440 | $180-1,440 | $180-1,440 | flat |
| Sentry | $0 (DSN missing) | $26 | $80-130 | +$80-130 |
| GitHub Actions | $0 (public repo) | $0 | $0 | $0 |
| Worker (Railway) | $20 | $30 | $50 | +$30 |
| Resend / PostHog / misc | ~$25 | ~$50 | ~$2,000 (if PostHog naive) | +$1,975 |
| **TOTAL** | **~$240-1,500/month** | **~$11,800/month** | **~$115,500/month** | **+$114,000** |

**Headline:** the leap from 1k → 10k concurrent users multiplies monthly bill ~10× (linear scaling), driven primarily by Vercel bandwidth. **The 4.18 MB `/reddit/trending` page is a $235K/month cost bomb if 5% of traffic is uncached.**

**Order of cliff escalation (which service burns first as users grow):** Vercel bandwidth → Vercel function invocations → PostHog (if wired) → Sentry tier → Apify (flat ceiling) → Redis. GitHub Actions never (public repo).

---

## Evidence Appendix

### TTFB measurements (curl `-w`, 5 samples per route)

Full output: orchestrator log (50 requests, off-peak UTC 11:11–11:25). Summary in A.1 above.

### Production response headers

Captured via `curl -I https://trendingrepo.com/` and 9 follow-up routes. HSTS 2yr+preload, X-Frame DENY, X-Content-Type-Options nosniff, Permissions-Policy, Referrer-Policy strict-origin-when-cross-origin all present. **CSP absent.**

### Redis live probe

Read-only probe via ioredis (no writes, no FLUSHDB, no eviction triggered):
- DBSIZE: 4717
- used_memory_human: 75.24 MB (peak 209.65 MB)
- maxmemory: 0 (unlimited), maxmemory_policy: noeviction
- 200-key SCAN sample: 97% `ss:` namespace, 3% `pool:`. 81% no-TTL.

### `npm audit --json`

5 moderate vulnerabilities (next + postcss + @sentry/nextjs chain; esbuild + @vitest/mocker dev-only). 0 high, 0 critical.

### `npm run build` failure

Type error in [src/app/api/cron/freshness/state/route.ts:12](../../src/app/api/cron/freshness/state/route.ts) — non-route export `__setInspectSourceForTests` violates Next 15 module contract. Build cannot complete on current branch.

### Sub-agent reports (15 returned)

| Wave | Agent | Report length | Key finding |
|---|---|---|---|
| 1 | A-RSC ServerComponentDataCalls | ~600 lines | 2 routes FAIL >3 seq awaits; 3 RSC external-API offenders (P0/P1/P2) |
| 1 | A-NPlus1 (combines A-4..A-6) | ~400 lines | 1 P0 (social adapter fan-out, demoted to P1 — only legacy v=1), 12 P1s, 0 forEach(async) |
| 1 | E-SecretCode (E-1+E-2) | ~300 lines | PASS .env.example, PASS git history, PASS source tree |
| 1 | E-SecretDocs (E-3) | ~250 lines | PASS docs/data/tasks |
| 1 | F-RateLimit | ~500 lines | 6/107 routes have rate limit; admin/scan drift; 35× GitHub amplification |
| 2 | E-SecretOutput (E-4) | ~600 lines | 4 unauth recon endpoints, 11 routes echo err.message |
| 2 | E-InputValid (E-5) | ~500 lines | 0 fail mutating routes — Zod discipline real |
| 2 | J-FrontendPerf | ~600 lines | EntityLogo P0, OG force-dynamic P1, home LCP P1 |
| 3 | G-FailureModes | ~700 lines | OSS Insight #2 SPOF; 9/18 sources have circuit breaker; truth-skew bug; per-row freshness gap |
| 3 | H-Observability | ~600 lines | Sentry DSN missing P0; 7.6:1 silent ratio; no real-time dashboard |
| 3 | C-CronLoad | ~500 lines | `:00` is real burst (19 workflows, not `:27`); deploy storm worsening (96 data-commits/day last 7 days); GitHub user-route fan-out exhausts pool in 6 min/hr at 10k users |
| 3 | I-CostProjection | ~600 lines | $115k/month at 10k sustained; **$235K/month bandwidth alone if 5% of `/reddit/trending` traffic uncached**; Vercel Enterprise mandatory above 5k concurrent |

### file:line citation index

Top 25 most-cited evidence files in this audit (chronological order of mention):

- [src/lib/data-store.ts](../../src/lib/data-store.ts) — three-tier fallback, eviction race
- [src/lib/github-token-pool.ts](../../src/lib/github-token-pool.ts) — pool exhaustion, Sentry alerts
- [src/lib/env.ts](../../src/lib/env.ts) — boot-guard, missing Sentry/PostHog vars
- [next.config.ts](../../next.config.ts) — image whitelist, no `headers()`, Sentry wrap
- (no `src/middleware.ts` — confirmed absent)
- [src/lib/api/rate-limit.ts](../../src/lib/api/rate-limit.ts) — Upstash-backed, XFF trust
- [src/lib/api/auth.ts](../../src/lib/api/auth.ts) — verifyAdminAuth/verifyCronAuth
- [src/app/api/admin/scan/route.ts](../../src/app/api/admin/scan/route.ts) — drift finding
- [src/app/api/health/route.ts](../../src/app/api/health/route.ts) — APP-12 detail-stripping
- [src/app/api/health/sources/route.ts](../../src/app/api/health/sources/route.ts) — recon leak
- [src/app/api/worker/health/route.ts](../../src/app/api/worker/health/route.ts) — recon leak
- [src/app/api/pipeline/status/route.ts](../../src/app/api/pipeline/status/route.ts) — recon leak + err.message echo
- [src/app/api/openapi.json/route.ts](../../src/app/api/openapi.json/route.ts) — `globalThis[Symbol.for]` pattern
- [src/app/api/repos/[owner]/[name]/route.ts](../../src/app/api/repos/%5Bowner%5D/%5Bname%5D/route.ts) — v1/v2 social adapter fan-out
- [src/app/api/compare/github/route.ts](../../src/app/api/compare/github/route.ts) + [src/lib/github-compare.ts](../../src/lib/github-compare.ts) — 35× amplification
- [src/lib/pool/twitter-fallback.ts](../../src/lib/pool/twitter-fallback.ts) — Apify→Nitter cascade
- [src/lib/source-health-tracker.ts](../../src/lib/source-health-tracker.ts) — 9-source breaker registry
- [src/lib/api/parse-body.ts](../../src/lib/api/parse-body.ts) — Zod canonical helper
- [src/lib/api/error-response.ts](../../src/lib/api/error-response.ts) — `serverError` helper
- [src/components/ui/EntityLogo.tsx](../../src/components/ui/EntityLogo.tsx) — 122 call sites
- [src/components/layout/FreshBadge.tsx](../../src/components/layout/FreshBadge.tsx) — only public freshness pill
- [.github/workflows/audit-freshness.yml](../../.github/workflows/audit-freshness.yml) — hourly gate
- [.github/workflows/cron-freshness-check.yml](../../.github/workflows/cron-freshness-check.yml) — 15-min ping
- [.github/workflows/uptime-monitor.yml](../../.github/workflows/uptime-monitor.yml) — */5 PostHog
- [src/lib/errors.ts](../../src/lib/errors.ts) — 38-class EngineError hierarchy

---

*This document was synthesized from 15 sub-agent reports + orchestrator-side commands run on 2026-05-04. All findings cite file:line, command output, or measurement. Items marked UNKNOWN require operator/ops verification (Vercel tier, Railway Redis plan, Sentry alert rules). Load testing skipped per safety policy; recommendations based on code analysis + measured TTFBs + live Redis probe.*
