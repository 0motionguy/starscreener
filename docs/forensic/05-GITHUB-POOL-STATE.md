# GitHub Pool State - Sprint 1 Phase 1.1

Checked: 2026-05-03
Branch: `sprint-1/phase-1.1-github-pool-telemetry`

## Summary

The app runtime is already mostly pool-routed. The production app-side selector is `src/lib/github-token-pool.ts`, with call sites reaching it either directly through `GitHubApiAdapter` or through `githubFetch()`. The existing telemetry is useful but incomplete: it publishes latest per-token state to Redis and emits Sentry/PostHog events, but it does not yet write hourly per-key request counters such as `pool:github:usage:<fingerprint>:<hour>`.

The remaining bypasses are not in `src/` app runtime according to `npm run lint:bypass`; they are script jobs and worker-side exceptions that use either a simple worker pool or single-token environment variables.

## Pool Location

- `src/lib/github-token-pool.ts:228` - `getNextToken()` selects a token.
- `src/lib/github-token-pool.ts:337` - `recordRateLimit()` updates per-token quota state and publishes latest token state to Redis.
- `src/lib/github-token-pool.ts:386` - `quarantine()` marks a token unavailable for 24h after invalid/revoked-token handling.
- `src/lib/github-token-pool.ts:514` - token parsing reads `GITHUB_TOKEN`, `GH_TOKEN_POOL`, then `GITHUB_TOKEN_POOL`, trimming and de-duplicating.
- `src/lib/github-token-pool.ts:575` - `getGitHubTokenPool()` exposes the app runtime singleton.

Secondary pool helpers:

- `apps/trendingrepo-worker/src/lib/util/github-token-pool.ts:16` - worker token loader.
- `apps/trendingrepo-worker/src/lib/util/github-token-pool.ts:43` - worker round-robin picker.
- `scripts/_github-token-pool-mini.mjs:27` - script-side mini pool loader.

## Existing Telemetry

- `src/lib/github-token-pool.ts:305` - Sentry captures pool exhaustion with tags for `pool`, `all_quarantined`, and `soonest_reset_iso`.
- `src/lib/github-token-pool.ts:365` - low-quota Sentry warning fires once below 500 remaining and resets after recovery above 1000.
- `src/lib/github-token-pool.ts:395` - quarantine Sentry alert for invalid/revoked tokens with redacted token labels.
- `src/lib/github-token-pool.ts:651` - Redis latest-state key prefix is `pool:github:tokens`.
- `src/lib/github-token-pool.ts:695` - latest per-token state publishes to Redis with 30-day TTL.
- `src/lib/github-fetch.ts:172` - PostHog `github_api_call` event for `githubFetch()`.
- `src/lib/pipeline/adapters/github-adapter.ts:314` - PostHog `github_api_call` event for pipeline adapter requests.

Missing telemetry for this phase:

- No hourly Redis usage counters by key fingerprint.
- No reusable `recordGithubCall()` helper.
- No Redis quarantine helper keyed by token fingerprint.
- Not every pool user has unified error classification for 401/403/5xx/network failures.

## App Runtime Call Sites Using The Pool

Count: 9 runtime surfaces.

- `src/lib/github-fetch.ts:74` / `src/lib/github-fetch.ts:122` - central `githubFetch()` wrapper; uses `getGitHubTokenPool()`, records rate-limit headers, quarantines on 401, falls back to unauthenticated only when the pool is empty.
- `src/app/api/admin/stats/route.ts:72` - `/rate_limit` via `githubFetch()`.
- `src/lib/github-repo-homepage.ts:52` - repo homepage lookup via `githubFetch()`.
- `src/lib/github-user.ts:89` - user/org profile lookup via `githubFetch()`.
- `src/lib/github-compare.ts:169` - compare-page helper via `githubFetch()`; downstream endpoints include repo, languages, contributors, commit activity, pulls, issues, and releases.
- `src/lib/pipeline/adapters/github-adapter.ts:263` / `src/lib/pipeline/adapters/github-adapter.ts:283` - adapter requests use the runtime pool by default; explicit test tokens are wrapped as a one-token pool.
- `src/lib/pipeline/adapters/social-adapters.ts:519` / `src/lib/pipeline/adapters/social-adapters.ts:541` - GitHub issue search uses `getGitHubTokenPool()` and records rate-limit headers.
- `src/lib/pipeline/ingestion/stargazer-backfill.ts:287` / `src/lib/pipeline/ingestion/stargazer-backfill.ts:318` - pool path is used when callers pass an empty token; current API routes do that.
- `src/lib/pipeline/ingestion/events-backfill.ts:86` / `src/lib/pipeline/ingestion/events-backfill.ts:121` - pool path is used when callers pass an empty token; current rebuild route does that.

Guard result:

- `npm run lint:bypass` passed on 2026-05-03 and reported no `src/` runtime pool bypasses.

## Runtime Bypasses / Exceptions

