---
last-verified: 2026-05-27
verified-by: claude
status: living
---

# Persistent Repo Registry + Lifetime Mentions

Architecture doc for the **persistence + completeness layer** shipped 2026-05-27 (commit range `e59c9b1`..`1c72513` on `bot/swarm-a6-producthunt-reader`). Read this when you're touching the tracked-count, the profile mention pips, the cross-source rollup, or anything that asks "where does this number come from?"

## TL;DR

1. **`trending` slug is an ephemeral snapshot.** Each `oss-trending` worker run overwrites it. A repo that leaves the snapshot vanishes from the site — UNLESS another layer retains it.
2. **`repo-registry` is the durable accumulator.** A worker fetcher unions every repo it has ever seen (trending + recent + manual + repo-metadata + consensus-trending) into a redis-backed slug. Cap **2000 LRU by `lastSeenAt`**. Never deletes unseen entries.
3. **`mentions-ledger` is the durable lifetime mention counter.** `SADD ss:mentions:v1:<repo>:<source>` + `HINCRBY …:_index` per (repo, source). The fetcher now flattens that into the `mentions-ledger` snapshot slug — the read-side the app expected but never got.
4. **The app reads both** via the data-store-reader pattern → `getDerivedRepos()` unions registry repos; the mentions-rollup decorator folds the ledger as authoritative lifetime `count`.
5. **The single canonical tracked-count is `getDerivedRepoCount()`** — every display surface uses it. Do **not** use `getTrackedRepoCount()` (that reads only the cold trending seed, was 732 vs the canonical 866).

## Architecture

