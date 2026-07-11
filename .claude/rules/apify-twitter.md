---
name: apify-twitter
description: Twitter signals come from Apify `apidojo~tweet-scraper` actor — cookie providers are dead
paths:
  - src/collectors/twitter/**
  - src/lib/twitter/**
  - scripts/_apify-twitter-provider.ts
  - scripts/_twitter-web-provider.ts
  - scripts/_twitter-collector.ts
  - scripts/collect-twitter-signals.ts
  - scripts/__tests__/apify-twitter-provider.test.ts
  - scripts/__tests__/twitter-collector.test.ts
---

# Apify Twitter — the only sanctioned provider

From `CLAUDE.md:49`:

> **Twitter** uses Apify `apidojo~tweet-scraper` actor. Cookie-based providers are dead post-2026 anti-bot. Apify actor runs 4 query templates per tracked repo per scan.

Verified in `scripts/_apify-twitter-provider.ts:25`:

```ts
const DEFAULT_ACTOR = "apidojo~tweet-scraper";
```

## Why direct GraphQL is dead

From the inline `Why:` comment at `scripts/_apify-twitter-provider.ts:6-11`:

> Twitter's 2026 anti-bot returns HTTP 200 + empty body to our direct GraphQL calls (missing x-client-transaction-id, likely TLS fingerprinting too). Apify runs a managed scraper on residential IPs and returns clean JSON — we skip the anti-bot arms race entirely.

## Required env

```
TWITTER_COLLECTOR_PROVIDER=apify
APIFY_API_TOKEN=<token>                       # required
APIFY_TWITTER_ACTOR=apidojo~tweet-scraper     # optional override (defaults to above)
```

(Source: same file, lines 14-17.)

## Budget control

Each search call = one actor run = one billable event. The default actor `apidojo/tweet-scraper` is pay-per-result. Keep `queriesPerRepo` low (default 1 search per repo via `repo_slug`) to control cost (source: `_apify-twitter-provider.ts:18-20`).

The 4-query-templates-per-repo number in `CLAUDE.md:49` is the **upper bound** per scan, not a default — `collect:twitter` (`scripts/collect-twitter-signals.ts`) clamps based on configured cadence.

## When editing

- Don't switch Twitter collector back to API mode (`CLAUDE.md:80`).
- Don't use cookie-based Twitter scrapers — dead provider (`CLAUDE.md:82`).
- Don't change `DEFAULT_ACTOR` without founder approval — it's a billable contract with Apify.
- `npm run collect:twitter:dry` (`package.json:108`) writes a preview to `.tmp/twitter-collector-preview.json` without ingesting — use it before hammering the budget.
- Tests live at `scripts/__tests__/apify-twitter-provider.test.ts` and `scripts/__tests__/twitter-collector.test.ts` (`package.json:78`).
- Synthetic data purge: `npm run purge:twitter:synthetic` (`package.json:109`) → `scripts/purge-twitter-synthetic-data.ts`.

## CI

`collect-twitter.yml` is **`workflow_dispatch`-only** (verified in file head — `# Manual-only: HOSTUP worker/runtime owns production freshness`). Production freshness for Twitter is HOSTUP worker-owned; GHA is kept for explicit backfills.
