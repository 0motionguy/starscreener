# StarScreener — Data Source Matrix

**Scope:** every external data source the code path currently touches, on any surface (ingestion, detail view, scoring, social enrichment).

---

## The real wire, in one sentence

100% of ingestion is **native `fetch`** against `api.github.com` through `src/lib/pipeline/adapters/github-adapter.ts` (repo / release / contributors / rate_limit endpoints), with two ancillary backfill paths hitting `/stargazers` and `/events`. Social signals (HN Algolia, Reddit public JSON, Nitter RSS, GitHub code-search) are **live but on-demand only** — fired per detail-page request, never persisted to `.data/mentions.jsonl` (which is empty on disk).

---

## Source matrix

| # | Source | Wire | Auth | Rate limit | Called from | Retry / backoff | Cached? | Latency today | Failure mode | Cost @1x | Cost @10x | Cost @100x |
|---|--------|------|------|------------|-------------|-----------------|---------|---------------|--------------|----------|-----------|------------|
| 1 | **GitHub REST /repos/:o/:r** | REST | Single PAT (`GITHUB_TOKEN`) | 5000/hr (shared) | `github-adapter.ts:42-73` via `/api/cron/ingest` | 3 attempts, exp backoff 1s→2s on 429/5xx; 403 not retried; reads `X-RateLimit-Remaining` + `Reset` | no ETag, no If-Modified-Since, no local cache | manual only (no cron) | log+null; caller sees degraded data, no exception, no Sentry | $0 | $0 | quota infeasible on one PAT — needs token pool or GH App |
| 2 | **GitHub REST /repos/:o/:r/releases/latest** | REST | same PAT | same | `github-adapter.ts:75-104` | same as #1 | none | manual only | same | $0 | $0 | same cliff |
| 3 | **GitHub REST /repos/:o/:r/contributors?per_page=1** | REST | same PAT | same | `github-adapter.ts:106-125` | same as #1 | none | manual only | 403 → return 0 (silent) | $0 | $0 | same cliff |
| 4 | **GitHub REST /rate_limit** | REST | same PAT | separate bucket | `github-adapter.ts` + `/api/pipeline/status` | none needed | live on every `getRateLimit()` call | on-demand | log only | $0 | $0 | $0 |
| 5 | **GitHub REST /repos/:o/:r/stargazers** | REST (paginated) | same PAT | 5000/hr shared | `stargazer-backfill.ts`, `/api/cron/backfill-top` | per-page same as #1 | none | manual only | **HARD CAP at 400 pages (≈40k stars)** — mega-repos invisible | $0 | $0 | same cliff |
| 6 | **GitHub REST /repos/:o/:r/events** (mega-repo fallback) | REST (paginated) | same PAT | 5000/hr shared | `events-backfill.ts:103`, `/api/pipeline/rebuild` (commit 77a9cc5) | **`if (!res.ok) break` — silent truncation, no log, no counter** | none | manual only | reports partial as success — correctness hazard | $0 | $0 | same cliff |
| 7 | **HN Algolia** (`hn.algolia.com/api/v1/search`) | REST | none | generous | `hn-adapter.ts`, called from `/api/repos/[owner]/[name]` detail route | try/catch + empty list on failure | none | on-demand only | fail-soft: mentions absent | $0 | $0 | $0 |
| 8 | **Reddit public JSON** (`www.reddit.com/search.json`) | REST | none | tight, 429-prone on unauth | `reddit-adapter.ts`, detail route | try/catch + empty list | none | on-demand only | fail-soft; at 100x, rate-limited constantly | $0 | maybe $0 | likely needs OAuth |
| 9 | **Nitter RSS** | scrape (RSS) | none | varies per mirror | `nitter-adapter.ts`, detail route | 4 hard-coded public mirrors probed **once at module load**; if all down, `TWITTER_AVAILABLE=false` for the lifetime of the process | none | on-demand only | twitter section **hidden** (not faked) per no-mock rule — honored | $0 | $0 | fragile; mirror churn is chronic |
| 10 | **GitHub code-search** | REST | same PAT | **10/min** (search-specific, much tighter than 5000/hr) | `github-search-mentions`, detail route | try/catch + empty list | none | on-demand only | fail-soft | $0 | $0 | hot path will 429 |

---

## Critical observations

### Single point of failure: one `GITHUB_TOKEN`
Every row above that authenticates (1, 2, 3, 4, 5, 6, 10) depends on the same PAT. Revocation kills ingest + both backfills + GH code-search mentions simultaneously. No token pool, no fallback App, no rotation logic.

### Second SPOF: Nitter mirrors
4 community-hosted mirrors are probed **once at module load**. No self-healing, no retry-next-mirror-later, no periodic recheck. A permanent mirror churn (which is the norm for Nitter) silently disables Twitter mentions for the lifetime of the process.

