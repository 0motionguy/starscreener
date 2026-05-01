# STARSCREENER

Real-time trend-discovery scanner. Aggregates signals from 8+ sources, computes scoring + classification, surfaces breakout repos before they go mainstream.

This glossary is the shared language between the codebase and the people working on it. Use these terms exactly. When code drifts from the glossary, the glossary wins (or we update it via `/grill-with-docs`).

## Language — Signals

**Signal**:
A normalized cross-source record (`SignalItem` in `src/lib/signals/types.ts`) — source, source-prefixed id, title, url, postedAtMs, optional `linkedRepo`, tags, raw engagement, normalized 0..100 signalScore. The synthesis layer (Consensus, Volume, Tag-Momentum) operates only on Signals.
_Avoid_: raw upstream payload (call those "raw <source> data"); TwitterRepoSignal; FundingSignal; "ingestion record"

## Language — Scoring

**Score**:
A `RepoScore` (`src/lib/pipeline/types.ts:164`) — per-repo, always 0..100 `overall`, with `components`, `weights`, `modifiers`, `isBreakout`, `isQuietKiller`, `movementStatus`, and `explanation`. Produced by the pipeline scoring engine at `src/lib/pipeline/scoring/engine.ts` via `scoreBatch(repos)`.
_Avoid_: "momentum score" (component, not the whole), "the trending number"

**Score component**:
A named contributor to a Score's `overall` (e.g. Momentum, Consensus). Component values feed weighted aggregation but are never themselves "Scores."
_Avoid_: calling a component a Score

**Score modifier**:
A boost or penalty applied to a Score after components are aggregated.
_Avoid_: "filter," "rule"

## Language — Classification

**MovementStatus**:
The finite-state classification on a RepoScore (`breakout | hot | rising | steady | declining | quiet | dormant`). Single state per repo per scoring run.
_Avoid_: "status," "state," "trend"

**Breakout**:
A repo whose pipeline `RepoScore.movementStatus === "breakout"` (equivalently `isBreakout === true`). Single-channel highest-momentum classification.
_Avoid_: "trending repo," "hot," "viral"

**Cross-Signal Breakout**:
A repo where ≥3 of the **6** cross-signal channels (github, reddit, hn, bluesky, devto, **twitter**) are firing simultaneously. Computed in `src/lib/pipeline/cross-signal.ts`. Multi-channel social validation.
_Avoid_: bare "breakout" when context is multi-channel

**Quiet Killer**:
Classification on RepoScore (`isQuietKiller: boolean`) for high-quality repos that haven't yet broken out — sustained activity without velocity signature. Mutually exclusive with Breakout.
_Avoid_: "underrated," "hidden gem"

## Language — Trending Consensus (cross-ranking agreement)

