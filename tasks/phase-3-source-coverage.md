# Phase 3 — Source Coverage Expansion

**Goal:** match (and beat) OSSInsight + Trendshift on the data side.
**Effort:** 1-2 days of focused work (parallel-subagent pattern).
**Prereq:** Phase 1B (Redis data-store) + Phase 2 (reliability) shipped.

## Reality check (verified, no bluffing)

Per `starscreener-inspection/MOAT.md` + `SOURCES.md` (verified 2026-04-18, still accurate):
- OSSInsight: 17-repo curated AI Agent Frameworks collection, 2011 historical depth, real-time rank-change indicators, warehouse-backed
- Trendshift: first-class `#ai-agent` topic (45.6k-star aggregate), daily cadence, opaque scoring algo
- StarScreener today: ~35% recall on AI classifier, 30-day snapshot history, 40k-star sparkline cap blinds 296/309 seed repos
- **What no competitor ships:** alert delivery, MCP server, sub-minute latency on a curated AI watchlist

The moat doc's verdict: **pivot the pitch from "AI-first OSS trend screener" to "agent-native momentum signal for LLM tool chains"**. Phase 3 closes the data gap; Phase 4 monetizes the agent-native delivery moat.

## Four workstreams (each shippable independently)

### 3.1 — Trendshift-style engagement composite
**Why:** Trendshift's only differentiator is a composite "engagement score" they don't publish. We can derive ours from existing sources and own the transparency angle.

**Inputs (all already collected):**
- HN points + comments + age
- Reddit upvotes + comments + cross-posts
- Bluesky reposts + likes
- DEV reactions + bookmarks
- npm downloads (7-day rolling)
- GH stars-velocity (per-day delta)
- ProductHunt votes (when launched in window)

**Deliverables:**
- `src/lib/scoring/engagement-composite.ts` — pure function, takes `{repoId, signals}` → returns `{score: 0-100, components: {hn: 23, reddit: 41, ...}, methodology: "..."}`
- New endpoint `/api/scoring/engagement` — public read, paged
- Publish methodology in `docs/SCORING.md` (transparency lever)

**Effort:** ~6 hours (algorithm design + tests + docs)

### 3.2 — GH Archive / ClickHouse historical depth
**Why:** OSSInsight ships data since 2011. We ship 30 days. That's the single biggest data-credibility gap.

**Approach:** GH Archive (free hourly dumps of the GitHub firehose since 2011) → public ClickHouse instance (~$5-15/mo) → query on demand.

**Deliverables:**
- Worker script: `scripts/backfill-historical.mjs` — pulls GH Archive .json.gz files for a date range, extracts star events for tracked repos, writes to ClickHouse
- ClickHouse schema: `repo_events(repo_id, event_type, occurred_at, payload)` — single fat table, partitioned by week
- Reader: `src/lib/historical/clickhouse.ts` — query helpers (stars-over-time, contributors-over-time, releases-over-time)
- Endpoint: `/api/repos/[owner]/[name]/history?from=2020-01-01&to=2024-12-31&metric=stars` — public read

**Effort:** ~8 hours (provisioning + backfill + reader + endpoint)
**Cost:** $5-15/mo for ClickHouse hosting

### 3.3 — GitHub Events firehose for sub-minute latency
**Why:** Today's p50 latency is ~1 hour (cron cadence). Sub-minute detection on the watchlist is genuinely defensible — no competitor advertises it.

**Approach:** `events-backfill.ts` already exists for mega-repo fallback (commit `77a9cc5`). Promote it from "fallback" to "primary watchlist polling" with 5-min cadence on the top 50-100 repos.

**Deliverables:**
- New workflow: `.github/workflows/cron-events-watchlist.yml` — `*/5 * * * *` cadence (every 5 min) for top-50 watchlist
- Refactor `events-backfill.ts` to write to Redis via the data-store (currently writes to JSONL)
- Add "watchlist tier" to repo metadata (manual seed + auto-promote on breakout signals)
- Health endpoint reports per-tier latency

**Effort:** ~4 hours (workflow + refactor + watchlist tier logic)
**Risk:** burns more GitHub PAT quota. Phase 2's token pool already mitigates.

### 3.4 — Funding announcements (Crunchbase RSS + X funding hashtags)
**Why:** Existing `src/lib/funding/` scaffold tracks "X raised $Y"-style events linked to repos. Currently single-source (TechCrunch/VentureBeat/Sifted scrapers). Adding Crunchbase RSS + X funding hashtags via Apify gives breadth + freshness.

**Deliverables:**
- New collector: `scripts/scrape-crunchbase-funding.mjs` — RSS pull + entity extraction
- New collector: `scripts/scrape-x-funding-hashtags.mjs` — Apify search for `#funding`, `$100M`, etc., NLP-extract company + amount
- Wire both into the existing `src/lib/funding/repo-events.ts` aggregator
- Update `funding-aliases.json` schema to support these new sources

**Effort:** ~4 hours per source (scraper + entity extraction + integration)

## Cadence audit (the meta-question)

Current cadences after Phase 1B:
- scrape-trending: hourly (was every 20 min before throttle)
- scrape-bluesky / lobsters / hackernews: hourly
- scrape-devto / npm: daily
- scrape-producthunt: 4x daily
- collect-twitter: every 3h
- enrich-repo-profiles: hourly

**Phase 3 retargets:**
- HOT tier (top 50 watchlist): every 5 min via Events firehose (3.3)
- WARM tier (next 500): hourly (current)
- COLD tier (rest): every 6 hours

This puts our latency story BELOW Trendshift (daily) and competitive with OSSInsight ("real-time" but actual latency unspecified).

## Verification gates per workstream

**3.1 (composite):**
- Pure function tests across all 6 input sources
- Score normalization to 0-100 verified
- `docs/SCORING.md` includes worked example: "for repo X with HN 234pts/27comments + Reddit 1.2k upvotes + ... → composite 78"

**3.2 (historical):**
- Round-trip test: backfill 1 day of events for `vercel/next.js`, query back
- Latency test: query for 1-year window <200ms p95

**3.3 (events firehose):**
- 5-min latency demonstrated for at least one watchlist repo (manually trigger workflow + measure)
- Token pool from Phase 2 absorbs the additional API load
- Per-source health endpoint shows green for events feed

**3.4 (funding):**
- At least 5 funding events successfully linked to repos in test data
- Existing TechCrunch path unaffected

## Out of scope (defer to Phase 4 or later)

- Email digest of new funding events (Phase 4 — alert delivery)
- LLM-classifier for "is this funding event actually for this repo?" (good v2 problem; for v1 use rule-based aliasing)
- Self-serve "watch this repo" subscriptions (Phase 4 — user accounts)

## Risks

| Risk | Mitigation |
|---|---|
| GH Archive gz files are 50-200 MB/hr — backfill cost is real | Backfill incrementally; only top-1000 repos for full history; rest get last 90 days |
| ClickHouse public instance reliability varies | Pin to Aiven or self-host on Railway Postgres+TimescaleDB as fallback |
| Apify costs (X funding hashtags) | Cap to 10 calls/day via collector throttle; signals here are slow-moving |
| Events firehose burns PAT quota | Phase 2 token pool absorbs; monitor via per-source health endpoint |

## When to start Phase 3

After Phase 1B + Phase 2 are merged and stable for 24+ hours (no rollback needed). Take a clean session for Phase 3 — design choices benefit from a fresh look at the moat.
