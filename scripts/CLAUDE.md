---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# scripts/ conventions

144 scripts. Match the prefix when adding new ones — discoverability
and CI wiring depend on it.

## Naming prefixes

- `scrape-<source>.mjs` — collector entrypoint. Wire to
  `npm run scrape:<source>` AND a workflow under `.github/workflows/`.
- `collect-*.ts` — TS collectors (Twitter/funding) via tsx.
- `check-*.mjs` — CI guard. Exit 1 on violation. Add to
  `npm run lint:guards` if it should run pre-commit/CI.
- `audit-*.mjs` — read-only report. Never writes. Not in CI by default.
- `_*.mjs` — shared helper, not an entrypoint
  (`_data-store-write.mjs`, `_load-env.mjs`, `_logger.mjs`,
  `_github-token-pool-mini.mjs`).

## Collectors dual-write through `_data-store-write.mjs`

Don't roll your own Redis client. `writeDataStore(slug, payload)`
mirrors `src/lib/data-store.ts`, handles missing-env graceful-skip,
and writes BOTH `ss:data:v1:<slug>` + `ss:meta:v1:<slug>`.

## Plain `node`, not tsx

Collectors run from GitHub Actions as `node scripts/scrape-foo.mjs`.
TS on the collector hot path is an exception (wired through tsx in
`package.json`).

## GitHub API + env

Use `_github-token-pool-mini.mjs` — direct
`process.env.GITHUB_TOKEN` reads forbidden. Top of every script:
`import "./_load-env.mjs"`. Never call `dotenv.config()` directly.
