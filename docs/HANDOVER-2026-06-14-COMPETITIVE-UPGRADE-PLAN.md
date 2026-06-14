# HANDOVER 2026-06-14 — Competitive upgrade plan

> Punch list driven by the side-by-side scrape of `trendingrepo.com`, `ossinsight.io`, and `trendshift.io` through the Toolbox engine bench (`scripts/scrape-bench/` in the toolbox repo). Companion to the Toolbox PR https://github.com/0motionguy/toolbox/pull/239 (Wave 1 + Wave 2 reports).

## Why this exists

The founder's goal is *"super fresh data, like they have… like, people want to be on our website."* The Wave 2 scrape grabbed the live HTML of each competitor's homepage + a detail or ranking page using our own engines (Firecrawl + Toolbox web.scrape.v1 + Context API + cloak), then extracted six feature dimensions per product: data freshness, surface area (nav buckets), discovery filters, per-item depth, API exposure, and monetization signals.

This file is a punch list — pick the top 5 and ship them in a follow-up TR session. Each item is scoped to <1 day, has a `Why:`, a `How:` with file pointers, and a `Verify:` line.

The planned companion PR (`feat/freshness-wins-2026-06-14`) was **deferred** when this session discovered that the velocity-engine fetchers (`velocity-refresh`, `velocity-backfill`, `star-activity-deltas`) live only on the **unmerged** `hardening/2026-05-31-wave` branch (per [[trendingrepo-deploy-divergence]] memory). Production runs that branch, but `main` doesn't have the fetchers — so cron edits against `main` would have nothing to schedule. The 3 cron-tightening wins (F1–F3) need branch reconciliation first; everything else below stays actionable today.

## What we learned from the scrape

- **TrendShift** wins on data freshness signal in the rendered DOM ("Today (UTC)" tab, momentum ranking). Their home is minimal — they bet entirely on velocity.
- **OSSInsight** wins on collection depth (102+ curated topics, an API, a Data Explorer with NL→SQL). Their home is dense.
- **TrendingRepo** wins on per-item depth: 10-component momentum composite, breakout detection, related repos, mentions feed, watchlist, Portal v0.1 + MCP. We're the only one with a structured API agents can hit.
- **TrendingRepo loses** on (a) explicit freshness markers on the homepage, (b) language filter visibility, (c) the live LLM consensus narratives (Kimi quota dead — 498 verdicts stale).

## 1. Freshness wins — what to tighten in the worker

### F1. velocity-refresh cron 40min → 15min  *(Blocked on branch reconciliation)*

- **Why**: TrendShift looks fresher because their "Today (UTC)" rolls continuously. Our 24h/7d/30d numbers refresh every 40min; bumping to 15min cuts lag by 2.6×.
- **How**: `apps/trendingrepo-worker/src/fetchers/velocity-refresh/index.ts:190` — change `schedule: '*/40 * * * *'` to `schedule: '*/15 * * * *'`. The fetcher is already CHEAP (top-N only) and token-pool-guarded; no logic change.
- **Verify**: `curl https://trendingrepo.com/api/repos/trending?window=24h | jq '.fetchedAt'` should refresh ≥4× per hour after the new schedule kicks in.

### F2. star-activity-deltas: daily → twice-daily  *(Blocked on branch reconciliation)*

- **Why**: 7d/30d delta numbers right now refresh once a day. Two runs per day halves the lag window. Token budget allows it (the fetcher rotates a 10-key pool with backoff).
- **How**: `apps/trendingrepo-worker/src/fetchers/star-activity-deltas/index.ts:233` — change `schedule: '30 5 * * *'` to `schedule: '30 5,17 * * *'` (05:30 + 17:30 UTC).
- **Verify**: `curl https://trendingrepo.com/api/health/sources | jq '.["star-activity-deltas"].lastRunAt'` should show two runs per UTC day.

### F3. velocity-backfill: daily → twice-daily  *(Blocked on branch reconciliation)*

- **Why**: Coverage gap — 184/325 repos have 24h deltas, 152/325 have 7d (May 29 hardening note). The backfill currently runs once a day at 02:17 UTC; doubling to 02:17 + 14:17 closes the gap roughly 2× faster.
- **How**: `apps/trendingrepo-worker/src/fetchers/velocity-backfill/index.ts:499` — change `schedule: '17 2 * * *'` to `schedule: '17 2,14 * * *'`.
- **Verify**: After 48 h, the coverage ratio (`coveredRepos / totalRepos` in the velocity-backfill metric) should reach ≥0.85 on both 24h and 7d windows.

