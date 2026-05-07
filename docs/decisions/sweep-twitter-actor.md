# ADR: keep `apidojo~tweet-scraper` as the default sweep actor, env-configurable

**Status**: accepted, 2026-05-07.
**Scope**: `scripts/sweep-cross-source-mentions.ts` Twitter channel + the existing `scripts/_apify-twitter-provider.ts` per-repo collector.

## Context

The cross-source mentions sweep emits Apify run-sync calls 4× / day at top-50 + 1× / day at top-200, ≈ 250 actor invocations / day. Apify's Twitter actor marketplace has a wide price ladder (USD per 1k tweets, observed 2026-05):

- `xquik~twitter-x-data-scraper-pay-per-result` — $0.15
- `microworlds~twitter-scraper` — $0.25
- `apidojo~tweet-scraper` — $0.40 (current default)
- `apify~twitter-scraper` — $0.50

A head-to-head probe on the same Tier-1 query bundle for one repo (`modem-dev/hunk`, ~10 queries):

- `xquik` returned 100 tweets
- `apidojo` returned 50 tweets

xquik is roughly 2.5× cheaper per delivered tweet at face value. But across multi-week real-world use the team has run `apidojo` continuously since 2026-Q1 and observed: stable schema, no silent rate-limit drops, query-bundle compatibility (handles all four Tier-1 templates from `buildTwitterQueryBundle`), and a predictable run-sync latency of 30-60s.

## Decision

Keep `apidojo~tweet-scraper` as the default. Make it env-configurable so an operator can swap to `xquik` (or any other actor) without a code change:

```sh
# .env.local or Vercel project settings
APIFY_TWITTER_ACTOR=xquik~twitter-x-data-scraper-pay-per-result
```

Both `scripts/_apify-twitter-provider.ts` (the long-running per-repo collector for `/twitter`) and the new `_cross-source-search.mjs` Twitter adapter read the same env var, falling back to `apidojo~tweet-scraper` when unset.

## Rationale

1. **Reliability over cost at current volume.** 250 invocations × 25 tweets × $0.40 / 1000 = ~$2.50 / day. The cost delta to xquik is ≈ $1.50 / day. Below the noise floor of one outage day's worth of debugging time.
2. **Schema risk.** Different actors emit subtly different tweet records. The current adapter assumes apidojo's shape (`t.author?.userName`, `t.likeCount`, `t.createdAt`). Swapping the default would force a migration we don't need.
3. **Operator override is sufficient.** If/when sweep volume grows (e.g. expanding to top-500 daily), an operator can flip the env var, re-validate the schema, and pocket the savings without a deploy.

## Consequences

- New env var `APIFY_TWITTER_ACTOR` documented in [ENGINE.md](../ENGINE.md) §5e.
- Default Twitter sweep cost stays at ≈ $2.50 / day at current top-50 6h cadence + top-200 daily.
- If `apidojo` schema drifts or pricing changes, the operator override path lets us migrate without a code release.
- If we ever swap to `xquik` as default, the pre-flight check is: re-run the 10-query probe head-to-head, diff the emitted Mention shapes, update `_cross-source-search.mjs:searchTwitter()` field accessors if needed.

## Sources

- Per-repo provider env hook: [scripts/_apify-twitter-provider.ts](../../scripts/_apify-twitter-provider.ts) (line 65: `process.env.APIFY_TWITTER_ACTOR`)
- Sweep adapter: [scripts/_cross-source-search.mjs](../../scripts/_cross-source-search.mjs) (line ~405, `actorId = opts.actorId ?? "apidojo~tweet-scraper"`)
- Apify pricing snapshots taken from each actor's marketplace listing on 2026-05-06.
