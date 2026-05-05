---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Fetcher conventions

Each fetcher = `<source>/index.ts` exporting a default `Fetcher`
(`name`, `schedule`, `run(ctx)`). Add new ones by copying `_template/`
(see its README for the step-by-step).

## Registry is mandatory

A fetcher does NOT run until imported AND appended to `FETCHERS` in
`../registry.ts`. Stub fetchers (`run()` throws Not Implemented) were
stripped 2026-05-05 — ship the real impl or leave it out of the
registry.

## `run(ctx)` shape

- Honor `ctx.dryRun` — return zeroed `RunResult`, no DB writes.
- Use `ctx.http.json<T>(...)` for upstream calls (ETag + 429/5xx
  retries built in). Never raw `fetch()`.
- Per-item try/catch — push to `result.errors`, keep going.
- `await upsertItem` then `await writeMetric`, then ONE
  `await publishLeaderboard(ctx.db, type)` per type touched.

## Stagger schedules

5-field UTC cron. Don't cluster at `0 * * * *` — blows the GitHub PAT
pool and the Redis write window.

## No inline Redis keys

Use `keys.payload(slug)` / `keys.meta(slug)` from
`../lib/redis-keys.ts`. `scripts/check-redis-keys.mjs` scans this dir.

## Bounded concurrency for LLM fetchers

Sequential sweeps blow hourly slots. See
`consensus-analyst/index.ts` for `ITEM_CONCURRENCY = 4` pattern.
