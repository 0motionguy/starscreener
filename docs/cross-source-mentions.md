# cross-source-mentions — repo-first mentions sweep

**Last refreshed**: 2026-05-07. Sister docs: [ENGINE.md](ENGINE.md) (engine bottom-up), [SITE-WIREMAP.md](SITE-WIREMAP.md) (site top-down).

## Why this exists

The 88 source-first collectors all answer the same question: "what mentions appeared on **this source** in the last hour?" That leaves a structural blind spot — a repo can spike on Twitter / Bluesky / Reddit and never appear in our mentions feed if its keywords don't match our generic source-side filters. The `sweep-cross-source-mentions` workflow flips the loop: take each top-trending repo and ask **every channel** "show me mentions of this specific repo over the last 7 days". Twitter has always been repo-first (per-repo Apify queries); this script generalizes that pattern to all 8 channels and writes a single rolled-up view (`data/repo-mentions-detail-rollup.json`) consumed by the repo-detail page.

## Architecture

```
trending top-100  ──┐
                    ├─►  sweep-cross-source-mentions.ts
profile-completion  │      │
queue (--queue)     │      ├──► [twitter ] Apify  apidojo~tweet-scraper
                    │      ├──► [reddit  ] old.reddit.com/search.json
                    │      ├──► [hn      ] hn.algolia.com/api/v1
                    │      ├──► [bluesky ] bsky.social/xrpc/searchPosts
                    │      ├──► [devto   ] dev.to/search/feed_content
                    │      ├──► [lobsters] local snapshot filter
                    │      ├──► [PH      ] local snapshot filter
                    │      └──► [tavily  ] api.tavily.com/search
                    │
                    │      Promise.allSettled — fail-soft per channel
                    ▼
        data/repo-mentions-detail.jsonl     (append-only event log)
                    │
                    ├──► buildRollup() top-5-per-source, 7d window
                    │
                    ▼
        data/repo-mentions-detail-rollup.json   (+ Redis dual-write)
                    │
                    ▼
        repo profile UI: `mentions.detail` field on /repo/[owner]/[name]
        (RecentMentionsDetailFeed.tsx, src/lib/cross-source-mentions.ts)
```

Two cron lanes in [.github/workflows/sweep-cross-source-mentions.yml](../.github/workflows/sweep-cross-source-mentions.yml):

- `0 */6 * * *` — top-50 (~3-4 min wall, concurrency 4)
- `15 5 * * *` — top-200 daily reconciliation (~13 min wall)

## The 8 channels

Per-channel hit counts from the 2026-05-07T11:22:58Z top-100 run (count = post-dedup mentions across 100 repos in 7d):

| Channel | API | Auth | Top-100 hit count |
|---|---|---|---|
| twitter | Apify run-sync `apidojo~tweet-scraper` | `APIFY_API_TOKEN` | 4372 |
| reddit | `old.reddit.com/search.json` (no OAuth) | none required | 933 |
| hackernews | Algolia `hn.algolia.com/api/v1/search_by_date` | none | 878 |
| tavily | `api.tavily.com/search` (24h server cache) | `TAVILY_API_KEY` | 709 (range 349-709 across runs) |
| bluesky | `bsky.social/xrpc/app.bsky.feed.searchPosts` | `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD` | 477 (was 274 in earlier session run) |
| lobsters | local snapshot filter on `data/lobsters-trending.json` | n/a | 1 |
| devto | `dev.to/search/feed_content` (public) | none | 0 (rare hits — dev.to body search is sparse) |
| producthunt | local snapshot filter on `data/producthunt-launches.json` | n/a | 0 (catches launch-day matches only) |

Adapter contract: `_cross-source-search.mjs` exports `search<Channel>(repo, ...ctx) → Mention[]`. All adapters fail-soft (return `[]` and log on error); a missing credential or upstream 429 disables that channel for the run without blocking the others.

## Apify actor selection

The default Twitter actor is `apidojo~tweet-scraper` ($0.40 / 1k tweets). Swap via env:

