# StarScreener — Exhaustive Audit Report

**Date:** 2026-04-18 · **Scope:** read-only · **Repo age:** 1 day (14 commits on 2026-04-17) · **Subagents:** 11/11 completed

---

## TL;DR

StarScreener is a **well-architected 1-day-old prototype** that ships a convincing Dexscreener-style UI on top of an **almost-entirely-unfired pipeline**. The engine rooms are real — adapters, scoring math, alert engine, SSE bus, MCP server — but no cron is scheduled, no alerts are delivered, the AI classifier is persisted stale, 296/309 seeded repos carry flat-zero sparklines because of the 40k-star stargazer cap, and the status endpoint returns `200 OK` on a dead pipeline.

**Headline tier:** "hourly — de facto manual". **p50 event → UI ≈ 24h, p95 ≈ 7d.** Catches breakouts in progress: **No.** Alert delivery rate: **0%.** Observability: **D.** Estimated recall on OSSInsight's AI agent set: **~35% today** (ceiling ~75% with the existing rule set once data is fresh).

**The one fix that moves the needle hardest:** wire a real scheduler. Everything else unlocks downstream.

---

## Top 20 findings, ranked by (signal-quality × time-to-detect)

1. **No cron scheduler is wired in production.** `vercel.json` contains only a `/* → Railway` redirect. No `crons` block. No `.github/workflows/*cron*`. No `railway.toml` / `Procfile` / `nixpacks.toml` scheduler. The `/api/cron/ingest` endpoint works when pinged — nothing pings it. Evidence: `.data/snapshots.jsonl` has 304 lines but only **4** are real fetch-time points (one manual burst on 2026-04-17T07:53–07:57); the other 300 are synthetic `T23:59:59` backfill ticks. _Detail:_ `latency.json`.

2. **Alert delivery rate is 0%.** The 8-trigger engine + cooldown + SSE emit + 17 tests all exist and work. But there is no browser `EventSource`, no email sender (no `resend`/`nodemailer`/`sendgrid` dependency), no push, no webhook, no Slack/Telegram, no MCP alert tool, and no toast on fire. A user only ever sees an alert if they manually open `/watchlist` and the `AlertConfig` component remounts. Both `.data/alert-rules.jsonl` and `.data/alert-events.jsonl` are **empty**. _Detail:_ `alerts.json`.

3. **AI classifier is structurally correct but persisted stale.** All 309 entries in `.data/categories.jsonl` are timestamped `2026-04-17T11:07:48Z`, predating the "Fix AI-focus" commit (3d4c6d1). Every `anthropics/*`, `modelcontextprotocol/*`, `mem0ai`, `letta`, `openhands`, `continuedev`, `cline`, `smolagents`, `langgraph`, `pydantic-ai`, and ~30 other newly-seeded AI repos are **missing a persisted category**. Estimated recall today ~35%; ~55-65% after a fresh ingest pass; ~75% ceiling without new seeds. _Detail:_ `classifier.json`.

4. **296 of 309 seeded repos have flat-zero sparklines.** The 400-page / 40k-star GitHub stargazer cap makes mega-repos (`ollama/ollama`, `langchain-ai/langchain`, `huggingface/transformers`, `vercel/next.js`) invisible to the 30-day delta engine. Only 13 repos have real stargazer history in `.data/snapshots.jsonl`. The no-mock rule is technically honored, but **fabricated zero-deltas are the same sin in different clothing** — momentum scores on 96% of the seed are meaningless. _Detail:_ `sources.json`.

5. **`/api/pipeline/status` returns 200 OK on a dead pipeline.** No freshness gate, no 503 path, no `/api/health`. `lastRefreshAt` is pulled from real data (good) — but the endpoint doesn't compare it to `now()`. A health-checker points here and reports UP even after 3 weeks of stale data. _Detail:_ `observability.json`.

6. **`/api/search` is the first scale cliff.** `searchReposByQuery` does per-request `toLowerCase()` on `fullName + description + every topic` for every repo. ~3ms at 300 repos; 300ms+ at 30k with **no pagination and no offset**. Every other filter is O(1) via pre-baked deltas. _Detail:_ `filters.json`.

