---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# OPERATOR â€” TrendingRepo full-stack situational awareness

**Audience:** Mirko + Claude Code sessions. NOT public. The `docs/` directory is not routed in Next.js so this file is not accessible by URL.

**Purpose:** every Claude Code session can read this file and instantly know the current state of the engine, what is shipping, and what is broken. Refreshed by `/loop` autonomous runs and by hand. **Source of truth for the audit-2026-05-04 follow-up.**

Last refreshed: 2026-05-05 (Phase 1 docs restructure — full session, post-Wave 6 + pre-existing fixes)

> **Current state:** PR #93 (audit-2026-05-04 stop-the-bleeding, 24 commits) merged as commit `0b3a477d`; follow-up PRs #96/#97/#99 also merged. For the latest pass, see the "2026-05-05 - Phase 1 docs restructure (full session)" section below. Next-session entry: `tasks/HANDOFF-2026-05-05-EOD.md`.

---

## Engine geography

```
                      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                      â”‚  GitHub Actions (88 workflows)                â”‚
                      â”‚   - 22 data-pushing scrapers (cron'd)         â”‚
                      â”‚   - 5 snapshot/archival jobs (daily)          â”‚
                      â”‚   - 8 cron-* app/API health probes            â”‚
                      â”‚   - 7 enrichment / refresh / promote          â”‚
                      â”‚   - 20 misc (CI, monitor, weekly)             â”‚
                      â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                       â”‚ writes
                                       â–¼
                â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                â”‚  Redis (Railway TCP via REDIS_URL)              â”‚
                â”‚   ss:data:v1:<key>  payload                     â”‚
                â”‚   ss:meta:v1:<key>  { writtenAt, writer,        â”‚
                â”‚                       runId, commit }           â”‚
                â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              reads via   â”‚                          â”‚  writes via
              data-store  â”‚                          â”‚  workers
                          â–¼                          â–¼
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚  Vercel Next.js (app)     â”‚    â”‚  Railway worker             â”‚
       â”‚   - SSR/ISR pages         â”‚    â”‚   - 52 fetchers cron-fired   â”‚
       â”‚   - /api/health probes    â”‚    â”‚   - In-process croner cron   â”‚
       â”‚   - portal MCP server     â”‚    â”‚   - /healthz endpoint        â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                       â”‚ writes (some)
                                       â–¼
                              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                              â”‚  Supabase Postgres    â”‚
                              â”‚   trending_items      â”‚
                              â”‚   trending_metrics    â”‚
                              â”‚   trending_assets     â”‚
                              â”‚   (only requiresDb)   â”‚
                              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Workflow rotation (UTC) â€” minute-level visibility

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
| :08 | audit-freshness | per-source budget gate (cron `8 * * * *`) |
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
| 03:17 (day 1) | aiso-self-scan | PostHog dogfood |
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
| `17 3 1 * *` | aiso-self-scan |

### Sunday-only
| Cron | Workflow |
|---|---|
| `0 5 * * 0` | cron-pipeline-rebuild |

### Manual / on-demand only (workflow_dispatch)
- `backfill-meta` â€” operator one-off for orphan ss:meta keys
- `probe-reddit` â€” diagnostic
- `sentry-fix-bot` â€” auto-fix bot
- `trendingrepo-worker` â€” manual worker dispatch
- `ci` â€” runs on push

---

## Data-store keys per source (ss:data:v1:<key>)

### Repo / discovery
- `trending` â€” main bucket, hourly @ :27
- `deltas` â€” 24h/7d/30d compute, hourly with trending
- `hot-collections` â€” OSSInsight collections, hourly
- `recent-repos` â€” github discovery, hourly
- `repo-metadata` â€” GH GraphQL hydrate, hourly
- `repo-profiles` â€” top 50 hourly + AISO scan queue
- `collection-rankings` â€” OSSInsight rankings, every 6h

### Mentions (per source)
- `hackernews-repo-mentions` â€” rolling 7d
- `reddit-mentions` â€” 45 subreddits scan
- `bluesky-mentions` â€” AT Protocol scan
- `devto-mentions` â€” dev.to API
- `lobsters-mentions` â€” lobste.rs HN-format
- `.data/twitter-repo-signals.jsonl` â€” Apify (file-based, NOT in Redis)

### Aggregations (cross-source)
- `engagement-composite` â€” feeds consensus, runs hourly @ :45
- `consensus-trending` â€” 8-source agreement, hourly @ :50
- `snapshot-consensus` â€” daily @ 23:55 UTC (cron `55 23 * * *`) â€” archives `consensus:<date>` for `/consensus` and `/consensus/[owner]/[name]`
- `consensus-verdicts` â€” Kimi K2.6 LLM verdicts, hourly @ :00

### MCP / Skills
- `trending-mcp` â€” MCP server roster
- `mcp-liveness` â€” uptime ping rolling 7d
- `mcp-downloads` â€” npm package downloads
- `mcp-downloads-pypi` â€” pypi downloads
- `mcp-dependents` â€” npm reverse dependencies
- `mcp-smithery-rank` â€” Smithery directory rank
- `trending-skill` â€” claude/community SKILL.md
- `trending-skill-sh` â€” skills.sh roster
- `trending-skill-skillsmp` â€” skillsmp 1M+ catalog
- `trending-skill-lobehub` â€” Lobehub plugins
- `trending-skill-smithery` â€” Smithery skill subset
- `skill-install-snapshot` â€” daily install ring buffer
- `skill-forks-snapshot` â€” daily forks ring buffer
- `skill-derivatives` â€” code-search derivative count

### Other sources
- `huggingface-trending` â€” models, every 6h @ :13
- `huggingface-datasets` â€” every 6h @ :25
- `huggingface-spaces` â€” every 6h @ :35
- `arxiv-recent` â€” every 3h @ :43
- `arxiv-enriched` â€” Semantic Scholar enrichment, every 12h
- `npm-packages` â€” daily @ :17 09:00
- `producthunt-launches` â€” 4Ã—/day
- `funding-news` â€” every 6h
- `trustmrr-startups` â€” daily full sweep @ 02:27
- `revenue-overlays` â€” hourly incremental
- `revenue-benchmarks` â€” daily after trustmrr
- `claude-rss` / `openai-rss` â€” daily
- `awesome-skills` â€” daily

---

## 2026-05-05 — Phase 1 docs restructure (full session)

9 commits today (`bot/marco/AGN-803`, all pushed to origin):
- 8b845df6 Phase 1.0.D verification sweep
- e4737757 ENGINE/DATABASE/SCORING rewrites + 4 guards + 2 CI workflows
- 4ae6b74f Wave 2 polish (12 agents)
- 48a5e1c3 Wave 3 (12 agents): ADR defer, cron deletes, generator patch
- e4030e21 INDEX refresh + next-wave plan
- d0876c51 Wave 4 (15 agents): A1-A5, B2-B4, C2-C4, D1-D3, E1-E6
- d5a29fa6 Wave 5 (12 agents): F3 OpenAPI gen + ADRs 0004/0005/0006
- 42ee8569 Wave 6: cron stagger (10->8) + generator frontmatter
- c38fd335 Pre-existing fixes: typecheck + Next config + JSX + nextUrl

Net deltas:
- 88 GH Actions workflows, 14 cron routes, 44 active worker fetchers
- 5 guard scripts + 4 CI workflows wired
- 9 path-scoped CLAUDE.md
- 3 new ADRs (0004 supersede 0001, 0005 commit policy, 0006 namespace plan)
- Cron schedule staggered (Mon 06:00 collision 10 -> 6)
- 4 dead worker stubs deleted
- Forensic generator FULLY root-caused + patched
- Repo health: 5/5 guards green, 0 broken links, 0 frontmatter violations

Next session entry: `tasks/HANDOFF-2026-05-05-EOD.md`

---

## Audit 2026-05-04 â€” what shipped vs what remains

### âœ… Shipped (PR #93, 28+ commits)

**Workflow git-push race (was #1 cause of failures)**
- New composite action `.github/actions/git-commit-data` (6Ã— exponential backoff + jitter)
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
- Home page Live/top-50 (All / Repos / Skills / MCP Ã— window)
- /mcp Top movers
- /funding Top rounds (filters by publishedAt age)
- /lobsters, /hackernews/trending, /devto, /bluesky/trending, /arxiv/trending
- /reddit/trending added Hot-30d (renamed Trending Now â†’ Trending 24h)
- /npm + /skills + /producthunt already had switchers (kept as-is)

**Image fallbacks (audit's CORB list)**
- MaintainerCard, /devto authors, /producthunt thumbnails, /twitter avatars: raw `next/image` â†’ `EntityLogo` so blocked URLs render monogram instead of dead grey square
- /arxiv/trending added a logo column (linked-repo owner avatar)
- /funding MoverRow now renders company logos (companyLogoUrl or favicon-derived)

**Diagnostics**
- twitter-collector FLUSH SUMMARY log
- worker silent-fetcher warn when `requiresDb=true && itemsUpserted=0`

**Sidebar cleanup**
- Hidden `/predict` and `/submit/revenue` per audit (no data-store backing)

**Worker stub cleanup**
- Removed `huggingface` stub from FETCHERS (was emitting "not yet implemented" every 4h)

### â¸ Open follow-ups

**Code-fixable (next session can grab)**
- HF rolling-delta collector â€” required for /huggingface/* window switcher (currently API gives only absolute counts)
- `/twitter` and `/ideas` should route through data-store for freshness tracking
- ~~15 zombie scripts identified by audit~~ âœ… 14 deleted on 2026-05-03 (kept `_github-token-pool-mini.mjs` for the _* convention)
- audit-freshness budget tightening for hourly sources (currently 6Ã— cadence; comment says target is 2Ã—)

**External / blocked**
- Sentry event delivery verification (need dashboard access)
- Apify actor cost + last-run audit (need APIFY_API_TOKEN locally)
- Vercel env-var inventory (need VERCEL_ORG_ID locally)
- Run `backfill-meta` workflow (after PR #93 merge â€” needs main branch presence)
- AISO failure-rate dashboard tile packet: `docs/release-validation/2026-05-05-agn-1443-aiso-failure-rate-dashboard-tile.md`

---

## Pages / routes â€” current state

### GREEN (rendering with real data)
`/`, `/consensus`, `/skills`, `/mcp`, `/agent-repos`, `/breakouts`, `/top`, `/signals`, `/hackernews/trending`, `/lobsters`, `/devto`, `/bluesky/trending`, `/reddit/trending`, `/twitter`, `/producthunt`, `/npm`, `/huggingface/trending|datasets|spaces`, `/funding`, `/revenue`, `/arxiv/trending`, `/research`, `/digest`, `/categories`, `/collections`, `/top10`, `/mindshare`, `/predict` (still on disk, hidden from sidebar)

### Sidebar-hidden but routes alive
`/predict`, `/submit/revenue` â€” kept on disk for direct-link access

### Static / user-data (intentional)
`/pricing`, `/watchlist`, `/tierlist`, `/ideas`, `/compare`

### Disabled (sidebar shows "Soon")
Hackathons, Launch â€” no route, no data, intentional

---

## Critical files

### Where to look first
- `docs/INDEX.md` â€” canonical front-door doc index (862 md files classified by trust level) [Phase 1 docs restructure, 2026-05-05]
- This file (`docs/OPERATOR.md`) â€” situational awareness
- `CLAUDE.md` â€” project conventions, anti-patterns
- `docs/ENGINE.md` â€” deeper engine map (88 workflows + every key) [rewritten from current code 2026-05-05]
- `docs/SITE-WIREMAP.md` â€” top-down route â†’ collector trace
- `docs/AUDIT-2026-05-04.md` â€” full audit (deferred external blockers)

### Hot files (changed often)
- `src/lib/data-store.ts` â€” 3-tier read + writer-provenance
- `scripts/_data-store-write.mjs` â€” collector mirror to Redis
- `apps/trendingrepo-worker/src/lib/redis.ts` â€” worker mirror
- `apps/trendingrepo-worker/src/run.ts` â€” fetcher boot + provenance setter
- `.github/actions/git-commit-data/action.yml` â€” composite git push retry
- `.github/workflows/scrape-trending.yml` â€” the big hourly job
- `src/components/leaderboards/WindowedRanking.tsx` â€” generic window switcher
- `src/components/feed/WindowedFeedTable.tsx` â€” generic feed switcher
- `src/components/funding/WindowedFundingBoard.tsx` â€” funding-specific switcher
- `src/components/home/LiveTopTable.tsx` â€” home page tabs
- `src/components/ui/EntityLogo.tsx` â€” image-with-monogram-fallback

---

## Production state snapshot (refresh this)

Last verified: 2026-05-03 ~03:20 UTC

- **/api/health**: HTTP 200, **`status:stale`**, `coveragePct:90.7`, `coverageQuality:partial`
- **/api/health/sources**: 9/9 CLOSED breakers
- **Worker /healthz**: ok, db=true, redis=true, lastRunAt fresh within minutes
- **`consensus-trending` Redis key**: 71h+ stale (climbing)
- **PR #93**: ðŸŸ¢ ALL 5 CI CHECKS PASSING. 32 commits ready. Mergeable. Awaiting human merge.

**âœ… GH Actions cron drought resolved.** 13 cron-triggered runs in last 60 min (04:09-04:14 UTC). 12 green, 1 red (cron-freshness-check â€” correctly alarming on the not-yet-propagated stale state). Production data is currently catching up.

**Two blockers right now:**
1. PR #93 needs human merge â†’ fixes data-store consensus-trending crash + scripts hang + image fallbacks + 24h/7d/30d UX
2. GH Actions cron drought is starving the data pipeline â†’ time will heal it

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

- **Never `git add -A` or `git add .`** â€” always specific files. CLAUDE.md anti-pattern: parallel-session merges silently steal staged work.
- **Never switch Twitter to API mode** â€” silently fails on Vercel.
- **Never mock Redis in scoring tests** â€” 2026-Q1 incident.
- **Never use cookie-based Twitter scrapers** â€” dead since 2026 anti-bot.
- **Don't `readFileSync` data files** â€” use the data-store.
- **Kimi For Coding requires `stream: true`** â€” non-stream hangs silently.
- **Don't sequential-loop the consensus-analyst** â€” use the bounded-concurrency queue.
- **Audit premises must be verified before believing** (M6).

---

## Update cadence for THIS file

- Refreshed by hand at the end of every "go" wave so the next session has fresh context
- Loop scheduling: when the user runs `/loop` against this file's update task, refresh once per autonomous tick
- The `Last refreshed` timestamp at the top is the authoritative freshness marker

## SRE Workflow Health routine prompt (weekly)

Run this check every Monday (UTC) and attach evidence in a release-validation note:

1. Probe GitHub pool usage from Redis `pool:github:usage:*` using `SCAN` (never `KEYS` on prod).
2. Tally request counts per configured token fingerprint for the latest 24 hourly buckets.
3. Compute:
   - `mean = totalRequests24h / tokenCount`
   - `stddev/mean`
   - per-token `abs((requests24h - mean) / mean)` for ±15% balance
4. Gate:
   - PASS if `stddev/mean <= 0.7` and all tokens are within ±15%
   - FAIL otherwise, and open/refresh a P1 follow-up for rotation-bias investigation.
5. Record the result with timestamp, probe output summary, and verdict in `docs/release-validation/`.