```
Source-of-truth: TOOLBOX redis (ss:data:v1:<slug>). Containers below:

┌─ Worker (toolbox-trendingrepo-worker-1) ────────────────────────────┐
│                                                                     │
│  oss-trending  :22 hourly  → writes `trending`  (ephemeral snapshot)│
│  recent-repos  :25 hourly  → writes `recent-repos`                  │
│  repo-metadata :13 hourly  → reads trending+recent+manual+REGISTRY  │
│                              → writes `repo-metadata`               │
│  consensus-trending :50 hr → writes `consensus-trending`            │
│  consensus-analyst  :00 hr → reads consensus, TOP_N=14, Kimi/Nano   │
│                              → writes `consensus-verdicts`          │
│  repo-profiles :41 hourly  → reads trending top-20, AISO scan       │
│                              → writes `repo-profiles`               │
│                                                                     │
│  ▶ repo-registry :47 HOURLY (the accumulator)                       │
│       reads:  existing repo-registry + trending + repo-metadata     │
│               + consensus-trending + recent-repos                   │
│       writes: repo-registry  (LRU 2000 by lastSeenAt)               │
│                                                                     │
│  mentions-ledger :7,22,37,52 hourly                                 │
│       sources: hackernews-repo-mentions, reddit-mentions,           │
│                bluesky-mentions, devto-mentions, lobsters-mentions  │
│       writes redis sets + index hashes (SADD/HINCRBY, lifetime)     │
│       + FLATTENED snapshot → `mentions-ledger`  (the read-side)     │
│                                                                     │
│  cross-source-sweep  06:00 daily                                    │
│       reads trending+consensus+REGISTRY (tertiary tier) for top-N=150│
│       live HN Algolia + Bluesky + ProductHunt + Tavily(env-gated)   │
│       + Apify Twitter top-40 (env-gated)                            │
│       folds in source-first snapshots (devto/HN/reddit/lobsters/bsky)│
│       writes `repo-mentions-detail-rollup` (countLifetime never drops)│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (data-store reads, 30s rate-limit)
┌─ App (toolbox-trendingrepo-1) ──────────────────────────────────────┐
│  src/lib/data-store-reader.ts → createPayloadReader<T>()            │
│                                                                     │
│  Per-source readers + their refreshXxxFromStore():                  │
│    src/lib/derived-repos/loaders/registry.ts  → getRegistryRepos()  │
│    src/lib/mentions-ledger.ts                 → getRepoMentionsLedger(name) │
│    src/lib/cross-source-mentions.ts           → getCrossSourceDetail(name)  │
│    src/lib/hackernews.ts | bluesky | devto | lobsters | reddit-data │
│                                                                     │
│  src/lib/derived-repos.ts getDerivedRepos() unions:                 │
│    1. buildTrendingAggregates() (trending)                          │
│    2. recent + manual (skip seenFullNames)                          │
│    3. ▶ REGISTRY  (skip seenFullNames, fold getRepoMetadata)        │
│    4. pipeline-jsonl (dead in prod; local-dev fallback)             │
│  → classify → score → cross-signal → twitter → mentions-rollup …    │
│                                                                     │
│  Decorator: src/lib/derived-repos/decorators/mentions-rollup.ts     │
│    For each repo's perSource[channel]:                              │
│      count24h, count7d   ← bundled walkers (scoring uses these)     │
│      count               ← max(bundled .length, sweep countLifetime,│
│                                LEDGER cumulative)                    │
│      total               ← sum of count                              │
│                                                                     │
│  MentionSourcePips.sourceCount() = count ?? max(count24h, count7d)  │
│  → lifetime number on the list rows + profile pips                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Redis slugs at a glance

| Slug | Producer | Cadence | Shape | Role |
|---|---|---|---|---|
| `trending` | `oss-trending` | hourly :22 | `{buckets: {period: {lang: OssRow[]}}}` | Ephemeral OSSInsight snapshot — do NOT use for tracked count |
| `recent-repos` | `recent-repos` | hourly :25 | `{items: RecentRepoRow[]}` | Fresh-discovery surface (currently 0 in prod — pre-existing bug, see DEPLOY-TOOLBOX P0-A) |
| `repo-metadata` | `repo-metadata` | hourly :13 | `{items: [{fullName, stars, language, ...}]}` | Per-repo GH GraphQL enrichment. **Reads the registry as of 2026-05-27.** |
| `repo-profiles` | `repo-profiles` | hourly :41 | `{profiles: {fullName: ...}}` | AISO scan queue + surface extraction. TOP_LIMIT=20 (env-gated). |
| `consensus-trending` | `consensus-trending` | hourly :50 | `{items: [{fullName, ...}]}` | Cross-signal ranked list. Top 200. |
| `consensus-verdicts` | `consensus-analyst` | hourly :00 | `{items: [{fullName, verdict, ...}]}` | LLM verdicts (Kimi K2.6 + NanoGPT fallback). TOP_N=14. |
| `hackernews-repo-mentions` | `hackernews` | hourly | `{mentions: {full: {stories[]}}}` | Per-repo HN stories (last 7d). |
| `reddit-mentions` | `reddit` | hourly | `{mentions: {full: {posts[]}}}` | Per-repo Reddit posts (sparse — OAuth burned). |
| `bluesky-mentions` | `bluesky` | hourly | `{mentions: {full: {posts[]}}}` | Per-repo Bluesky posts. |
| `devto-mentions` | `devto` | every 6h | `{mentions: {full: {articles[]}}}` | Per-repo dev.to articles. |
| `lobsters-mentions` | `lobsters` | hourly | `{mentions: {full: {stories[]}}}` | Per-repo Lobsters stories. |
| **`repo-registry`** | **`repo-registry`** | **hourly :47** | **`{version, writtenAt, count, repos: {lowerFull: RegistryEntry}}`** | **THE persistent accumulator. Cap 2000 LRU.** |
| **`mentions-ledger`** | **`mentions-ledger`** (flatten) | **4×/hour** | **`{entries: MentionsLedgerEntry[], writtenAt}`** | **Per-repo lifetime per-source counts (read-then-merge).** |
| `repo-mentions-detail-rollup` | `cross-source-sweep` | daily 06:00 | `{repos: {full: {perSource: {count7d, countLifetime, top[≤5]}}}}` | Cross-source mention DETAIL (chart markers + per-source pip boost). |

Plus the raw SADD sets backing the ledger: `ss:mentions:v1:<owner>/<name>:<source>` (mention IDs) and `ss:mentions:v1:<owner>/<name>:_index` (hash: source→count).

## Count semantics (the canonical answer)

There is **one** function for every "tracked repo count" display: **`getDerivedRepoCount()`** in [src/lib/derived-repos.ts](../src/lib/derived-repos.ts).

Already-fixed display surfaces (do not regress):
- `src/components/trending/TrendingHubHero.tsx` — hero `TRACKED LIVE` tile
- `src/components/shell/Statusbar.tsx` — footer REPOS cell
- `src/components/trending/KpiStrip.tsx` — KPI strip
- `src/app/preview/page.tsx` — preview hero + tile footer

**Do not use** `getTrackedRepoCount()` from `src/lib/trending.ts` — it reads only `data/trending.json` (cold seed, ~732). It exists for back-compat callers only; new code should not reach for it.

`/api/pipeline/status.totalRepos` and `/api/repos` already return the registry-inclusive count.

## How a dropped repo stays alive

1. Repo enters `trending` at oss-trending tick (say :22).
2. `repo-registry` (next :47) absorbs it into `ss:data:v1:repo-registry` with `firstSeenAt = lastSeenAt = now`, `lastSource = 'trending'`.
3. Time passes. Repo drops from OSSInsight trending → next `trending` write has fewer rows.
4. `repo-registry` next run: trending pass doesn't refresh this entry, but fill-only passes from `repo-metadata` / `consensus-trending` keep its `lastSeenAt` fresh if it's still in those. If absent everywhere, `lastSeenAt` stays at the last-seen timestamp — and the entry **remains** in the registry until LRU cap pressure evicts it (cap = 2000, sorted by `lastSeenAt`).
5. App `getDerivedRepos()` unions the registry (after trending/recent/manual, skipping seenFullNames). The dropped repo enters the derived collection with last-known stats.
6. `repo-metadata` (now registry-aware) re-fetches stars/lang/description/topics on its next hourly run → cell-level data stays fresh for the dropped repo.
7. `cross-source-sweep` tertiary tier sweeps registry repos for mentions (after trending + consensus budget) → mention markers + cross-source detail keep accruing.
8. Profile page at `/repo/<owner>/<name>` resolves the dropped repo (`getDerivedRepoByFullName` hits the registry-inclusive map). HTTP 200 instead of 404.

## How a mention stays lifetime (never drops on re-sweep)

There are now **three** lifetime-aware paths into `repo.mentions.perSource[channel].count` (the number the pip renders):

1. **Bundled source-first walkers** (decorator, line ~380–440): `hn.stories?.length`, `dv.articles?.length`, `bs.posts?.length`, etc. These are last-7d windowed at the source — count = "captured-in-the-7d-window".
2. **Cross-source-sweep `countLifetime`** (line ~529): the sweep merges `existing.countLifetime` and `fresh.count7d` per (repo, source) and **keeps the max** — monotonic floor, never drops. Covers twitter/tavily/producthunt where the ledger has no set.
3. **Mentions ledger** (line ~547, NEW 2026-05-27): for the 5 SADD-deduped channels (hackernews, reddit, bluesky, devto, lobsters), the ledger holds the **exact cumulative count**. The decorator takes `max(current, ledgerCount)` → ledger wins as the true lifetime for those 5 channels.

`count24h` and `count7d` remain windowed (scoring + the "Mentions" sort depend on them). `mentionCount24h` = sum of all `count24h` (unchanged). Only the lifetime `count` is folded.

The ledger snapshot is **read-then-merge** at the worker: each run flattens touched repos' `_index` hashes; untouched repos retain their last flattened entry. So even repos that haven't had a mention for weeks keep their lifetime count visible — until their cumulative count is exceeded by fresh activity, in which case the new total is written.

## Auto-activation (Tavily, Apify Twitter)

The cross-source-sweep logs a WARN channel-status line every run:

```
hackernews:  live
bluesky:     live (or no-creds (BLUESKY_HANDLE/APP_PASSWORD))
producthunt: snapshot (or no-snapshot)
tavily:      off (set TAVILY_API_KEY)   ← flips to "live" when key drops in
twitter:     off (set APIFY_API_TOKEN)  ← flips to "apify·top40" when key drops in
foldIn:      devto,hackernews,reddit,lobsters,bluesky
```

Operator action: drop `TAVILY_API_KEY` and/or `APIFY_API_TOKEN` into `/opt/toolbox-trendingrepo-worker/.env` and `docker compose up -d`. Next sweep activates the channel — no code deploy. Twitter via Apify is **bounded**: one batched `apidojo~tweet-scraper` actor run per sweep covering the top-40 repos (not 150 per-repo runs) → cost-controlled.

`APIFY_API_TOKEN` also re-enables the Apify residential proxy elsewhere (could unblock Reddit collection — costlier, weigh first).

## Cache invalidation (the wiring that makes it all live without redeploys)

`getDerivedRepos()` is `React.cache` + a process-global `_cache` keyed by `computeCacheKey()` — a colon-joined string of `getXxxDataVersion()` outputs (one per upstream). A 5-second floor caps re-stat frequency.

A new redis loader **MUST** add its data-version to that join, or its updates never invalidate the assembled `Repo[]`. Currently in the join (in order):

```ts
[
  getRedditDataVersion(),
  getManualReposDataVersion(),
  getTwitterSignalsDataVersion(),
  getPipelineReposDataVersion(),
  getCrossSourceMentionsDataVersion(),
  getRepoRegistryDataVersion(),       // ← added 2026-05-27
  getMentionsLedgerDataVersion(),     // ← added 2026-05-27
  getRepoMetadataFetchedAt() ?? "",
]
```

Each `getXxxDataVersion()` returns the data-store reader's `writtenAt` (or file mtime for legacy file-backed readers). When the worker writes a new redis payload, the next refresh hook in the render path swaps the in-memory cache + the `writtenAt` changes → next request crosses the 5s floor → new key → recompute. No redeploy.

## What's still thin (the hardening tail)

Registry-only / dropped repos resolve and render, but these sections degrade gracefully because no per-repo enricher reads the registry yet:

| Section | Cell | Status | Lever |
|---|---|---|---|
| Star history chart | "Star history warming" placeholder | needs star-activity worker fetcher (legacy scripts only) | port to worker, read registry top-N |
| Org/community card | "—" for FOUNDED/LOCATION/MEMBERS/etc. | `repo-community-profile` is on-demand only | new worker fetcher, batch hourly |
| AI verdict | synthesized fallback | `consensus-analyst` TOP_N=14 | bump TOP_N + LLM budget |
| AISO scan strip | "no_website" / "scan_pending" | `repo-profiles` PROFILE_ENRICH_LIMIT=20 | bump + read registry |
| Mention markers on chart | silently absent | `cross-source-sweep` TOP_N=150 budget tight | bump TOP_N or twice-daily |
| Related repos card | "No cross-source related repos detected" | needs registry-aware related compute | hide card when empty |

See [DEPLOY-TOOLBOX.md](./DEPLOY-TOOLBOX.md) for the prioritized TODO + cost table.

## Operator probes (read-only, fast)

```bash
# Authoritative count
ssh toolbox 'curl -s http://localhost:3023/api/pipeline/status | grep -oE "\"totalRepos\":[0-9]+"'