7. **`antiSpamDampening` never fires.** Code exists (`src/lib/pipeline/scoring/modifiers.ts:64-94`) but dampening = 1.0 in **every** row of `.data/scores.jsonl` across 309 repos. The author even admits at `modifiers.ts:67-74` that `forksDelta7d` is used in place of total forks. All three gates require large absolute spikes (>200 delta24 or >1000 stars) so small-repo vanity attacks are invisible. _Detail:_ `trend.json`.

8. **Pre-release tags fire `release_major` false positives.** `MAJOR_VERSION_RE` is substring-scanned with `[^0-9]` delimiters, so `langchain-core==1.3.0a3` matches. Already active in `.data/reasons.jsonl` line 2. _Detail:_ `trend.json`.

9. **Zero scoring-engine tests.** `npm test` passes 100/100, but none directly test `computeScore` / `detectBreakout` / `detectQuietKiller` / `logNorm` / the weight-sum invariant. Every scoring change ships blind. _Detail:_ `trend.json`.

10. **Rank-climber badge and filter disagree.** The meta pill counts `reason.codes.includes("rank_jump")`. The filter returns `rank <= 20`. Two different repos. _Detail:_ `filters.json`.

11. **`.data/mentions.jsonl` is empty.** Social adapters (HN Algolia, Reddit public JSON, Nitter RSS, GitHub code-search) are live but **on-demand only** — fired per detail-page request, never persisted. Every `mentionCount24h` in scoring is 0. Social buzz score is 0 across all 309 repos. _Detail:_ `sources.json` + `trend.json`.

12. **Rank-change arrow `▲N` is fabricated.** `columns.ts:97-115 deriveRankChange` synthesizes it from `movementStatus + starsDelta7d` magnitude. There is **no stored `previousRank`**. The "▲3" glyph does not mean a 3-place climb. _Detail:_ `truth.json`.

13. **`Δ24h stars` number can freeze indefinitely.** `SNAPSHOT_HISTORY_CAP = 120` at hot-tier 1h cadence evicts the 24h-old anchor inside ~5 days; `computeDelta('24h')` then returns null and `applyDeltasToRepo` silently preserves the prior value. _Detail:_ `truth.json`.

14. **`RepoChart` forks/contributors curves are fake.** Lines 60-87 of `RepoChart.tsx` scale them off the star sparkline shape. A footnote at line 316 admits it. Violates the README's "no-mock rule" claim. _Detail:_ `truth.json`.

15. **Cooldown is rule-global, not per-(rule, repo).** A global rule (repoId=null) firing against repo-A silences repo-B for the full cooldown. No test covers this. _Detail:_ `alerts.json`.

16. **`New` tab sorts by `lastCommit`, not `createdAt`.** The user asks for new projects, gets recently-active ones. _Detail:_ `filters.json`.

17. **Terminal `#1` uses the row index, not `repo.rank`.** The same repo shows `#1` in a stars-sorted table and `Rank #47` on its detail page. _Detail:_ `truth.json`.

18. **18 bare `} catch {}` sites silently swallow errors.** Cleanup, persist, rebuild, sidebar-data, backfill-history routes can throw internally and return a degraded response with **no log line**. Bugs become invisible. _Detail:_ `observability.json`.

19. **`events-backfill.ts:103` silently truncates on non-2xx.** `if (!res.ok) break` with no log, no counter. Mega-repo daily counts silently partial. _Detail:_ `observability.json`.

20. **Dead code and drift risks.** `src/lib/scoring.ts` (288 LOC) is superseded by `src/lib/pipeline/scoring/engine.ts` and has zero importers. `bin/ss.mjs` and `cli/ss.mjs` are **byte-identical 536-LOC duplicates** — two publishable packages that will drift. Top-level `undefined/` directory is a stray from a tool that received a literal `undefined` path. README line 14 still says "Live demo: TODO — no public deploy yet" while `vercel.json` + `docs/DEPLOY.md` reference live Railway+Vercel URLs. _Detail:_ `cartography.json`.

---

## Subsystem health matrix

