# AGN-1497 Collector retry/backoff compliance scan (2026-05-05)

## Scope
- Issue: `AGN-1497`
- Owner lane: Data Pipeline
- Surfaces scanned: `.github/workflows/**` collector jobs, `scripts/**` collector helpers, collector entrypoints, and `src/lib/data-store.ts` integration notes.

## Mandatory opening + freshness gate
- Opening bundle re-read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness check result at heartbeat time:
  - Command: `npm run freshness:check`
  - Result: `GET http://localhost:3023/api/health?soft=1 -> HTTP 500 Internal Server Error`
  - Classification: `localhost:3023` reachable (not missing), product stale/degraded.

## Compliance rule used
- `COMPLIANT`: request path has explicit retry/backoff logic (script-level or shared helper), including 429/5xx handling and bounded attempts.
- `PARTIAL`: timeout/throttle exists but retry/backoff coverage is incomplete for transient failures.
- `GAP`: collector path has no effective retry/backoff on transient failures (429/5xx/network) where expected.

## Evidence summary

### Compliant coverage (sampled high-traffic collectors)
- Shared retry utility:
  - `scripts/_fetch-json.mjs:1` default retry statuses include `408, 429, 500, 502, 503, 504`.
  - `scripts/_fetch-json.mjs:55-58` attempts/retryDelay/timeout tunables.
  - `scripts/_fetch-json.mjs:76-91` retries with `Retry-After` aware delay.
- Trending backbone:
  - `scripts/scrape-trending.mjs:81-85` uses `fetchJsonWithRetry` with `attempts: 3`.
- Reddit:
  - `scripts/scrape-reddit.mjs:675-679` explicit 429 retry with sleep backoff.
- arXiv:
  - `scripts/scrape-arxiv.mjs:206-229` retries 429/5xx and honors `Retry-After`.
- NPM:
  - `scripts/scrape-npm.mjs:307-311` and `:401-405` use `fetchJsonWithRetry` with 4 attempts.
- HF family:
  - `scripts/scrape-huggingface.mjs:179-187`, `scrape-huggingface-datasets.mjs:93-97`, `scrape-huggingface-spaces.mjs:164-168`.
- HN/DevTo/Bluesky/ProductHunt entrypoints rely on retry-capable shared helpers:
  - `scripts/scrape-hackernews.mjs:29` -> `_hn-shared.mjs`
  - `scripts/scrape-devto.mjs:33` -> `_devto-shared.mjs`
  - `scripts/scrape-bluesky.mjs:38` -> `_bluesky-shared.mjs`
  - `scripts/scrape-producthunt.mjs:35` -> `_ph-shared.mjs`

### Partial/Gap findings
1. GAP: funding RSS collector path lacks retry/backoff
- `scripts/scrape-funding-news.mjs:438-455` uses `fetchWithTimeout` once and returns `[]` on failure; no retry/backoff for 429/5xx.
- Impact: transient upstream errors can silently drop a full source batch for the run.

2. PARTIAL: crunchbase funding fallback has bounded retry but no 429-specific backoff policy
- `scripts/scrape-funding-crunchbase.ts:60-88` retries once with fixed `1500ms`; handles generic failures and 5xx retry path.
- Gap nuance: no `Retry-After` parsing and no explicit 429 branch; better than none, weaker than baseline shared retry policy.

3. PARTIAL: twitter collector ingress path has timeout but no retry around direct fetches/post
- `scripts/collect-twitter-signals.ts:344-358` `fetchText` performs single attempt with timeout and throws on non-OK.
- `scripts/collect-twitter-signals.ts:733-745` ingest POST to internal API is single attempt; no retry/backoff.
- Workflow also runs single collector invocation without wrapper retry:
  - `.github/workflows/collect-twitter.yml:80` `npm run collect:twitter`.
- Note: provider-level account rotation/backoff exists in web provider (`scripts/_twitter-web-provider.ts:544-569`) but does not cover all direct fetch/post calls in `collect-twitter-signals.ts`.

## Outcome
- Overall status: **PARTIAL COMPLIANCE**.
- High-confidence gaps needing remediation in owned surfaces:
  - Funding RSS collector retry/backoff.
  - Twitter collector direct fetch + ingest POST retry/backoff.

## Recommended follow-up tasks
- Add shared `fetchJsonWithRetry`/`Retry-After` logic (or equivalent wrapper) to:
  - `scripts/scrape-funding-news.mjs` RSS fetch path.
  - `scripts/collect-twitter-signals.ts` direct fetch + internal ingest POST path.
- Keep append-only JSONL semantics unchanged when adding retries.
