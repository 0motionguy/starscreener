# Policy: No Apify — Free Providers Only

**Effective:** 2026-05-17
**Owner:** Operator (Mirko / Basil)
**Status:** ENFORCED — Apify is OFF in every scheduled workflow on `main`

## TL;DR

Apify is permanently disabled across every scheduled GitHub Actions workflow in this repo. Free providers only. Re-enabling Apify in any cron requires:

1. A reverting PR that restores the `APIFY_API_TOKEN` env var and / or `REDDIT_COLLECTOR_PROVIDER=apify` flag
2. Explicit operator sign-off on the recurring spend
3. A documented budget ceiling and a dashboard for the burn-rate

There is no "soft" path. If a future agent or workflow tries to enable Apify silently, block the PR.

## Why Apify is off

Apify residential-proxy actor runs cost real money:

- **Reddit (`trudax/reddit-scraper-lite`)** — ~$6.75 per 45-sub scrape. Daily = ~$200/mo. Plan ceiling was $29/mo; the operator was bleeding budget on a single source.
- **Twitter (`apidojo/tweet-scraper`)** — per-tweet billing; the actor had been returning 0 posts on every query for ~2 weeks before being switched off (last non-empty run 2026-04-23). Cost without signal.
- **X funding side-channel** (in `apps/trendingrepo-worker`) — same Apify dependency; 2h cadence multiplied the burn.

The aggregate burn was making Apify the single largest line item without producing proportional signal quality, and the residential-proxy path was masking a deeper architectural issue (Reddit anti-bot 403 on data-center IPs).

## What replaces Apify

| Channel | Old (Apify) path | New (free) path |
| ------- | --- | --- |
| Reddit | `trudax/reddit-scraper-lite` residential proxy | Public `/r/X/new.json` with OAuth-app User-Agent rotation in `scripts/scrape-reddit.mjs`. Last-good cache invariant prevents 0-row writes from erasing engaged baselines. |
| Twitter | `apidojo/tweet-scraper` actor | Nitter primary (`TWITTER_COLLECTOR_PROVIDER=nitter`) → cookies-backed `TwitterWebProvider` fallback when nitter 503s |
| AI / news blogs | n/a (was always RSS) | RSS feeds remain the source for `scrape-funding`, the AI sub-collectors, and the cookbook AI sources |
| X funding side-channel | `apps/trendingrepo-worker` fetcher `x-funding` (Apify-only) | Step `if: false` in `collect-funding.yml`. Operator must restore manually if needed. |
| Cross-source sweep — Twitter channel | Apify per-query bundle | Auto-disabled when `APIFY_API_TOKEN` env var is absent (sweep logs a warn, keeps the other 7 channels running) |

The data-store contract is unchanged: every collector still dual-writes file + Redis. Read paths still go through `refreshXxxFromStore()`. The only difference is the provider behind the scrape.

## Workflows touched 2026-05-17

| Workflow | Change |
| -------- | ------ |
| `.github/workflows/scrape-trending.yml` | Removed `REDDIT_COLLECTOR_PROVIDER: apify` + `APIFY_API_TOKEN` from "Refresh Reddit mentions" step |
| `.github/workflows/cron-reddit-daily.yml` | Removed `REDDIT_COLLECTOR_PROVIDER: apify` + `APIFY_API_TOKEN`. Schedule was already disabled (2026-05-09). |
| `.github/workflows/refresh-reddit-baselines.yml` | Removed `REDDIT_COLLECTOR_PROVIDER: apify` + `APIFY_API_TOKEN` from the baseline-refresh step |
| `.github/workflows/collect-funding.yml` | "Refresh X funding side-channel" step gated `if: false` (Apify-only path) |
| `.github/workflows/collect-twitter.yml` | Stripped `APIFY_API_TOKEN` + `APIFY_TWITTER_ACTOR` from the primary collect step. Default provider already `nitter`. |
| `.github/workflows/sweep-cross-source-mentions.yml` | Stripped `APIFY_API_TOKEN` env var (sweep auto-disables Apify-Twitter channel when missing) |

## Code paths left intact

These files still contain Apify-aware code paths. They are NOT removed because:

- The codepaths are well-tested and serve as documentation of the historical integration
- The kill switch is workflow-level (no env var → no Apify call), not codepath-level
- A future operator can opt in for a one-shot manual run by setting the env var locally + dispatching the workflow manually

| File | Why left intact |
| ---- | --------------- |
| `scripts/_apify-reddit-provider.mjs` | Reddit provider implementation; only invoked when `REDDIT_COLLECTOR_PROVIDER=apify` |
| `scripts/_apify-twitter-provider.ts` | Twitter provider implementation; only invoked when `TWITTER_COLLECTOR_PROVIDER=apify` |
| `scripts/_apify-proxy.mjs` | Shared HTTP wrapper for Apify run-sync endpoint |
| `scripts/scrape-reddit.mjs` | Branches on `REDDIT_COLLECTOR_PROVIDER` env var; default (empty) = public JSON |
| `scripts/collect-twitter-signals.ts` | Branches on `TWITTER_COLLECTOR_PROVIDER`; default = nitter |
| `scripts/_cross-source-search.mjs` | `searchTwitter()` returns `emptyResult` when `APIFY_API_TOKEN` is unset |
| `scripts/sweep-cross-source-mentions.ts` | Logs `APIFY_API_TOKEN missing — Twitter channel disabled` warn |
| `src/lib/pool/apify-twitter.ts` | Pool implementation; surfaced via `twitter-fallback.ts` only when the workflow sets the env |
| `scripts/__tests__/apify-twitter-provider.test.ts` | Unit test exercising the Apify provider — no live network calls |

## `apps/trendingrepo-worker/` — out of scope

`apps/trendingrepo-worker/` is a sister Railway service (per `CLAUDE.md`) and is on the project's no-touch list. It still contains Apify-aware fetchers (notably `x-funding`). The kill switch for that path is `if: false` on the `collect-funding.yml` step that invokes it. If the Railway service has its own cron that runs the Apify-dependent fetchers directly (outside GitHub Actions), that is an operator concern outside this repo's scope.

## Future operator: what to do if you need Apify back

1. Read this doc end-to-end. Confirm the budget reality.
2. Open a single PR that restores the env vars in exactly one workflow at a time. Do NOT batch all workflows in one PR.
3. Set a hard `concurrency` budget on the workflow (e.g. once-daily, not 20-min).
4. Add an Apify-spend dashboard link to the PR description.
5. Get an explicit "ship" from the operator before merging.

## References

- `CLAUDE.md` — anti-pattern: "Don't use cookie-based Twitter scrapers — dead provider" (this doc updates the broader provider policy)
- Memory: `~/.claude/projects/c--dev-trendingrepo/memory/project_reddit_apify_pivot.md` (out-of-repo auto-memory; not modifiable from a PR — author's note)
- Workflow history: see `git log -- .github/workflows/scrape-trending.yml` for the timeline of the Apify-on / Apify-off pivots since 2026-05-08