| Subsystem        | Implemented | Scheduled | Delivering | Tested | Scale-safe | Grade |
|------------------|-------------|-----------|------------|--------|------------|-------|
| ingestion        | ✓           | ✗         | partial    | some   | ✗ (100x)   | C     |
| scheduler        | policy only | ✗         | —          | ✗      | —          | F     |
| stargazer backfill | ✓         | ✗         | partial    | ✗      | capped     | D     |
| events backfill  | ✓           | ✗         | silent trunc | ✗    | ✗          | D     |
| social mentions  | ✓           | on-demand | never persisted | ✗  | ✗         | D     |
| storage (JSONL)  | ✓           | —         | ✓          | ✗      | ✗ (100x)   | C     |
| scoring          | ✓           | —         | ✓          | ✗ engine | ✓       | C     |
| classifier       | ✓           | —         | ✓ but stale| partial| ✓          | C     |
| alerts engine    | ✓           | ✗         | ✗          | ✓ (17) | ✓          | C     |
| alerts delivery  | ✗           | ✗         | ✗          | ✗      | —          | F     |
| SSE stream       | ✓           | —         | no consumer| ✗      | ok         | C     |
| MCP server       | ✓           | —         | ✓          | ✗      | ok         | B     |
| CLI              | ✓           | —         | ✓          | ✗      | ok         | B     |
| UI               | ✓           | —         | ✓          | ✗      | ok         | B     |
| observability    | partial     | —         | partial    | ✗      | —          | D     |

---

## Ranked recommendations

1. **Wire a real scheduler** — GH Actions `*/5 * * * *` cron hitting `/api/cron/ingest?tier=hot`. p50 24h → 5-10 min; everything else unlocks.
2. **Shrink hot tier to a curated ~50-repo AI watchlist** — 100% refresh every 5 min; catches breakouts while in progress.
3. **Add freshness gate to `/api/pipeline/status`** — return 503 when `lastRefreshAt > 2h`. Point UptimeRobot at it. Real observability without an SDK.
4. **Add `EventSource` client in a root layout provider + sonner toast + bell badge** for `alert_triggered`. Uses the existing SSE pipe. Alert delivery 0% → real-time.
5. **Re-run full pipeline ingest** to rebuild `.data/categories.jsonl` with the current rule set (now includes claude-code / MCP / agent seeds). AI recall 35% → 55-65% with zero code change.
6. **Add MCP tools** `list_alerts`, `create_alert`, `subscribe_alerts` over SSE. Agent-native alert surface no competitor has.
7. **Fix `MAJOR_VERSION_RE`** to reject pre-release tags (`1.3.0a3`, `2.0.0-rc1`). Kills an actively-firing false positive.
8. **Cooldown scope → per-(rule, repo)** so global rules stop silencing unrelated repos.
9. **Migrate `snapshots.jsonl` → Postgres** using the existing scaffold at `src/lib/db/schema.ts:112`. Unblocks 10x.
10. **Add Resend sender** right after `evaluateAllRules` in `pipeline.ts`. `RESEND_API_KEY` already in the env schema.
11. **Reconcile rank-climber badge vs filter** — pick one source.
12. **Delete `src/lib/scoring.ts` + dedupe `bin/ss.mjs` vs `cli/ss.mjs`.**
13. **Remove `RepoChart` synthetic forks/contributors curves** — the README's "no-mock rule" demands it.
14. **Surface `X-RateLimit-Remaining` in StatsBar** — operator signal without an admin page.
15. **Register `/badge/:owner/:name.svg`** — viral distribution loop via README badges on rising AI repos.

---

## Known limitations of this audit

- **Moat scan competitor claims are unverified.** Web tools were blocked in the moat-scanner sandbox — every competitor claim in `moat.json` is tagged `LIVE_CHECK_REQUIRED` and must be re-verified against live URLs before external quotation. Re-run the moat-scanner with network access for authoritative numbers.
- **No GH Archive / BigQuery backtest.** Trend-engine false-positive/false-negative numbers are qualitative — based on code behavior + inspection of existing `.data/` state. A real historical backtest requires BigQuery access and was out of scope for a read-only audit.
- **No live production load profile.** All latency estimates are derived from declared cadences + snapshot timestamps; we did not hit any prod endpoint to avoid mutation risk.

See the per-subsystem JSON files under `starscreener-inspection/` for the full evidence trail.
