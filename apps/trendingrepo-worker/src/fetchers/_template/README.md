# Adding a fetcher

1. Copy `_template/` to `../<your-source>/`.
2. Rename `name` (lowercase, becomes the CLI arg).
3. Set `schedule` (UTC 5-field cron). Stagger from peers.
4. Implement `run(ctx)`:
   - `ctx.http.json<T>(url, opts)` for upstream calls (ETag + 429/5xx retries built in).
   - Normalize each record to `NormalizedItem`.
   - For each: `await upsertItem(ctx.db, { item })` then `await writeMetric(ctx.db, id, metric)`.
   - After all writes: `await publishLeaderboard(ctx.db, type)` once per type touched.
   - Honor `ctx.dryRun` - log only, skip writes.
   - Wrap each item in try/catch. Push errors to `result.errors`, keep going.
5. Add `import yourFetcher from './fetchers/<your-source>/index.js'` to `src/registry.ts` and append to `FETCHERS`.

Crawl-only sources: set `requiresFirecrawl: true`.