```sh
APIFY_TWITTER_ACTOR=xquik~twitter-x-data-scraper-pay-per-result   # cheaper
```

Price ladder (USD per 1k tweets, observed 2026-05):
- `xquik~twitter-x-data-scraper-pay-per-result` — $0.15
- `microworlds~twitter-scraper` — $0.25
- `apidojo~tweet-scraper` (default) — $0.40
- `apify~twitter-scraper` — $0.50

ADR with head-to-head probe and rationale for keeping apidojo as the default: [decisions/sweep-twitter-actor.md](decisions/sweep-twitter-actor.md).

## Composition with profile-completion-check

[scripts/check-profile-completion.ts](../scripts/check-profile-completion.ts) (every 30 min via `check-profile-completion.yml`) scores every top-100 repo on a 0-100 completeness scale (required fields + mention coverage + delta freshness + enrichment). Repos scoring < 70 land in `data/profile-completion-queue.json` with a `recommendedAction ∈ {enrich, sweep, both, noop}`.

The sweep consumes that queue with `--queue data/profile-completion-queue.json` — it picks entries where `recommendedAction ∈ {sweep, both}`, sorted by `priority` descending, and only emits an Apify call when `lastSweptAt` is older than 6h (the `ANTI_OSC_HOURS` constant on both sides). This prevents oscillation: a repo flagged "incomplete" doesn't re-burn the budget on the next 30-min audit tick if we just swept it.

## Operations

**Run locally**:
```sh
npm run sweep:mentions:dry                        # top 5, no writes
npm run sweep:mentions -- --top 50                # standard run
npm run sweep:mentions -- --queue data/profile-completion-queue.json
npm run sweep:mentions -- --repo owner/name --concurrency 1
npm run sweep:mentions -- --source-only tavily    # isolate one channel
```

**Disable a channel**: pass `--source-only <other-channel>` to whitelist a single channel (only that one runs), or unset the credential — each channel auto-disables on missing auth and logs a one-line warn at sweep start. There is no `SWEEP_DISABLE_<CH>` env-var kill-switch today.

**Where data lands**:
- `data/repo-mentions-detail.jsonl` — append-only event log (raw `Mention` records, one per line)
- `data/repo-mentions-detail-rollup.json` — top-5-per-source-per-repo, 7d window
- `data/_meta/cross-source-mentions.json` — freshness sidecar (count, durationMs, perChannel breakdown)
- Redis slug: `repo-mentions-detail-rollup` (dual-write via `_data-store-write.mjs`)

**How to compact**: the JSONL grows by ~7k lines/run. Roll-up reads the existing rollup and merges, so JSONL pruning is safe — `tail -n 50000` is the current rotation pattern (no automated rotation workflow yet — see Known Gaps).

## Known gaps

- **No cross-run dedup of JSONL events.** Each sweep appends fresh events even if the same `url` was seen 6h ago. The rollup builder dedups within a single run but not across runs. A separate agent is shipping per-URL dedup at rollup time.
- **JSONL rotation is manual.** No workflow truncates `repo-mentions-detail.jsonl` once it grows past N lines.
- **No caching across runs except Tavily.** Tavily server-side caches identical queries for 24h (handled by the API). Twitter / Reddit / HN / Bluesky pay full cost every run.
- **devto + producthunt yield ~0 results most runs.** Dev.to body-text search is genuinely sparse for repo full-names; ProductHunt only matches launch-day records. Both kept in the lineup because the marginal cost is tiny (one HTTP call + one local filter), but they are not load-bearing.
- **lobsters is snapshot-bound.** Adapter filters the latest `data/lobsters-trending.json` rather than searching lobste.rs — so a repo mention older than the snapshot's window is invisible.
- **No kill-switch env vars (`SWEEP_DISABLE_TWITTER` etc).** Today the only knobs are `--source-only` (whitelist) and removing the credential. If we need a runtime blocklist, it would land in `_cross-source-search.mjs` adapter dispatch.
