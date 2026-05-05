# src/lib conventions

Server-side library code. Reader libs, data-store, scoring, auth,
provider pools. Anti-patterns burned into this repo live here.

## Refresh hooks: 30s rate-limit + in-flight dedupe is the design

Every reader lib that pulls from Redis exposes a
`refreshXxxFromStore()` async function (canonical example:
`refreshTrendingFromStore` in `trending.ts`). The shape is fixed:

- Calls `getDataStore().read(...)` for the relevant slugs.
- Swaps the returned payload into a module-local `let data = ...`
  cache only on a non-missing source.
- Internal `MIN_REFRESH_INTERVAL_MS = 30_000` short-circuits repeat
  calls within 30s.
- Single `inflight` promise dedupes concurrent callers.
- Never throws — on Redis miss, the existing in-memory cache stays.

**Calling these on every render is correct, not wasteful.** The
rate-limit + dedupe make it cheap. Sync getters then read whatever
the cache holds.

## Filesystem reads — forbidden for new data sources

Do NOT `readFileSync(process.cwd(), "data", ...)` for any new source.
That coupling is exactly what caused 17–34 deploys/day from data
churn (commit `87e3f4e`, 2026-04-26). Use the data-store. Bundled
JSON imports (`import x from "../../data/x.json"`) are allowed only
as the cold-start seed for an existing reader; they are not the
truth.

## GitHub PAT pool centralization

Every GitHub API caller goes through `github-token-pool.ts`. Direct
`process.env.GITHUB_TOKEN` reads on the hot path are forbidden. The
pool tracks per-token `remaining`/`reset`, quarantines 401s for 24h,
and throws when fully exhausted (silent degradation forbidden).

## Three-tier read pattern is sacred

`Redis → bundled JSON → in-memory last-known-good`. Defined in
`data-store.ts`. Don't reorder. Don't short-circuit.