# Redis slug coverage (one-shot)
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node -e "
const {readDataStore}=require(\"/app/dist/lib/redis.js\");
(async()=>{
  for (const k of [\"repo-registry\",\"repo-metadata\",\"mentions-ledger\",\"repo-mentions-detail-rollup\",\"trending\",\"recent-repos\",\"consensus-verdicts\",\"consensus-trending\"]) {
    const d = await readDataStore(k).catch(()=>null);
    const n = d?.count ?? d?.items?.length ?? d?.entries?.length ?? (d?.repos?Object.keys(d.repos).length:0) ?? 0;
    console.log(k.padEnd(32), n);
  }
})();
"'

# Channel-status of the last sweep (WARN level, daily 06:00)
ssh toolbox 'docker logs toolbox-trendingrepo-worker-1 2>&1 | grep -a "channel status" | tail -1'

# Profile of a known-dropped repo (was 404 before the registry)
curl -sI https://trendingrepo.com/repo/brendanhogan/hermitclaw  # → 200, Server: cloudflare
```

## Anti-patterns (already burned)

- **Do not** add `readFileSync` for new data sources. Always use the data-store-reader / readDataStore pattern.
- **Do not** treat any `.data/*.jsonl` as durable in prod (the app container has no volume mount).
- **Do not** re-add live Reddit public JSON or dev.to `feed_content` per-repo searches from the worker — both are dead from the TOOLBOX VPS IP. The source-first snapshots + the ledger cover Reddit/dev.to.
- **Do not** use `getTrackedRepoCount()` for any user-facing count surface (cold trending-only seed).
- **Do not** widen `oss-trending` languages to chase a higher count — it dilutes the "everything AI" focus with non-AI repos. The registry accumulates organically; widen only after operator sign-off.
- **Do not** `git checkout <commit>` (full) on the box — it resets the app `docker-compose.trendingrepo.yml`'s sed'd image tag to a non-existent `vps-v1`. Use `git checkout <commit> -- apps/trendingrepo-worker/src/ src/` (selective).
- **Do not** bump `consensus-analyst` TOP_N without surfacing the LLM cost — Kimi K2.6 + NanoGPT fallback both incur per-call cost.

## References

- [DEPLOY-TOOLBOX.md](./DEPLOY-TOOLBOX.md) — deploy mechanics + the prioritized hardening TODO
- [INGESTION.md](./INGESTION.md) — collector cadence + dual-write helper (Redis-as-truth)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — broader data-flow diagram (the registry is the persistence layer on top)
- Memory: `~/.claude/projects/c--dev-trendingrepo/memory/project_repo_registry_and_lifetime_mentions.md`
- Memory: `~/.claude/projects/c--dev-trendingrepo/memory/project_cross_source_sweep_design.md`
- Plan: `~/.claude/plans/handover-2026-05-27-trendingrepo-hardening.md` (the running TODO for the hardening tail)
- Commits (branch `bot/swarm-a6-producthunt-reader`): `e59c9b1` (sweep), `e3bff6a` (gzip), `a19abb8` (auto-activation), `89e8bd0` (WARN logs), `eba6fe7` (registry+ledger), `1c72513` (count+metadata)