### F4. Surface a homepage "Updated X ago" stamp

- **Why**: Both TrendShift and OSSInsight visibly show freshness on the homepage. Ours doesn't — users can't tell at a glance whether they're looking at fresh data.
- **How**: SSR the most-recent `fetchedAt` from the `trending` datastore slug into the home hero. File: `apps/trendingrepo-web/src/app/page.tsx` (or wherever the home component reads trending). Render a small `<UpdatedBadge fetchedAt={...} />` element with a relative-time formatter.
- **Verify**: `curl -s https://trendingrepo.com/ | grep -i "updated"` returns the badge in the SSR HTML; refresh visibly updates.

### F5. Push the consensus regeneration cadence to weekly

- **Why**: Once F4-block above lands and consensus narratives are alive again (see L1 below), the 498 backfill is stale within a week. Need a re-run cadence.
- **How**: After L1 lands, add a `consensus-refresh` cron at `0 8 * * 1` (Monday 08:00 UTC). Pulls top-50 repos by velocity, regenerates narratives via NanoGPT.
- **Verify**: A repo's `narrativeUpdatedAt` should never be older than 14 days for the top 50 by velocity.

## 2. Coverage wins — signal sources we don't have

### C1. Re-enable Reddit via Toolbox SSRF-safe scrape

