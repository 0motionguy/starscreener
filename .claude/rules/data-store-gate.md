---
name: data-store-gate
description: Data reads go through refreshXxxFromStore() — never readFileSync, never direct Redis from a route handler
paths:
  - src/lib/data-store/**
  - src/**/page.tsx
  - src/**/route.ts
---

# Data store gate — `refreshXxxFromStore()` is the ONLY entry

Server components and route handlers MUST read data via the per-source refresh hook:

```ts
// at the top of the file:
await refreshTrendingFromStore();
// thereafter, only sync getters:
const trending = getTrendingFromCache();
```

Reference pattern: `src/lib/trending.ts::refreshTrendingFromStore` (cited by `CLAUDE.md:46`).

## Why this exists

`src/lib/data-store.ts` is the three-tier reader (per `CLAUDE.md:26`):

1. **Redis** — HOSTUP-internal via `ioredis` (or legacy Upstash REST). Source of truth for worker-owned payloads.
2. **Bundled file** — fallback JSON baked into the deploy artifact.
3. **In-memory last-known-good** — survives Redis blip / cold start.

Each `refreshXxxFromStore()` hook has internal **30s rate-limit + in-flight dedupe** — so calling it on every render is cheap. Plan + provisioning: `tasks/data-api.md`.

## Forbidden

- `readFileSync(process.cwd(), "data", ...)` for any new data source. The reason filesystem reads worked at all is that bundled JSON is baked into each deploy — that coupled data freshness to deploys and caused 17-34 deploys/day from data churn alone (commit `87e3f4e`, 2026-04-26). Source: `CLAUDE.md:83`.
- Importing `ioredis` / `@upstash/redis` directly into a route or component. They are `serverExternalPackages` in `next.config.ts:161`; client bundles are aliased to `src/lib/empty-module.js` in `next.config.ts:143-155`.
- Mocking Redis in tests that exercise scoring logic. 2026-Q1 incident — see `CLAUDE.md:81`.

## When editing

- Verify the page is reading through a refresh hook before adding more reads. `Grep -n "readFileSync\\|fs\\.read" src/<file>` should return nothing for new code.
- `npm run verify:data-store` confirms Redis reachability (`package.json:86`).
- New collector? Wire `writeDataStore("<slug>", payload)` from `scripts/_data-store-write.mjs` — file mirror is allowed during transition but Redis is the truth (`CLAUDE.md:84`).
