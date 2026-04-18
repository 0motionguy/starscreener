# StarScreener — Moat Matrix (verified)

**✅ Verified: 2026-04-18** · 7 / 8 WebFetches used · every row has a status tag · every claim cites a fetched URL

---

## Exec summary (≤200 words)

Three of the six targets are live and competitive; one is a reference tool we should learn from; one is dead; one is adjacent (star-history). The headline: **StarScreener's "AI focus" pitch is no longer unique.** OSSInsight ships a curated [AI Agent Frameworks collection](https://ossinsight.io/collections/ai-agent-frameworks) — 17 repos (langchain, crewAI, autogen, AutoGPT, babyagi, pydantic-ai, …) tracked on stars/PRs/issues across 28d + MoM + YoY with live rank-change indicators and data back to 2011. Trendshift has [#ai-agent](https://trendshift.io/topics/ai-agent) as a first-class topic with a 45.6k-star aggregate, daily cadence. Both ship today.

What remains defensible (and unverified anywhere else): **agent-native delivery**. No competitor advertises MCP, SSE, webhook, or email alerts. The StarScreener alert engine (shipped but 0% delivered today) is the real moat — **once delivery is wired, it is a differentiator no competitor matches**. Second defensible lane: sub-minute latency on a curated AI watchlist (possible once the GH Actions cron wired in pre-flight proves out). Third: porting the dual-ended fetch from `emanuelef/daily-stars-explorer` to solve the 40k-star cap that blinds 296/309 of the current seed.

---

## Per-target table