Count: 2 worker/runtime exceptions outside `src/`.

- `apps/trendingrepo-worker/src/fetchers/skill-derivatives/index.ts:215` - uses `pickGithubToken()` with a direct `process.env.GITHUB_TOKEN` fallback. Because the worker pool already includes `GITHUB_TOKEN`, this fallback is redundant and should be removed or documented as an intentional exception.
- `apps/trendingrepo-worker/src/fetchers/recent-repos/index.ts:137` / `apps/trendingrepo-worker/src/fetchers/recent-repos/index.ts:146` - uses single `GH_PAT` instead of the worker `GH_TOKEN_POOL` helper. Migrate to `pickGithubToken()` if this fetcher is part of the production source activation path.

## Script Call Sites Using Single Tokens

These are outside `src/` and currently outside the runtime bypass guard. They are script or workflow lanes and should be migrated only if the script is promoted into production runtime or cron repair work requires shared quota accounting.

Count: 8 script surfaces.

- `scripts/append-star-activity.mjs:68` / `scripts/append-star-activity.mjs:133` - repo metadata via `GITHUB_TOKEN` or `GH_TOKEN`.
- `scripts/backfill-star-activity.mjs:111` / `scripts/backfill-star-activity.mjs:246` - stargazers via `GITHUB_TOKEN` or `GH_TOKEN`.
- `scripts/discover-recent-repos.mjs:82` / `scripts/discover-recent-repos.mjs:117` - search repos via `GITHUB_TOKEN`.
- `scripts/enrich-repo-profiles.mjs:324` - repo metadata via `GITHUB_TOKEN`.
- `scripts/fetch-agent-commerce-live.mjs:44` / `scripts/fetch-agent-commerce-live.mjs:92` - repo metadata via `GITHUB_TOKEN` or `GH_TOKEN`.
- `scripts/fetch-repo-metadata.mjs:160` / `scripts/fetch-repo-metadata.mjs:216` - GraphQL metadata via required `GITHUB_TOKEN`.
- `scripts/seed-ai-unicorn-repos.mjs:145` / `scripts/seed-ai-unicorn-repos.mjs:150` - repo metadata via `GITHUB_TOKEN`.
- `scripts/scrape-producthunt.mjs:430` plus `scripts/_ph-shared.mjs:424` - repo/readme enrichment via `GITHUB_TOKEN`.

## Workflow Token Wiring

Pool or pool-like variables:

- `.github/workflows/cron-agent-commerce.yml:78` - sets `GITHUB_TOKEN` from `secrets.GITHUB_TOKEN_POOL || github.token`, which makes the pool string look like the single-token slot.
- `.github/workflows/refresh-skill-claude.yml:43` / `.github/workflows/refresh-skill-claude.yml:44` - passes single-token fallback plus `GH_TOKEN_POOL`.
- `.github/workflows/refresh-skill-derivatives.yml:42` / `.github/workflows/refresh-skill-derivatives.yml:43` - passes single-token fallback plus `GH_TOKEN_POOL`.

Single-token workflow lanes:

- `.github/workflows/enrich-repo-profiles.yml:38` - `GITHUB_TOKEN` from `github.token`.
- `.github/workflows/refresh-skill-lobehub.yml:41` - `GITHUB_TOKEN` from `GH_PAT_DEFAULT || GITHUB_TOKEN`.
- `.github/workflows/refresh-star-activity.yml:42` - `GITHUB_TOKEN` from `github.token`.
- `.github/workflows/scrape-producthunt.yml:38` - `GITHUB_TOKEN` from `github.token`.
- `.github/workflows/scrape-trending.yml:45` and `.github/workflows/scrape-trending.yml:73` - `GITHUB_TOKEN` from `github.token`.
- `.github/workflows/snapshot-top10-sparklines.yml:43` - `GITHUB_TOKEN` from `secrets.GITHUB_TOKEN`.
- `.github/workflows/snapshot-top10.yml:42` - `GITHUB_TOKEN` from `secrets.GITHUB_TOKEN`.

`GH_PAT_DEFAULT` is not read directly by app code; it is used as a workflow secret fallback assigned into `GITHUB_TOKEN`.

## Migration Plan

1. Add `src/lib/errors.ts` with the shared `EngineError` hierarchy and GitHub error classes.
2. Add `src/lib/pool/github-telemetry.ts` to write hourly Redis usage counters and fingerprint-keyed quarantine entries.
3. Extend the app-side pool/fetch paths so every selected token records `recordGithubCall()` with status, remaining quota, reset, duration, operation, and success.
4. Unify 401/403/5xx/network behavior in app-side GitHub wrappers so Sentry tags and quarantine behavior are consistent.
5. Before migrating worker/script bypasses, confirm intended scope with Mirko:
   - Worker `skill-derivatives` direct fallback.
   - Worker `recent-repos` `GH_PAT` path.
   - Script/workflow single-token lanes.
