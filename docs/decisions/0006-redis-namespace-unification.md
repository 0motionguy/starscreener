---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# ADR 0006: Redis namespace unification (deferred plan)

- Status: Proposed (2026-05-05)
- Related: ADR 0002 (Multi-tier cache architecture), ADR 0004 (Redis primary +
  worker-only Supabase analytics)
- Origin: Wave 5 audit of `src/lib/redis/keys.ts` (Phase 4 docs restructure)

## Context

Phase 4 of the 2026-05-05 docs restructure centralized Redis key construction
into `src/lib/redis/keys.ts` (main app) and
`apps/trendingrepo-worker/src/lib/redis-keys.ts` (worker). Both registries are
guarded by `scripts/check-redis-keys.mjs` (wired into `npm run lint:guards`),
so no inline template literals exist outside those two files.

The centralization preserved existing namespaces verbatim. It did NOT unify
them. As a result the live Redis keyspace today is a mix of two prefix
families:

### Current namespaces (main app, src/lib/redis/keys.ts)

| Group        | Prefix              | Builder count | Example key                                       |
|--------------|---------------------|---------------|---------------------------------------------------|
| payload      | `ss:data:v1:`       | 1             | `ss:data:v1:trending`                             |
| meta         | `ss:meta:v1:`       | 1             | `ss:meta:v1:trending`                             |
| stripe       | `ss:stripe:event:`  | 1             | `ss:stripe:event:evt_123`                         |
| llm          | `ss:llm:`           | 3             | `ss:llm:events:v1`                                |
| pool.github  | `pool:github:`      | 6             | `pool:github:tokens:prod:abcd`                    |
| pool.reddit  | `pool:reddit:`      | 2             | `pool:reddit:usage:abcd:2026-05-05-04`            |
| pool.twitter | `pool:twitter:`     | 2             | `pool:twitter:usage:apify:2026-05-05-04`          |
| ratelimit    | `ratelimit:`        | 3             | `ratelimit:github:samples`                        |
| recovery     | `recovery:`         | 4             | `recovery:hn:2026-05-05T04:15:26Z`                |

Main-app totals: 9 namespace groups, 23 builders. Six groups carry the `ss:`
root (6 builders); five groups carry a bare prefix (17 builders).

### Current namespaces (worker, apps/trendingrepo-worker/src/lib/redis-keys.ts)

| Group              | Prefix             | Builder count | Example key                              |
|--------------------|--------------------|---------------|------------------------------------------|
| payload            | `ss:data:v1:`      | 1             | `ss:data:v1:trending`                    |
| meta               | `ss:meta:v1:`      | 1             | `ss:meta:v1:trending`                    |
| dailySnapshot      | `ss:data:v1:`      | 2             | `ss:data:v1:hotness-snapshot:2026-05-05` |
| deltas             | `ss:data:v1:`      | 2             | `ss:data:v1:deltas:snapshot:1714900000`  |
| pool.github        | `pool:github:`     | 1             | `pool:github:tokens:abcd`                |
| http               | `tr:`              | 2             | `tr:etag:https://api.github.com/...`     |
| worker.healthcheck | `tr:`              | 1             | `tr:healthcheck`                         |

Worker totals: 7 namespace groups, 10 builders. Three groups carry `ss:`
(6 builders); two groups carry bare prefixes (4 builders, `pool:` + `tr:`).

### Inconsistency

- `ss:` root carries `data:`, `meta:`, `stripe:`, `llm:`.
- Bare prefixes carry `pool:`, `ratelimit:`, `recovery:` (main app) and `tr:`
  (worker only).
- Worker `pool:github:tokens:<label>` is FLAT; main app
  `pool:github:tokens:<ns>:<label>` carries an extra namespace segment.

The split is historical: `ss:` keys went through the data-store API
(`src/lib/data-store.ts:NAMESPACE`); bare-prefix keys came from older
direct-Redis usage in `github-token-pool.ts`, `rate-limit-tracker.ts`,
`sources-auto-recover`, and the worker's HTTP ETag cache.

## Decision (proposed)

Defer the migration. **Activate this ADR only when a Redis rebuild or major
version bump is planned.**

If/when activated, the migration shape is:

1. Add `ss:` prefix to all bare keys: `pool:` -> `ss:pool:`, `ratelimit:` ->
   `ss:ratelimit:`, `recovery:` -> `ss:recovery:`, `tr:` -> `ss:tr:`.
2. Add a worker `<ns>` segment to `pool:github:tokens:<label>` to match the
   main-app shape (`ss:pool:github:tokens:<ns>:<label>`).
3. Implement dual-read in every reader: try new key first, fall back to old.
4. Implement single-write to the new key only.
5. Run for 1-2 cron cycles (cooldown + budget TTLs are <= 24h; ETag TTL 7d).
6. After all old keys expire, drop the dual-read fallback.

## Consequences

Positive:
- Single root namespace makes Redis-side debugging easier (`KEYS ss:*`
  enumerates the entire app footprint; today you need three globs).
- Cleaner migration story for any future namespace bumps (`ss:v1` -> `ss:v2`).
- Aligns main-app and worker `pool:github:tokens:*` shape, removing the
  cross-package divergence currently called out in both registries.

Negative:
- Non-trivial migration with dual-read complexity across ~21 builders.
- Without an actual incident, low ROI - the lint guard already prevents
  inline-literal drift.
- ETag cache TTL is 7 days - the dual-read window for `tr:` would dominate
  the migration timeline.

## Tracking

The migration script lives in this repo at
`scripts/migrate-redis-namespaces.mjs` (NOT YET CREATED - placeholder for
activation).

## Activation criteria

Activate this ADR if:
- Planning a Redis instance rebuild or major version migration.
- A user-facing incident traces to namespace ambiguity (e.g. accidental
  cross-app collision on a bare prefix).
- Pool keys need TTL/quota changes that are easier to reason about under a
  unified prefix.
- The worker's flat `pool:github:tokens:<label>` shape causes a coordination
  bug with the main app's namespaced shape.

Until then, the two registries (`src/lib/redis/keys.ts` +
`apps/trendingrepo-worker/src/lib/redis-keys.ts`) remain the single source of
truth and the lint guard prevents regression.

## References

- `src/lib/redis/keys.ts` - main-app key registry
- `apps/trendingrepo-worker/src/lib/redis-keys.ts` - worker key registry
- `src/lib/redis/CLAUDE.md` - namespace conventions
- `scripts/check-redis-keys.mjs` - inline-literal guard
- ADR 0002 - multi-tier cache architecture
- ADR 0004 - Redis primary, worker-only Supabase