### The 40k-star cap is the biggest correctness bug
Stargazer listing caps at 400 pages (≈40k stars). Mega-repos (`ollama/ollama`, `langchain-ai/langchain`, `huggingface/transformers`, `vercel/next.js`, any repo in the seed over 40k stars) cannot have history reconstructed retroactively. Of 309 seeded repos, **only 13 have real stargazer history** in `.data/snapshots.jsonl`; the remaining **296 carry flat-zero sparklines** and spurious momentum scores. The README says these repos show `Collecting history` — in practice, the daily snapshot cron that would build forward history isn't scheduled, so they stay zero.

### The Events API fallback (commit 77a9cc5) half-exists
`/api/pipeline/rebuild` + `events-backfill.ts` were added specifically for mega-repos. The code is correct in happy path, but on any non-2xx from `/events` it silently `break`s out of pagination with **no log and no counter** — so the outer cron reports success on partial data. This failure mode is observed in practice during GitHub degraded-service windows.

### The "no-mock rule" is honored at construction — partially defeated in presentation
`createGitHubAdapter` throws at construction time if `useMock=true` without `STARSCREENER_ALLOW_MOCK=true` — a real runtime guard (`src/lib/pipeline/ingestion/ingest.ts:236-258`). **Good.** But `RepoChart.tsx:60-87` fabricates forks/contributors curves by scaling the star sparkline, `SnapshotDelta.commitsInWindow` is hardcoded 0, and the rank-change arrow is synthesized from movement status. The no-mock rule applies to the ingestion layer but not to the render layer — same sin, different floor.

### Social sources are live-on-demand only — never indexed
`hn`, `reddit`, `nitter`, `github-search-mentions` fire per-detail-page. `.data/mentions.jsonl` is empty; `.data/mention-aggregates.jsonl` is empty; `score.socialBuzzScore = 0` and `score.mentionCount24h = 0` for every single one of 309 stored scores. The "anti-spam dampening" and "social buzz" components of the momentum score are dead inputs today. _See `trend.json` for the downstream impact._

---

## Latency estimates (source → stored in DB)

Because there is no scheduler wired, the honest number is **"∞ until an operator hits `npm run ingest:hot`"**. If the declared policy (`DEFAULT_POLICIES.hot.intervalMinutes=60`) were enforced:

| Stage | Range | Dominant factor |
|-------|-------|-----------------|
| A — GitHub event → visible in GitHub REST | 1–60 s | GitHub's edge cache (out of our control) |
| B — GitHub API → cron fires | 0 – 86,400 s | **scheduler not wired** → infinite; even if wired, hot=60min, warm=6h, cold=24h |
| C — Cron fetch → snapshot appended | 5–30 s | 3 API calls per repo × ~200ms + JSONL append |
| D — Snapshot → recompute → score written | 1–10 s | `recomputeAll` is synchronous over 309 repos at end of batch |
| E — New score → UI sees it | 0–15 s | SSE emit on Railway is sub-second; any non-SSE surface waits for next fetch |

**End-to-end p50 today: ~24 hours. p95: ~7 days.** Cached in `latency.json`.

---

## Cost model

At current 1x (309 seed repos, manual cron, no mentions persistence): **$0/month**.

At 10x (~3000 repos on a 5-min hot cadence):
- Railway: ~$7-20/mo depending on instance size
- PAT quota: burns ~80% of 5000/hr at hot-pass peaks — still within budget
- Still no LLM inference cost (classifier is rule-based)

At 100x (~30,000 repos):
- **Single PAT is infeasible.** Need a token pool (10-20 PATs) or a GitHub App (15,000/hr per installation).
- **JSONL storage blows up** — `snapshots.jsonl` reaches ~1.4GB, cold-start `readFile + JSON.parse` OOMs a 512MB instance. Postgres migration becomes mandatory (scaffold already exists at `src/lib/db/schema.ts:112`).
- Events API path becomes the primary history source — 40k-star cap renders stargazer listing irrelevant for most of the catalog.

---

## Recommended source swaps

1. **Add the GitHub Events firehose** as a real source (not just a mega-repo fallback). `/api/pipeline/rebuild` already does this; promote it to a scheduled 5-min pull for the top-N watchlist. Sub-minute detection becomes feasible for watchlisted repos.

2. **Add ClickHouse / GH Archive as a cold-tier historical source.** Would give a real historical depth story (matching OSSInsight), independent of the stargazer listing cap. Cost: a few $/mo on a public ClickHouse deployment; the math is well-documented.

3. **Switch Nitter to `nitter-mirrors` rotation with periodic revalidation** rather than once-at-module-load. Or accept the degradation and remove Twitter entirely from the "verified source" claim.

4. **Introduce a token pool abstraction** (array of PATs, round-robin with per-token rate-limit tracking) before hitting 10x. Trivial on the existing adapter.

5. **Persist social mentions** — fire the on-demand adapters during ingestion, not only on detail-page hit. Deduped by `(source, url)`. Populates the currently-dead `socialBuzzScore` component.

---

**Detail trace:** `starscreener-inspection/sources.json` (28 KB — includes schema-level evidence and file:line anchors).
