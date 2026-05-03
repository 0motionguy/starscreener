# OPERATOR — TrendingRepo full-stack situational awareness

**Audience:** Mirko + Claude Code sessions. NOT public. The `docs/` directory is not routed in Next.js so this file is not accessible by URL.

**Purpose:** every Claude Code session can read this file and instantly know the current state of the engine, what is shipping, and what is broken. Refreshed by `/loop` autonomous runs and by hand. **Source of truth for the audit-2026-05-04 follow-up.**

Last refreshed: 2026-05-03 (zombie cleanup tick)

---

## TL;DR for a fresh session

You walked into a project whose 2026-05-04 audit found 6 classes of breakage. **Most are now fixed in PR [#93](https://github.com/0motionguy/starscreener/pull/93) (32 commits on `claude/modest-pasteur-59599d`).** As of 02:10 UTC 2026-05-03:

🟢 **PR #93 CI is GREEN** (typecheck + tests + e2e + Vercel preview all pass)
🔴 **Production health degraded:** `/api/health` returns `status:stale` because consensus-trending Redis key is 69h+ stale (snapshot-consensus failing nightly as result)
🎯 **Single-action fix: merge PR #93.** That ships the consensus-trending allSettled hardening to Railway worker, and the .data/twitter-*.jsonl + dev.to author CORB fixes to Vercel. Everything downstream resolves.

If the user says "go" or "continue", consider checking PR #93 status first — if the user has merged it, snapshot/consensus failures will resolve in the next worker tick. Otherwise read § "Open follow-ups" below and pick the highest-leverage item.

---

## Engine geography

```
                      ┌──────────────────────────────────────────────┐
                      │  GitHub Actions (62 workflows)                │
                      │   - 22 data-pushing scrapers (cron'd)         │
                      │   - 5 snapshot/archival jobs (daily)          │
                      │   - 8 cron-* app/API health probes            │
                      │   - 7 enrichment / refresh / promote          │
                      │   - 20 misc (CI, monitor, weekly)             │
                      └────────────────┬─────────────────────────────┘
                                       │ writes
                                       ▼
                ┌────────────────────────────────────────────────┐
                │  Redis (Railway TCP via REDIS_URL)              │
                │   ss:data:v1:<key>  payload                     │
                │   ss:meta:v1:<key>  { writtenAt, writer,        │
                │                       runId, commit }           │
                └─────────┬──────────────────────────┬───────────┘
              reads via   │                          │  writes via
              data-store  │                          │  workers
                          ▼                          ▼
       ┌──────────────────────────┐    ┌────────────────────────────┐
       │  Vercel Next.js (app)     │    │  Railway worker             │
       │   - SSR/ISR pages         │    │   - 42 fetchers cron-fired   │
       │   - /api/health probes    │    │   - In-process croner cron   │
       │   - portal MCP server     │    │   - /healthz endpoint        │
       └──────────────────────────┘    └────────────────────────────┘
                                       │ writes (some)
                                       ▼
                              ┌──────────────────────┐
                              │  Supabase Postgres    │
                              │   trending_items      │
                              │   trending_metrics    │
                              │   trending_assets     │
                              │   (only requiresDb)   │
                              └──────────────────────┘
```

---

## Workflow rotation (UTC) — minute-level visibility

### Every 5 minutes
| Time | Workflow | Purpose |
|---|---|---|
| `*/5 * * * *` | uptime-monitor | PostHog ping |

### Every 15 minutes
| Time | Workflow | Purpose |
|---|---|---|
| `*/15 * * * *` | cron-freshness-check | GET /api/health, alert on state change |

### Every 30 minutes
| Time | Workflow | Purpose |
|---|---|---|
| `:00 :30` | cron-aiso-drain | drain `.data/aiso-rescan-queue.jsonl` |
| `*/30 * * * *` | health-watch | per-source freshness budgets |

### Hourly
| :MM | Workflow | What it writes |
|---|---|---|
| :00 | audit-freshness | per-source budget gate |
| :05 | cron-webhooks-flush | flush queued webhooks |
| :10 | cron-llm | LLM telemetry aggregate |
| :17 | scrape-bluesky | bluesky-trending, bluesky-mentions |
| :17 | sync-trustmrr (incremental) | revenue-overlays from cached catalog |
| :27 | scrape-trending (the big one) | trending, deltas, recent-repos, repo-metadata, reddit-mentions, hackernews-trending |
| :35 | cron-webhooks-flush | flush queued webhooks |
| :37 | scrape-lobsters | lobsters-trending, lobsters-mentions |
| :41 | enrich-repo-profiles | repo-profiles (top 50, AISO scan submission) |
| :43 | scrape-arxiv (every 3h) | arxiv-recent |

### Every 2-3 hours
| Cron | Workflow |
|---|---|
| `15 */2 * * *` | cron-pipeline-ingest |
| `0 */3 * * *` | collect-twitter (Apify) |
| `43 */3 * * *` | scrape-arxiv |

### Every 6 hours
| Time | Workflow | Notes |
|---|---|---|
| `13 */6 * * *` | scrape-huggingface | models trending |
| `25 */6 * * *` | scrape-huggingface-datasets | |
| `35 */6 * * *` | scrape-huggingface-spaces | |
| `17 */6 * * *` | refresh-collection-rankings | OSSInsight collections |
| `0 */6 * * *` | scrape-devto | dev.to mentions + trending |
| `0 */6 * * *` | collect-funding | TechCrunch + sifted RSS |
| `23 */6 * * *` | refresh-npm-downloads | mcp-downloads |
| `37 */6 * * *` | refresh-pypi-downloads | mcp-downloads-pypi |
| `30 */6 * * *` | cron-pipeline-persist | |
| `47 */6 * * *` | ping-mcp-liveness | mcp-liveness rolling 7d |

### Every 12 hours
| Cron | Workflow |
|---|---|
| `13 */12 * * *` | enrich-arxiv (Semantic Scholar) |
| `7 */12 * * *` | refresh-skill-derivatives |
| `45 */12 * * *` | refresh-skill-lobehub |

### Daily (UTC times listed below)

| Time | Workflow | Purpose |
|---|---|---|
| 02:00 | run-shadow-scoring | scoring-shadow-report |
| 02:00 | sweep-staleness | staleness-report |
| 02:27 | sync-trustmrr (full sweep) | trustmrr-startups, revenue-overlays |
| 03:00 | refresh-skill-install-snapshot | skill-install-snapshot |
| 03:05 | refresh-skill-skillsmp | skill-skillsmp roster |
| 03:11 | refresh-mcp-smithery-rank | mcp-smithery-rank |
| 03:12 | refresh-skill-claude | trending-skill-claude |
| 03:13 | refresh-skill-forks-snapshot | skill-forks-snapshot |
| 03:17 | aiso-self-scan | PostHog dogfood |
| 03:17 | refresh-star-activity | star-activity per repo |
| 03:25 | refresh-hotness-snapshot | hotness-snapshot per domain |
| 03:30 | refresh-mcp-usage-snapshot | mcp-usage-snapshot |
| 03:30 | refresh-skill-smithery | smithery-skills roster |
| 04:00 | cron-pipeline-cleanup | |
| 04:23 | scrape-awesome-skills | awesome-skills index |
| 04:30 | promote-unknown-mentions | unknown-mentions-promoted |
| 04:31 | cron-agent-commerce | agent-commerce, x402, openrouter, coingecko |
| 04:53 | refresh-mcp-dependents | mcp-dependents (npm dependents count) |
| 06:00 | cron-predictions | predictions roster |
| 07:22 | scrape-claude-rss | claude-rss |
| 07:47 | scrape-openai-rss | openai-rss |
| 09:17 | scrape-npm | npm-packages (download stats lag 24-48h) |
| 11:00 | scrape-producthunt | producthunt-launches |
| 14:00 | cron-twitter-outbound | outbound auto-reply daily roll |
| 15:00 | scrape-producthunt | (4 firings/day) |
| 19:00 | scrape-producthunt | |
| 23:00 | scrape-producthunt | |
| 23:50 | snapshot-top10-sparklines | sparkline ring buffer |
| 23:55 | snapshot-top10 | top10:<date> archival |
| 23:55 | snapshot-consensus | consensus:<date> archival |

### Weekly
| Cron | Workflow |
|---|---|
| `0 8 * * 1` | cron-digest-weekly |
| `17 3 * * 1` | refresh-reddit-baselines |

### Monthly
| Cron | Workflow |
|---|---|
| `0 3 1 * *` | cron-mcp-usage-rotate |

### Sunday-only
| Cron | Workflow |
|---|---|
| `0 5 * * 0` | cron-pipeline-rebuild |

### Manual / on-demand only (workflow_dispatch)
- `backfill-meta` — operator one-off for orphan ss:meta keys
- `probe-reddit` — diagnostic
- `sentry-fix-bot` — auto-fix bot
- `trendingrepo-worker` — manual worker dispatch
- `ci` — runs on push

---

## Data-store keys per source (ss:data:v1:<key>)

### Repo / discovery
- `trending` — main bucket, hourly @ :27
- `deltas` — 24h/7d/30d compute, hourly with trending
- `hot-collections` — OSSInsight collections, hourly
- `recent-repos` — github discovery, hourly
- `repo-metadata` — GH GraphQL hydrate, hourly
- `repo-profiles` — top 50 hourly + AISO scan queue
- `collection-rankings` — OSSInsight rankings, every 6h

### Mentions (per source)
- `hackernews-repo-mentions` — rolling 7d
- `reddit-mentions` — 45 subreddits scan
- `bluesky-mentions` — AT Protocol scan
- `devto-mentions` — dev.to API
- `lobsters-mentions` — lobste.rs HN-format
- `.data/twitter-repo-signals.jsonl` — Apify (file-based, NOT in Redis)

### Aggregations (cross-source)
- `engagement-composite` — feeds consensus, runs hourly @ :45
- `consensus-trending` — 8-source agreement, hourly @ :50
- `consensus-verdicts` — Kimi K2.6 LLM verdicts, hourly @ :00

### MCP / Skills
- `trending-mcp` — MCP server roster
- `mcp-liveness` — uptime ping rolling 7d
- `mcp-downloads` — npm package downloads
- `mcp-downloads-pypi` — pypi downloads
- `mcp-dependents` — npm reverse dependencies
- `mcp-smithery-rank` — Smithery directory rank
- `trending-skill` — claude/community SKILL.md
- `trending-skill-sh` — skills.sh roster
- `trending-skill-skillsmp` — skillsmp 1M+ catalog
- `trending-skill-lobehub` — Lobehub plugins
- `trending-skill-smithery` — Smithery skill subset
- `skill-install-snapshot` — daily install ring buffer
- `skill-forks-snapshot` — daily forks ring buffer
- `skill-derivatives` — code-search derivative count

### Other sources
- `huggingface-trending` — models, every 6h @ :13
- `huggingface-datasets` — every 6h @ :25
- `huggingface-spaces` — every 6h @ :35
- `arxiv-recent` — every 3h @ :43
- `arxiv-enriched` — Semantic Scholar enrichment, every 12h
- `npm-packages` — daily @ :17 09:00
- `producthunt-launches` — 4×/day
- `funding-news` — every 6h
- `trustmrr-startups` — daily full sweep @ 02:27
- `revenue-overlays` — hourly incremental
- `revenue-benchmarks` — daily after trustmrr
- `claude-rss` / `openai-rss` — daily
- `awesome-skills` — daily

---

## Audit 2026-05-04 — what shipped vs what remains

### ✅ Shipped (PR #93, 28+ commits)

**Workflow git-push race (was #1 cause of failures)**
- New composite action `.github/actions/git-commit-data` (6× exponential backoff + jitter)
- All 22 data-pushing workflows converted (waves 1-4)
- LF forced on workflow yml (`.gitattributes`)

**Worker fetcher crash-on-flake (caused 45h consensus-trending stale)**
- 9 fetchers switched from `Promise.all` to `Promise.allSettled` over readDataStore: consensus-trending, engagement-composite, revenue-benchmarks, trustmrr, repo-profiles, repo-metadata, skill-derivatives, github-events, skill-forks-snapshot, skill-install-snapshot
- Per-source failure logging on each

**Snapshot script 6.1h hangs**
- snapshot-consensus / snapshot-top10 / snapshot-top10-sparklines + 7 other Redis-using scripts: explicit `process.exit(0)` after main resolves (ioredis no longer holds event loop until GH 6h cap)

**Writer provenance**
- Optional `{writtenAt, writer, runId, commit}` JSON-shape meta. Reader tolerates both old ISO-string and new JSON shape (back-compat)
- GHA scripts auto-fill from GITHUB_WORKFLOW / GITHUB_RUN_ID / GITHUB_SHA
- Worker writer auto-injected via `setCurrentFetcherName()` from `run.ts`
- One-off `scripts/backfill-meta.mjs` + `.github/workflows/backfill-meta.yml` for orphan `mcp-dependents` / `mcp-smithery-rank`

**24h / 7d / 30d window switchers**
- Home page Live/top-50 (All / Repos / Skills / MCP × window)
- /mcp Top movers
- /funding Top rounds (filters by publishedAt age)
- /lobsters, /hackernews/trending, /devto, /bluesky/trending, /arxiv/trending
- /reddit/trending added Hot-30d (renamed Trending Now → Trending 24h)
- /npm + /skills + /producthunt already had switchers (kept as-is)

**Image fallbacks (audit's CORB list)**
- MaintainerCard, /devto authors, /producthunt thumbnails, /twitter avatars: raw `next/image` → `EntityLogo` so blocked URLs render monogram instead of dead grey square
- /arxiv/trending added a logo column (linked-repo owner avatar)
- /funding MoverRow now renders company logos (companyLogoUrl or favicon-derived)

**Diagnostics**
- twitter-collector FLUSH SUMMARY log
- worker silent-fetcher warn when `requiresDb=true && itemsUpserted=0`

**Sidebar cleanup**
- Hidden `/predict` and `/submit/revenue` per audit (no data-store backing)

**Worker stub cleanup**
- Removed `huggingface` stub from FETCHERS (was emitting "not yet implemented" every 4h)

### ⏸ Open follow-ups

**Code-fixable (next session can grab)**
- HF rolling-delta collector — required for /huggingface/* window switcher (currently API gives only absolute counts)
- `/twitter` and `/ideas` should route through data-store for freshness tracking
- ~~15 zombie scripts identified by audit~~ ✅ 14 deleted on 2026-05-03 (kept `_github-token-pool-mini.mjs` for the _* convention)
- audit-freshness budget tightening for hourly sources (currently 6× cadence; comment says target is 2×)

**External / blocked**
- Sentry event delivery verification (need dashboard access)
- Apify actor cost + last-run audit (need APIFY_API_TOKEN locally)
- Vercel env-var inventory (need VERCEL_ORG_ID locally)
- Run `backfill-meta` workflow (after PR #93 merge — needs main branch presence)

---

## Pages / routes — current state

### GREEN (rendering with real data)
`/`, `/consensus`, `/skills`, `/mcp`, `/agent-repos`, `/breakouts`, `/top`, `/signals`, `/hackernews/trending`, `/lobsters`, `/devto`, `/bluesky/trending`, `/reddit/trending`, `/twitter`, `/producthunt`, `/npm`, `/huggingface/trending|datasets|spaces`, `/funding`, `/revenue`, `/arxiv/trending`, `/research`, `/digest`, `/categories`, `/collections`, `/top10`, `/mindshare`, `/predict` (still on disk, hidden from sidebar)

### Sidebar-hidden but routes alive
`/predict`, `/submit/revenue` — kept on disk for direct-link access

### Static / user-data (intentional)
`/pricing`, `/watchlist`, `/tierlist`, `/ideas`, `/compare`

### Disabled (sidebar shows "Soon")
Hackathons, Launch — no route, no data, intentional

---

## Critical files

### Where to look first
- This file (`docs/OPERATOR.md`) — situational awareness
- `CLAUDE.md` — project conventions, anti-patterns
- `docs/ENGINE.md` — deeper engine map (62 workflows + every key)
- `docs/SITE-WIREMAP.md` — top-down route → collector trace
- `docs/AUDIT-2026-05-04.md` — full audit (deferred external blockers)

### Hot files (changed often)
- `src/lib/data-store.ts` — 3-tier read + writer-provenance
- `scripts/_data-store-write.mjs` — collector mirror to Redis
- `apps/trendingrepo-worker/src/lib/redis.ts` — worker mirror
- `apps/trendingrepo-worker/src/run.ts` — fetcher boot + provenance setter
- `.github/actions/git-commit-data/action.yml` — composite git push retry
- `.github/workflows/scrape-trending.yml` — the big hourly job
- `src/components/leaderboards/WindowedRanking.tsx` — generic window switcher
- `src/components/feed/WindowedFeedTable.tsx` — generic feed switcher
- `src/components/funding/WindowedFundingBoard.tsx` — funding-specific switcher
- `src/components/home/LiveTopTable.tsx` — home page tabs
- `src/components/ui/EntityLogo.tsx` — image-with-monogram-fallback

---

## Production state snapshot (refresh this)

Last verified: 2026-05-03 ~03:20 UTC

- **/api/health**: HTTP 200, **`status:stale`**, `coveragePct:90.7`, `coverageQuality:partial`
- **/api/health/sources**: 9/9 CLOSED breakers
- **Worker /healthz**: ok, db=true, redis=true, lastRunAt fresh within minutes
- **`consensus-trending` Redis key**: 71h+ stale (climbing)
- **PR #93**: 🟢 ALL 5 CI CHECKS PASSING. 32 commits ready. Mergeable. Awaiting human merge.

**✅ GH Actions cron drought resolved.** 13 cron-triggered runs in last 60 min (04:09-04:14 UTC). 12 green, 1 red (cron-freshness-check — correctly alarming on the not-yet-propagated stale state). Production data is currently catching up.

**Two blockers right now:**
1. PR #93 needs human merge → fixes data-store consensus-trending crash + scripts hang + image fallbacks + 24h/7d/30d UX
2. GH Actions cron drought is starving the data pipeline → time will heal it

To re-verify, run:
```bash
curl -sS https://trendingrepo.com/api/health | jq '.status,.coveragePct'
curl -sS https://trendingrepo-worker-production.up.railway.app/healthz
gh run list --limit 30 --json workflowName,conclusion | jq '[.[] | select(.conclusion=="failure")] | length'
gh pr checks 93
```

---

## Operating principles (non-negotiable)

K1-K4 + M1-M6 from `~/.claude/CLAUDE.md` apply. Project-specific:

- **Never `git add -A` or `git add .`** — always specific files. CLAUDE.md anti-pattern: parallel-session merges silently steal staged work.
- **Never switch Twitter to API mode** — silently fails on Vercel.
- **Never mock Redis in scoring tests** — 2026-Q1 incident.
- **Never use cookie-based Twitter scrapers** — dead since 2026 anti-bot.
- **Don't `readFileSync` data files** — use the data-store.
- **Kimi For Coding requires `stream: true`** — non-stream hangs silently.
- **Don't sequential-loop the consensus-analyst** — use the bounded-concurrency queue.
- **Audit premises must be verified before believing** (M6).

---

## Update cadence for THIS file

- Refreshed by hand at the end of every "go" wave so the next session has fresh context
- Loop scheduling: when the user runs `/loop` against this file's update task, refresh once per autonomous tick
- The `Last refreshed` timestamp at the top is the authoritative freshness marker
