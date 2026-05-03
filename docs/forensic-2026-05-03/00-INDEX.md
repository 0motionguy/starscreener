# STARSCREENER Forensic Report — 2026-05-03

**Audience**: Basil (CTO seat) + future Claude sessions opening a cold context.
**Investigator**: solo (harness blocked sub-agent dispatch on escalation signal).
**Verification basis**: every claim traced to a file path or `ls`/`grep` output. M6 (memory-is-suspect) honoured — `docs/ENGINE.md` and `docs/SITE-WIREMAP.md` were treated as hypotheses and re-verified against actual code.

---

## How to read this report

1. Start with the **architecture diagram** in [04-SCORING-AND-DIAGRAM.md](04-SCORING-AND-DIAGRAM.md) — one ASCII drawing, every box, every arrow.
2. Drill into [01-SOURCES-AND-APIS.md](01-SOURCES-AND-APIS.md) when you need to know "who calls X".
3. Drill into [02-WORKFLOWS.md](02-WORKFLOWS.md) when you need to know "what runs when".
4. Drill into [03-STORAGE-AND-FRESHNESS.md](03-STORAGE-AND-FRESHNESS.md) when you need to know "where it lands and how do we know it's fresh".
5. Stay in [04-SCORING-AND-DIAGRAM.md](04-SCORING-AND-DIAGRAM.md) for the trending engine + shadow scoring + Trustmrr overlays.

---

## Headline numbers (verified)

| Metric | Count | Verification |
|---|---:|---|
| GitHub Actions workflows | **62** | `ls .github/workflows/ \| wc -l` |
| Vercel cron HTTP routes | **9** | `ls src/app/api/cron/` (aiso-drain, digest, llm, mcp, news-auto-recover, predictions, twitter-daily, twitter-weekly-recap, webhooks) |
| Worker fetcher dirs | **53** | `ls apps/trendingrepo-worker/src/fetchers/ \| wc -l` |
| Bundled `data/*.json` files | **44** | `ls data/*.json \| wc -l` |
| `data/_meta/*.json` freshness sidecars | **16** | `ls data/_meta/ \| wc -l` |
| Append-only `.data/*.jsonl` | **3** | twitter-scans, twitter-repo-signals, twitter-ingestion-audit |
| Data-store tiers | **3** | Redis → file → memory LKG ([data-store.ts:235](../../src/lib/data-store.ts)) |
| Distinct external APIs | **20+** | See [01-SOURCES-AND-APIS.md](01-SOURCES-AND-APIS.md) |
| Distinct env-var secrets in workflows | **22** | `GITHUB_TOKEN_POOL`, `GH_TOKEN_POOL`, `GH_PAT_DEFAULT`, `REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`, `APIFY_API_TOKEN`, `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`, `REDDIT_CLIENT_ID/SECRET/USER_AGENT`, `PRODUCTHUNT_TOKEN(S)`, `DEVTO_API_KEY(S)`, `SMITHERY_API_KEY`, `LIBRARIES_IO_API_KEY`, `TRUSTMRR_API_KEY`, `AA_API_KEY`, `SOLANA_RPC_URL`, `INTERNAL_AGENT_TOKEN`, `OPS_ALERT_WEBHOOK`, `AGENT_COMMERCE_WEBHOOK_URL`, `TWITTER_WEB_ACCOUNTS_JSON` |

---

## Corrections to user's premise (M6: memory is suspect)

- **"80 workflows" → actually 62.** No artifact in the repo says 80; ENGINE.md says 62; `ls` confirms 62.
- **"What is stored in DB on Supabase"** → only the **Railway worker** uses Supabase. The main Next.js app uses Redis as primary truth, with bundled JSON + in-memory LKG fallback. Verified: no main-app code imports `@supabase/supabase-js`.
- The engine has **two cron lanes**, not one:
  - **GHA-direct lane** (53 of 62 workflows): GitHub Actions runs a Node script → writes `data/*.json` → `git add` + `git push` → Vercel auto-redeploys with new bundled data. Also dual-writes to Redis when `REDIS_URL` (or Upstash) is set.
  - **HTTP-poll lane** (9 of 62): GitHub Actions runs `curl -H "Authorization: Bearer $CRON_SECRET" https://trendingrepo.com/api/cron/<route>` → Vercel route mutates Redis directly.

---

## Where the bodies are buried

Top 5 single points of failure ranked by blast radius:

1. **Redis** — every reader falls through to file/memory if it dies, but new writes have no destination. Recovery: rebuild the bundled JSON snapshot via collector replay.
2. **OSS Insight upstream** (`api.ossinsight.io`) — feeds `data/trending.json` which feeds `getDerivedRepos()` which feeds 11+ user-facing surfaces.
3. **Apify Twitter actor** (`apidojo~tweet-scraper`) — single-token. Cookie-based providers are dead post-2026. The audit-freshness gate (12h budget) is the alarm.
4. **GitHub PAT pool** — `GITHUB_TOKEN_POOL` exhaustion fires Sentry alert, `GitHubTokenPoolExhaustedError` thrown, NO silent degradation. Quarantine on 401 = 24h auto-recovery.
5. **`scrape-trending` workflow** — hourly `27 * * * *`. If it fails twice in a row, every derived-repos surface goes stale within 6h (per the freshness-budget gate).

---

## Files in this report

| File | Topic |
|---|---|
| [00-INDEX.md](00-INDEX.md) | This file |
| [01-SOURCES-AND-APIS.md](01-SOURCES-AND-APIS.md) | Every external API + auth env + caller path |
| [02-WORKFLOWS.md](02-WORKFLOWS.md) | All 62 workflows + 9 Vercel cron routes, by cadence |
| [03-STORAGE-AND-FRESHNESS.md](03-STORAGE-AND-FRESHNESS.md) | Redis keys, bundled JSON, JSONL, Supabase schema, freshness flow |
| [04-SCORING-AND-DIAGRAM.md](04-SCORING-AND-DIAGRAM.md) | Main-app + worker scoring engines, shadow scoring, Trustmrr overlays, ASCII architecture diagram |

---

## Cross-references inside the repo

- [docs/ENGINE.md](../ENGINE.md) — the canonical engine map (verified accurate as of 2026-05-02)
- [docs/SITE-WIREMAP.md](../SITE-WIREMAP.md) — top-down route → data → collector → API map
- [CLAUDE.md](../../CLAUDE.md) — project conventions + anti-patterns burned
- [tasks/data-api.md](../../tasks/data-api.md) — Redis data-store provisioning + phased rollout plan
- Memory: `~/.claude/projects/c--Users-mirko-OneDrive-Desktop-STARSCREENER/memory/MEMORY.md`