**Trending Consensus**:
The cross-ranking agreement engine in `src/lib/consensus-trending.ts`. Compares our `"ours"` ranking against 8 weighted external rankings. Output: `ConsensusTrendingPayload`. **"Consensus v3"** (shipped 2026-04-30, PRs #51 + #52).
_Avoid_: bare "Consensus" (ambiguous)

**External Source** (in Trending Consensus):
One of 8 ranked external services. Canonical short codes:

| Code | Service | Default weight |
|---|---|---|
| `gh` | GitHub trending | 0.20 |
| `hf` | HuggingFace | 0.18 |
| `hn` | Hacker News | 0.16 |
| `x` | X (Twitter) | 0.14 |
| `r` | Reddit | 0.10 |
| `pdh` | ProductHunt | 0.08 |
| `dev` | Dev.to | 0.08 |
| `bs` | Bluesky | 0.06 |

Sum = 1.00.
_Avoid_: "feed," "channel" (we use Channel for Cross-Signal Breakouts only)

**Internal Source**:
The string `"ours"` — our own ranking; recorded as `oursRank` for divergence computation.

**ConsensusItem**:
Atomic unit of Trending Consensus. Carries `consensusScore`, `confidence` 0–100, `sourceCount` 0–8, `oursRank`, `externalRank`, `maxRankGap`, `verdict: ConsensusVerdictBand`, per-source `Record<ConsensusSource, ConsensusSourceComponent>`.

**ConsensusVerdictBand**:
The **algorithmic** verdict: `strong_consensus | early_call | divergence | external_only | single_source`. **Distinct from AnalystVerdict.**

**ConsensusBadge** (deprecated):
Legacy 3-source badge union. Worker no longer emits these on fresh payloads.

## Language — Story Consensus

**Story Consensus**:
The cross-source story-grouping engine in `src/lib/signals/consensus.ts`. Same story across ≥N distinct Signal sources. Output: `ConsensusStory[]`. **Independent of Trending Consensus** — operates on Signals, not rankings.

## Language — Consensus Verdict (K2.6 analyst layer)

**Consensus Verdict** (the payload):
A `ConsensusVerdictsPayload` (`src/lib/consensus-verdicts.ts`) — K2.6-generated analyst report on top of Trending Consensus. Two surfaces: `ribbon` (pool-level) + per-repo `items: Record<fullName, ConsensusItemReport>`.

**ConsensusItemReport**:
Per-repo K2.6 analyst record: `summary`, `scores: ConsensusSignalScores`, `evidence: string[]`, `contrarian`, `verdict: AnalystVerdict`, `confidence`, `whyNow`, `whatToDo: AnalystAction`, `whatToDoDetail`.

**ConsensusSignalScores**:
6-axis LLM-judged: `momentum`, `credibility`, `crossSource`, `developerAdoption`, `marketRelevance`, `hypeRisk`. Each 0–100. **Distinct from `RepoScore.components`** — LLM judgments, not pipeline-computed.

**AnalystVerdict**:
K2.6 narrative call: `strong | early | weak | noise`. **Different from ConsensusVerdictBand** (5 algorithmic bands).

**AnalystAction**:
`watch | build | ignore | research`. Defaults to `watch`.

**ConsensusRibbonReport**:
Pool-level summary `{ headline, bullets[4..6], poolNote? }`.

**K2.6**:
Shorthand for "Kimi For Coding" — the LLM behind Consensus Verdicts. Endpoint `api.kimi.com/coding/v1`. Streaming-only; UA allowlist (`claude-cli`, `RooCode`, `Kilo-Code`). ~80s per call → bounded concurrency. `generator: "kimi" | "template"` distinguishes K2.6 output from fallback.

## Language — Synthesis Axes (Volume / Topic / Tag-Momentum)

Three orthogonal axes the synthesis layer renders from `SignalItem[]`. **Don't conflate them.**

**Volume** (the time axis):
24-hour UTC hourly bucketing of Signal counts per source. Lives in `src/lib/signals/volume.ts`. Output: `VolumeSummary` with `HourBucket[24]`, `peakHour`, `quietHour`, `dominantSource`, `changePct` (vs prior 24h). Powers `VolumeAreaChart`'s "01 SIGNAL VOLUME" panel — stacked-area chart with one band per source.
_Avoid_: "signal count" (use "Volume"); "activity"; "chatter level"

**Topic** (the broad-classification axis):
One of **4 fixed buckets** — `agents | models | devtools | research`. Lives in `src/lib/signals/topics.ts`. Computed by regex patterns matching a Signal's title + tags. **Multi-membership is intentional**: an "agent that uses a model" hits both AGENTS and MODELS. Powers the cross-source filter bar (chip group).
_Avoid_: "category" (we use that for repo categorization, separate concept); "section"; "topic chip" without qualifier

**TopicKey**:
The string-literal type — `"agents" | "models" | "devtools" | "research"`. URL-safe lowercase form. Surfaces as `?topic=<key>` query param.
_Avoid_: using the human label (`"AGENTS"`) as a key — labels are render-time only

**Tag-Momentum** (the granular-tag × time axis):
Per-tag rate-of-change heatmap for narrow tags (`#claude-skills`, `#o3`, `#langchain`). **Different granularity than Topic** — Topics are 4 fixed broad buckets; tags are dynamic and unbounded. Source: tag fields on `SignalItem.tags`. Surface: `TagMomentumHeatmap` component. Comment in `topics.ts` is explicit: *"Granular sub-topic filtering happens via the tag-momentum heatmap, not the chips."*
_Avoid_: "tag list" (we want the velocity, not the inventory); "topic momentum" (Topics ≠ Tags)

## Language — TrustMRR

**TrustMRR**:
Third-party service at `trustmrr.com` tracking startup Monthly Recurring Revenue. **Always external** — we have no MRR data of our own. Capital MRR matches the brand. STARSCREENER consumes TrustMRR five distinct ways; never collapse them.
_Avoid_: bare "MRR" (we don't have our own); "the revenue catalog" (vague)

**TrustMRR external ranking**:
The `tr` shortcode in Trending Consensus (weight 0.06). Lives in `consensus-trending.ts`.

**TrustMRR catalog**:
Local cached copy of TrustMRR's startup directory at `data/trustmrr-startups.json` (~7MB). Hydrated by `scripts/sync-trustmrr.mjs`. Use `getTrustMrrMeta()` (`src/lib/revenue-startups.ts:267`) for counts without pulling the 7MB blob; the leaderboard surface fetches the full catalog.
_Avoid_: "startup directory," "revenue list"

**TrustMRR sync**:
The inbound pipeline that hydrates the catalog. Runs via `.github/workflows/sync-trustmrr.yml`. **Two modes** selected by `selectTrustmrrSyncMode({ eventName, hourUtc })`:
- **`full`** — 02:27 UTC daily schedule. Full catalog sweep against TrustMRR's API.
- **`incremental`** — every other hour. No API calls; lightweight delta-check.
Drift between scheduler + workflow `case` guarded by `scripts/__tests__/trustmrr-sync-mode.test.mjs`.
_Avoid_: "trustmrr scrape," "trustmrr fetch" (we sync, we don't scrape)

**TrustMRR profile URL**:
Canonical outbound link `https://trustmrr.com/startup/<slug>`. Built via `trustmrrProfileUrl(slug)` in `src/lib/trustmrr-url.ts`. Slug normalization accepts bare slugs, canonical URLs, the short `/s/<slug>` alias, query strings — but ALWAYS emits the `/startup/<slug>` form.
_Avoid_: emitting `/s/<slug>` URLs (works but not canonical); building TrustMRR URLs by hand

**Revenue submission** (separate concept, ours):
A user-submitted revenue claim in STARSCREENER's intake flow (`src/lib/revenue-submissions.ts`). May include a `TrustMrrLinkSubmission` (extends `RevenueSubmissionBase`) linking to a TrustMRR slug — but the submission record itself is ours, not TrustMRR's.
_Avoid_: conflating with TrustMRR — the submitted claim isn't pulled FROM TrustMRR; the user CHOSE to link

## Language — Data Architecture

**Data-store**:
The `DataStore` abstraction in `src/lib/data-store.ts` — the **single read path** for 30+ cron-driven payloads. Backend auto-selected: `REDIS_URL` (Railway) or Upstash REST or no-Redis fallback. See [ADR-0001](docs/adr/0001-three-tier-data-store.md).

**Tier**:
One of `redis | file | memory | missing`. Fixed order: Redis → bundled file → in-memory last-known-good → missing.

**Three-tier read**:
**Redis** (truth) → **bundled file** (`data/<key>.json`, deploy artifact + DR snapshot) → **memory** (last-known-good per process). `read()` NEVER throws and NEVER returns null when ANY tier has data.

**`fresh`** (on DataReadResult):
`true` only when Redis served the read.

**`writtenAt`** (on DataReadResult):
ISO timestamp set when `source === "redis"`. Upstream Redis truth, NOT local fetch time.

**Refresh hook**:
The convention for pulling fresh payload into a per-module sync cache. Every reader exports `refreshXxxFromStore(): Promise<RefreshResult>` that (1) dedupes via `inflight: Promise | null`, (2) rate-limits to 30s via `MIN_REFRESH_INTERVAL_MS`, (3) updates module-level `cache` on success, (4) leaves cache untouched on failure. Reference: `refreshTrendingFromStore` in `src/lib/trending.ts:190`.
_Avoid_: "fetcher," "loader," inline `await store.read()` from a component

**Last-known-good**:
The value held in the memory tier per-process. Survives Redis brownouts, clears on lambda recycle. Updated only by successful Redis reads.

**ISR cache window**:
Next.js `export const revalidate = <seconds>`. Home `/` uses `revalidate = 1800` (30 min). Two staleness layers stack: ISR HTML cache + in-page refresh hook.

**`force-static` / `force-dynamic`**:
Per-route opt-outs from ISR.

**Namespace** (data-store keys):
Versioned prefix `ss:data:v1` (payload) + `ss:meta:v1` (write timestamps). Bumped on incompatible shape changes.

## Language — Funding (parallel pipeline, NOT Signals)

The funding subsystem runs **a parallel pipeline outside the cross-source synthesis layer.** Funding records never enter Trending Consensus, Story Consensus, Volume, or Tag-Momentum. The data shapes share names with Signal-side concepts but don't share semantics. Always qualify.

**Funding event** (the canonical conversation term):
A startup-funding occurrence we track — a round announcement, an acquisition, an IPO. Lives in `data/funding-news.json`. Source: `scripts/scrape-funding-news.mjs --enrich`. UI surface: `/funding`. **Funding events are NOT Signals** (they don't have a `linkedRepo` axis or feed cross-source synthesis).
_Avoid_: bare "Signal" in funding contexts; "deal" (we use "round" or "event")

**FundingSignal**:
The raw funding-event TypeScript shape (`src/lib/funding/types.ts:33`) — `{ id, headline, description, sourceUrl, sourcePlatform, publishedAt, discoveredAt, extracted, tags }`. **Misleading name** — kept for historical reasons but in conversation we call them "funding events" or "funding records" to avoid implying participation in Signal synthesis.
_Avoid_: bare "Signal" in conversation; "funding article"

**FundingSourcePlatform**:
The 9-source enum: `techcrunch | venturebeat | sifted | telegram | twitter | reddit | submit | yc | newsapi`. **Critical collision**: `twitter` and `reddit` here are funding-news sources (Twitter posts about funding rounds, Reddit threads about funding) — they are NOT the same as `SignalItem.SourceKey`'s `x` and `reddit` (which are general repo-mention signals). Different domains, same strings.
_Avoid_: cross-referencing with Signal `SourceKey` without explicit qualification — they don't speak the same language

**FundingExtraction**:
Structured fields extracted from a `FundingSignal`'s headline/body via regex — `{ companyName, companyWebsite, companyLogoUrl, amount, amountDisplay, currency, roundType, investors, investorsEnriched, confidence }`. **Nullable on FundingSignal** when regex couldn't parse. Confidence = `high | medium | low | none`.
_Avoid_: assuming extraction always exists; "funding metadata"

**FundingRound** (Phase 2):
The fully-structured funding round shape — Phase 2 of the funding subsystem. Distinct from `FundingExtraction` (regex'd from a single headline) — a Round may aggregate multiple Signals about the same event. Enriched investor lists, lead investor flag, etc.
_Avoid_: conflating with FundingSignal (raw) or FundingExtraction (regex'd)

**FundingRoundType**:
The 10-value enum: `pre-seed | seed | series-a | series-b | series-c | series-d-plus | growth | ipo | acquisition | undisclosed`. Used by both extraction + Phase 2 structured rounds.
_Avoid_: spelling round names without the enum (e.g. "Series A" → use `series-a`)

## Language — Repo Discovery & Enrichment

Three distinct data flows around repo state, each with its own cadence + output. **Don't conflate them.**

**Trending list**:
The main ranked leaderboard at `data/trending.json` (Redis key `trending`). Source: OSS Insight via `scripts/scrape-trending.mjs`. Shape: `TrendingFile { buckets: { period: { language: TrendingRow[] } } }` — periods include 24h/7d/30d, language axis includes `all`/`typescript`/`python`/etc. **Drives the home page leaderboard surfaces.** Cadence: 3h cron.
_Avoid_: "trending data" (vague — could mean any of the 4 flows below); "the OSS Insight feed" (implementation detail)

**Repo metadata**:
Canonical GitHub repo facts (`data/repo-metadata.json`) — stars, forks, openIssues, createdAt, updatedAt, pushedAt, defaultBranch, archived, disabled, fork, fetchedAt. Source: `scripts/fetch-repo-metadata.mjs` (GitHub GraphQL). Distinct from Trending — Trending knows ranked positions; metadata knows source-of-truth facts. Used to hydrate `RepoEntry` shapes in scoring + UI rendering.
_Avoid_: "repo info," "GitHub data" (vague)

**Fast Discovery**:
The flow that discovers newly-created repos NOT YET in our tracked set. Output: `data/recent-repos.json` (consumed via `src/lib/recent-repos.ts`'s `RecentRepoRow`). Source: `scripts/discover-recent-repos.mjs`. **Distinct from Trending** — Trending ranks already-known repos; Fast Discovery finds new candidates to admit. Feeds the intake pipeline.
_Avoid_: "recent repos" (matches the file name but ambiguous in conversation — could read as "repos that recently appeared in trending"); "new repo feed"

**Repo Profile**:
Per-repo enrichment dossier (`data/repo-profiles.json`) — deeper analytics including mention rollups, signal data, derived insights. Source: `scripts/enrich-repo-profiles.mjs`. Three enrichment modes:
- **`top`** — only the highest-ranked repos (fast, heavy use)
- **`catchup`** — fills in repos that haven't been profiled yet
- **`incremental`** — refreshes already-profiled repos that have aged out

The per-repo profile rendered at `/repo/[owner]/[name]` is built from this data + Trending + metadata + mentions, via `buildCanonicalRepoProfile()` in `src/lib/api/repo-profile.ts`.
_Avoid_: "repo dossier" (we don't use that term elsewhere); confusing with the **TrustMRR profile URL** (which is an outbound link, not our data)

**Unknown-Mentions Lake**:
The discovery pipeline at `data/unknown-mentions.jsonl` that captures mentions of GitHub repos NOT in the tracked set. Append-only. 10 social scrapers feed it via `appendUnknownMentions()`. Daily promote cron at 04:30 UTC compacts the lake into a ranked candidate list (`data/unknown-mentions-promoted.json`); admin UI at `/admin/unknown-mentions` triggers intake. **Sibling to Fast Discovery** but works on different signal: Fast Discovery finds new repos via direct discovery; the Lake finds new repos via social mention.
_Avoid_: "discovery lake" alone (be specific); "the lake" (overloaded — also informal team term for any aggregated data)

## Language — Ingestion Pipeline

**Ingestion Pipeline**:
The full subsystem turning external signals into rendered insights. Single canonical term at architecture level.
_Avoid_: ingestion network, ingest layer, scraper stack

**Collector network**:
Alias when scoping to ingest only.

**Collectors**:
Individual processes (scripts under `bin/`, `cli/`, `scripts/`, plus worker fetchers) pulling from a single source and writing a payload into the data-store. Plural umbrella within the **Ingestion Pipeline**.

**Direct mode**:
Collectors run via GitHub Actions: write to `.data/*.jsonl` and `data/*.json` locally, call `writeDataStore()` to push Redis, then `git push`. **Canonical mode.** See [ADR-0002](docs/adr/0002-direct-mode-collectors.md).

**API mode** (anti-pattern):
Vercel route-handler collectors. Filesystem ephemeral; writes vanish. Burned us in `edf99d2`. Don't reintroduce.

**Mirror-to-file** (`mirrorToFile: true`):
Optional `DataWriteOptions` flag. Disk file is **NOT** source of truth; it's DR snapshot + cold-start seed.

**Append-only JSONL**:
On-disk format for raw scan logs (`.data/*.jsonl`). Distinct from full-replace `data/*.json` snapshots.

## Relationships

- A **Signal** comes from exactly one of 8 sources (`hn | github | x | reddit | bluesky | devto | claude | openai`)
- A **Signal** may or may not link to a repo (`linkedRepo` nullable)
- **Funding events are NOT Signals** — parallel pipeline keyed on `FundingSignal`
- The pipeline scoring engine is the **single producer of Scores**
- A **Signal** contributes to a **Score** indirectly: Signals → synthesis (Consensus, Volume, Tag-Momentum) → Score components
- A **Breakout** has `movementStatus === "breakout"`. **Cross-Signal Breakout** uses Breakout as 1 of 6 inputs (the github channel)
- A repo is **either** Breakout **or** Quiet Killer (or neither) — mutually exclusive siblings
- **Trending Consensus** ≠ **Story Consensus** — different axes (rankings vs Signals)
- **TrustMRR** is one of 8 External Sources in Trending Consensus; ALSO a separate inbound-sync catalog; ALSO an outbound URL target. Don't conflate the surfaces.
- A **Trending Consensus** entry may carry a **Consensus Verdict** narrative (1 : 0..1)
- A **Consensus Verdict** is generated by **K2.6**
- Consensus Verdict + Trending Consensus are stored at separate data-store keys (`consensus-trending` / `consensus-verdicts`); refresh independently. **Verdict layer is optional** — Trending Consensus stands alone if K2.6 is down.
- The 8 **External Sources** in Trending Consensus are NOT the same set as the 8 sources in `SignalItem.SourceKey`
- **`ConsensusItem.confidence` is computed**, **`ConsensusItemReport.confidence` is LLM-judged**. Same name + range, different questions.
- A **Refresh hook** is the only sanctioned way to populate a module's cache
- A **Collector** writes to Redis (truth) and optionally the file (DR snapshot)
- **ISR cache** + **data-store memory tier** are independent staleness layers
- **Ingestion Pipeline** has two physical surfaces: (a) main repo collectors via GitHub Actions cron (canonical for arxiv, bluesky, devto, hackernews, funding, and 10+ others); (b) trendingrepo-worker Railway service for unique fetchers (consensus-trending, MCP usage). Where overlap exists, **main wins**.

## Flagged ambiguities

- "Signal" was used loosely for both `SignalItem` and source-specific upstream shapes — **resolved**: capital-S Signal = `SignalItem` only.
- Funding sits outside the Signal model intentionally.
- `src/lib/scoring.ts` (legacy `computeMomentumScore`) is **orphaned dead code** — zero external callers. Deletion candidate.
- Twitter has its own intermediate scorer at `src/lib/twitter/scoring.ts` — implementation detail of the Twitter signal builder, not a canonical Score.
- "Consensus" appears as bare term in three subsystems — **resolved**: never use bare "Consensus"; always qualify (Trending / Story / Verdict).
- **"Verdict" is overloaded** — `ConsensusVerdictBand` (5 algorithmic) vs `AnalystVerdict` (4 LLM-judged). **Resolved**: always qualify.
- **"Confidence" is overloaded** — `ConsensusItem.confidence` is computed; `ConsensusItemReport.confidence` is LLM-judged. Always qualify.
- **`ConsensusBadge` is deprecated** — kept only for compile compatibility.
- **"TrustMRR"** is overloaded across 5 surfaces (external ranking, catalog, sync pipeline, profile URL, dependency of revenue-submissions). Don't collapse them in conversation; always qualify when ambiguous.
- **`twitter` and `reddit` are overloaded across two enums** — `FundingSourcePlatform` (funding-news sources) and `SignalItem.SourceKey` (cross-source synthesis). Same strings, different semantics. Always qualify when discussing.
- **`FundingSignal` is misleadingly named** — kept for historical compatibility, but in conversation use "funding event" or "funding record" to prevent implying participation in cross-source synthesis.