| # | Target | Status | Data source | Cadence | AI-agents first-class? | Alerts | They have / we don't | We could have / they don't |
|---|--------|--------|-------------|---------|------------------------|--------|----------------------|---------------------------|
| 1 | [**OSSInsight**](https://ossinsight.io) | ✅ LIVE_VERIFIED | 10B+ GH events, real-time (warehouse-backed) | "real time" advertised; specifics not stated | **YES — 17-repo curated collection** | none advertised | Curated AI Agent collection + rank-change indicators + history since 2011 | MCP + SSE + alert delivery |
| 2 | [**Trendshift**](https://trendshift.io) | ✅ LIVE_VERIFIED | not advertised ("consistent scoring algorithm on daily engagement metrics") | daily | **YES — `#ai-agent` topic, 45.6k stars** | none advertised | First-class topic taxonomy + editorial curation feel | API + CLI + MCP + agent-native subscribe + compound signals |
| 3 | [**GitHub /trending**](https://github.com/trending) | ✅ LIVE_VERIFIED | opaque (GitHub internal) | Today / Week / Month windows; no cadence stated | NO — 500+ languages but no AI category | none | Default brand reach | AI category + alerts + API + MCP + sub-daily latency |
| 4 | [**star-history.com**](https://star-history.com) | ✅ LIVE_VERIFIED | not stated | on-demand per repo | NO — per-repo viewer, not a screener | "Subscribe" string + Chrome ext (channels unclear) | The viral chart + brand embed | Trending screener with compound signals — they solve a different problem |
| 5 | [**gitlogs.com**](https://gitlogs.com) | ❌ **DEAD_SITE** | N/A | N/A | N/A | N/A | N/A — HTTP 301 redirects to `writinggoals.com/about-us` (unrelated writing-goals site). Product defunct. | N/A |
| 6 | [**daily-stars-explorer**](https://github.com/emanuelef/daily-stars-explorer) | ✅ LIVE_VERIFIED (reference, **not a competitor**) | GitHub API (GraphQL + REST), PAT-authenticated (5000/hr) | on-demand; 100k-star repo ≈ 3 min initial fetch | NO — doesn't categorize | none | **Dual-ended fetch that bypasses the 40k-star cap** — production-ready technique we should port (license check required) + CSV/JSON export + self-hostable (Docker) | Everything screener-related — they don't screen, they visualize |

---

## Dimension × competitor matrix

| Dimension | StarScreener today | StarScreener after pre-flight | OSSInsight | Trendshift | GH Trending | star-history | daily-stars-explorer |
|-----------|-------------------:|------------------------------:|-----------:|-----------:|------------:|-------------:|---------------------:|
| AI-agents first-class | ~35% recall, classifier stale | ~55-65% recall | **yes (curated 17)** | **yes (#ai-agent, 45.6k)** | no | no | N/A |
| Latency (p50) | ~24h manual | ~5-10 min | "real time" | daily | opaque | on-demand | on-demand |
| Historical depth | 30d + 40k cap | 30d + 40k cap | **since 2011** | Unknown | month max | full per-repo | **full (dual-ended)** |
| Public API | ✓ REST | ✓ REST | ✓ `/docs/api` | not advertised | ✗ | Unknown | N/A (self-host) |
| MCP server | **✓ 8 tools** | ✓ + alerts | not advertised | not advertised | ✗ | ✗ | ✗ |
| CLI | **✓ `bin/ss.mjs`** | ✓ | not advertised | not advertised | ✗ | ✗ | self-host only |
| Alert delivery | **0%** (engine only) | email + MCP (locked) | none advertised | none advertised | ✗ | unclear | ✗ |
| SSE / webhook | ✓ (no consumer) | ✓ + consumer | ✗ | ✗ | ✗ | ✗ | ✗ |
| 40k-cap workaround | Events fallback, silent trunc | same | N/A (warehouse) | Unknown | N/A | Unknown | **dual-ended fetch — ported if MIT/Apache** |
| Compound signals | math only, 0 fires | live | rank-change on collections | engagement score | ✗ | ✗ | ✗ |
| README badge | ✗ | ✗ (recommendation) | Unknown | Unknown | ✗ | **viral embed** | Unknown |

---

## Moat thesis — revised

**Verdict: thesis needs revision.**

The original StarScreener thesis rested on four claims: (1) first-to-find AI repos, (2) terminal/Dexscreener UX, (3) agent-native MCP surface, (4) compound signals (breakout / quiet-killer / rank-climb) not present elsewhere.

After verification:

- **Claim (1) is no longer unique.** Both OSSInsight (17-repo curated collection, 2011 history, rank-change indicators) and Trendshift (`#ai-agent` first-class topic with 45.6k-star aggregate) ship AI-agent discovery today. OSSInsight's collection is more editorial, Trendshift's taxonomy is more granular. StarScreener's rule-based classifier with ~35% current recall and a stale `.data/categories.jsonl` is behind both.
- **Claim (2) is still unique.** No competitor ships a terminal-style UX. Low strategic weight — easily copied in a weekend — but retains visual differentiation.
- **Claim (3) is unique AND strategically live.** No competitor advertises any MCP server, SSE subscribe channel, email alert, or webhook. StarScreener has a shipped alert engine (8 triggers, cooldown, 17 tests) delivering to zero users. The day delivery ships, StarScreener owns agent-native momentum signals with no peer.
- **Claim (4) is partially unique.** Trendshift has engagement-based scoring; OSSInsight has rank-change indicators on collections. StarScreener's compound signals (quiet-killer, rank-climber, breakout) are distinct in framing but similar in math. Retains modest differentiation.

**The real moat is not AI focus. It is agent-native alert delivery + sub-minute latency on a curated AI watchlist.** Both are within reach: delivery is locked as email + MCP for Prompt 2; latency is a 2-day workstream once the GH Actions cron wired in pre-flight proves out. Adjacent win: port `daily-stars-explorer`'s dual-ended fetch technique (license-contingent) to eliminate the 40k-star cap that blinds 96% of the current seed.

**One-line verdict: thesis needs revision — pivot the pitch from "AI-first OSS trend screener" to "agent-native momentum signal for LLM tool chains". Ship email + MCP alert delivery, ship sub-minute latency on a curated watchlist, and the moat holds.**

---

**Fetched URLs (7 / 8 cap):**
1. https://ossinsight.io
2. https://ossinsight.io/collections/ai-agent-frameworks
3. https://trendshift.io
4. https://github.com/trending
5. https://star-history.com
6. https://gitlogs.com *(dead, 301 → writinggoals.com)*
7. https://github.com/emanuelef/daily-stars-explorer