- **Why**: Reddit was disabled May 2026 over auth fragility. Toolbox `web.scrape.v1` skill (shipped 2026-06-14 in toolbox PR #236) renders Reddit JSON paths reliably with no auth — bypasses the issue entirely.
- **How**: Replace the legacy Reddit fetcher's auth path with a call to `https://api.aiso.tools/v1/skills/web.scrape.v1/run` posting `{url: "https://www.reddit.com/r/programming/.json", formats: ["markdown"]}`. File: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts` (or wherever the disabled fetcher lives).
- **Verify**: A repo's `mentions.reddit` count grows over a 24h window after redeploy.

### C2. Wire TrendShift as a cross-check signal

- **Why**: TrendShift's velocity ranking is high-signal. We have a placeholder fetcher (`trendshift-daily`) that doesn't deeply integrate. They don't expose an API but they SSR their daily ranking — scrape it.
- **How**: Use Toolbox `web.scrape.v1` against `https://trendshift.io/` and parse the ranked list out of the rendered markdown. Persist as a `trendshift.rank` signal joined to our repos by `owner/name`. Surface as a small badge on each repo card. File: `apps/trendingrepo-worker/src/fetchers/trendshift-daily/index.ts`.
- **Verify**: A repo on the TrendShift daily top-10 gets a `trendshift_rank` field in its API response.

### C3. Add a video-platform mentions signal (YouTube / Bilibili)

- **Why**: TrendShift surfaces these and they're a real leading indicator on dev-tool repos (Fireship, Theo, etc.). We have zero coverage today.
- **How**: New fetcher `video-mentions` that runs daily, queries YouTube search API + Bilibili search for `${repo.name}` and counts hits in the last 7 days. File: new `apps/trendingrepo-worker/src/fetchers/video-mentions/index.ts`. YOUTUBE_API_KEY required.
- **Verify**: 24h after the first run, every top-100 repo has a non-null `mentions.video_7d` count.

### C4. Hourly mention-feed refresh (HN + Bluesky + DevTo)

- **Why**: Mentions today refresh once a day. Hourly is cheap and matches the "live" perception we need.
- **How**: Update each of the social fetchers' schedules. Files: `apps/trendingrepo-worker/src/fetchers/{hackernews,bluesky,devto}/index.ts`. Move from daily to `7 * * * *` (every hour at :07).
- **Verify**: `/api/repos/microsoft/vscode?v=2 | jq '.mentions | length'` should grow at least once per hour.

## 3. UX wins — discovery dimensions we lack

### U1. Language filter chips on the homepage

- **Why**: Both OSSInsight and the GitHub trending paradigm pivot on language. Our home doesn't visibly expose it. Users on TypeScript don't immediately see they can filter.
- **How**: Add chip row above the rankings card in `apps/trendingrepo-web/src/app/page.tsx` (or the home component). Chips: All, Python, TypeScript, Rust, Go (matches the worker's existing LANGUAGES tuple). Filter is a query param: `?lang=typescript`. Use Next.js client-side routing; no server change.
- **Verify**: Clicking a chip filters the visible list; URL updates; back/forward preserves state.

### U2. Time-window tabs (24h / 7d / 30d)

- **Why**: TrendShift shows Daily/Weekly/Monthly/Yearly tabs as the central nav. Our home defaults to a single window. Window is the most-used filter in this category.
- **How**: Add tab row inside the rankings card. Bind to `?window=24h|7d|30d` query param; existing `/api/repos/trending?window=` endpoint already supports it.
- **Verify**: Switching tabs reorders the list without a hard reload; URL persists.

### U3. Topic / collection browse

- **Why**: OSSInsight wins on collection depth (102 curated topics). We have categories but they're not promoted from the home.
- **How**: Add a "Browse by topic" rail below the main rankings. Pull from `data/categories.json`. Each topic is a card with the top-3 repos in it.
- **Verify**: Home renders the rail; clicking a topic lands on `/categories/<slug>`.

### U4. Side-by-side compare-3 view

- **Why**: Compare-2 exists. Bumping to 3 makes the page useful for tech-choice comparisons (Vite vs Webpack vs Turbopack) and matches the "compare" intent better.
- **How**: Update `/compare` UI + `/api/compare` to accept up to 3 `fullNames` params and render side-by-side.
- **Verify**: `https://trendingrepo.com/compare?fullNames=vitejs/vite,webpack/webpack,vercel/turbo` renders 3 columns.

## 4. LLM consensus restoration — Kimi dead, NanoGPT lives

### L1. Pivot `consensus-analyst` from Kimi → NanoGPT (Kimi-K2 on the flat-rate sub)

- **Why**: Kimi quota exhausted in May; the 498-repo backfill hasn't regenerated since. NanoGPT serves Kimi-K2 via a flat-rate subscription that Toolbox already uses (web.extract.v1 NANOGPT pivot, PR #238). Marginal cost ≈ $0 per call.
- **How**: In `apps/trendingrepo-worker/src/fetchers/consensus-analyst/index.ts`, swap the Kimi API call for `${NANOGPT_BASE_URL}/chat/completions` (default `https://nano-gpt.com/api/subscription/v1`) with model `moonshotai/kimi-k2.6`, `response_format: {type: "json_object"}`, `temperature: 0`. Pattern matches `apps/api/src/skills/impl/web-extract.ts` in toolbox PR #238 — lift the call structure verbatim. Add `NANOGPT_API_KEY` to worker compose env.
- **Verify**: One smoke run produces a fresh `consensus-verdicts.json` row with a recent `narrativeUpdatedAt`.

### L2. Add a `consensus-refresh` cron (top 50 weekly)

- **Why**: One-shot regeneration after L1 is a backfill, not a steady state. We need a recurring refresh.
- **How**: New cron entry pointing at `consensus-analyst.runForTopN(50)`. Schedule: `0 8 * * 1` (Mondays 08:00 UTC, after the velocity refresh).
- **Verify**: After 14 days, top-50 repos all have `narrativeUpdatedAt` ≤ 7 days old.

## Order of operations

1. **Phase 0 — branch reconciliation** (blocker). The velocity-engine work (`velocity-refresh`, `velocity-backfill`, `star-activity-deltas`) lives on the unmerged `hardening/2026-05-31-wave` branch (per [[trendingrepo-deploy-divergence]]). Production runs that branch; `main` doesn't have the fetchers. Decide: (a) merge the hardening branch to main first, or (b) ship F1–F3 directly to the hardening branch. (a) is cleaner, (b) is faster.
2. **Phase 1 — Freshness wins (after Phase 0)** — F1, F2, F3. Three cron edits + a tightened backfill cadence. Zero migration risk; reversible by flipping crons back.
3. **Phase 2 — Restore the freshness story + AI narratives** — F4 (homepage badge), F5 (consensus weekly), L1 (NanoGPT swap), L2 (recurring consensus). Together this is the visible "we're alive and fresh" pass.
4. **Phase 3 — Coverage + UX wins** — C1 (Reddit via Toolbox), C4 (hourly mention refresh), U1 (language chips), U2 (time-window tabs). Closes the gap to TrendShift/OSSInsight.
5. **Phase 4 — Backlog** — C2 (TrendShift cross-check), C3 (video mentions), U3 (topic browse), U4 (compare-3). Aspirational; pick based on user feedback after Phase 2+3 ship.

## Out of scope (this round)

- Postgres migration — DATABASE.md plan stays deferred; all wins above are Redis+JSONL-compatible.
- Web admin UI / new auth flows.
- New monetization surfaces (Pro tier, API plans) — those are product decisions that need the founder's input.
- Anything touching the AISO orchestrator outside its existing webhook contract.
