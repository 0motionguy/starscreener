# Next-session opening prompt (paste this verbatim into a fresh agent)

> You're picking up from the 2026-05-08 rescue consolidation. Start by
> reading these in order, then report back before doing anything:
>
> 1. `C:/tmp/lane10-rescue/CLAUDE.md` — project rules. Pay attention to
>    the 4 new anti-patterns added on 2026-05-08 (keep-last-50
>    collector rule, `git stash -u` orphan pattern, Next 15 route-shape
>    exports, Drizzle pages need `force-dynamic`).
> 2. `C:/tmp/lane10-rescue/docs/RESCUE-2026-05-08-HANDOVER.md` —
>    the full handover. Branch state, the 13 rescue commits, what's
>    outstanding, 7 carry-forward learnings. Self-contained.
> 3. `C:/tmp/lane10-rescue/docs/INGESTION.md` (top section) — the
>    "RULE: Keep-last-50 cache (2026-05-08)" — collectors must
>    union new + existing, dedupe, keep top 50, never empty.
>
> Then:
>
> a) `cd C:/tmp/lane10-rescue && git status` — should be clean, on
>    `feat/charts-echarts-pilot`, at tag `rescue-post-consolidation`.
> b) `git log --oneline rescue-pre-consolidation..HEAD | wc -l` —
>    should report 14 (the 13 rescue commits + the docs commit).
> c) `npm run dev` — port 3023, hard-refresh in browser, walk the
>    surfaces user flagged: `/`, `/skills`, `/mcp`, `/twitter`,
>    `/reddit/trending`, `/repo/vercel/next.js`, `/funding/sec`.
> d) Check fresh data has landed from yesterday's workflow triggers:
>    `git fetch origin main && git log origin/main --oneline --since="2026-05-08" -- data/` — there should be auto-commits
>    from collect-twitter, scrape-trending, scrape-bluesky, scrape-arxiv,
>    scrape-huggingface, scrape-devto, scrape-lobsters, scrape-npm,
>    scrape-producthunt, scrape-claude-rss, scrape-openai-rss,
>    scrape-awesome-skills, scrape-huggingface-{datasets,spaces},
>    collect-funding (15 workflows triggered ~end of day 2026-05-08).
> e) If user is happy with the dev surfaces, push:
>    `git push origin feat/charts-echarts-pilot`. Mention which
>    upstream PR / target branch you intend to merge into and pause
>    for confirmation before opening any PR.
>
> Outstanding work (from RESCUE-HANDOVER):
>
> 1. **Reddit collector regression**: data file has 3,768 posts ALL
>    with `score=0, numComments=0`. Fix in `scripts/scrape-reddit.mjs`
>    around line 827 OR Reddit OAuth. There is NO `scrape-reddit.yml`
>    workflow yet — Reddit collection is local-only via
>    `npm run scrape:reddit`. Dispatch a focused agent to diff the
>    parser against the live Reddit API response shape.
> 2. **Apify Twitter on bulk repo set**: 386 of 402 signals are
>    >72h old. The `collect-twitter.yml` workflow ran yesterday;
>    inspect run logs to confirm it covered the bulk set or only the
>    16 currently-fresh repos. Apify console may show throttling /
>    actor failure.
> 3. **Implement keep-last-50 in every collector**: per the new rule,
>    each `scripts/scrape-*.mjs` needs a read-existing → union →
>    dedupe → top-50 step in its write path. Add a guard
>    `scripts/check-collector-keep-last-50.mjs` and wire into
>    `npm run lint:guards`.
> 4. **Two real test assertions are drifting** (twitter-fallback Sentry
>    warning + Paperclip phrase suppression). Not blocking but worth
>    a 30-min look.
> 5. **`/funding/_health` route**: files exist, but Next App Router
>    excludes underscore-prefixed folders. Rename to `funding/health`
>    if the diagnostic dashboard should be reachable.
> 6. **`mcp/page.tsx` inline `trendingScore()`**: duplicates
>    `@/lib/mcp-ranking`. Refactor to import from the lib when
>    next touched.
>
> Working agreements:
>
> - Don't push without explicit user OK (`feedback_no_push_without_approval.md`).
> - Don't run `npm run build` while `npm run dev` is running — they
>   share `.next/` and corrupt each other (3-hour incident yesterday).
> - Don't `git add -A` or `git add .` (parallel sessions silently
>   steal staged work). Always `git add <SPECIFIC-FILE>` and commit
>   immediately after each `Write`.
> - Don't touch `C:/dev/trendingrepo` working tree (other session's
>   uncommitted work). All rescue work happens in
>   `C:/tmp/lane10-rescue`.
>
> Report back:
> - Current `git log --oneline -5` from rescue worktree
> - Which surfaces still look broken after a hard browser refresh
> - Status of yesterday's 15 collector workflow runs (success / fail
>   / partial)
> - One-line plan for next 30 minutes.
