---
name: redis-key-design
description: Fires when the user mentions Redis keys, schema changes, new data sources, key naming, ss:data:v1 namespace, or anything touching src/lib/redis/. Trigger phrases include "redis key", "new key", "schema migration", "key naming", "data-store key", "upstash key", "ioredis", "rename a key", "namespace a key", "evict a key".
---

# Redis Key Design

STARSCREENER's Redis layer is the source of truth for 30 cron-driven payloads. Keys are
NOT scattered string literals -- every key flows through a single registry so renames,
TTL changes, and analytics stay coherent. This skill enforces that contract.

## When to fire

Trigger phrases:
- "redis key", "redis schema", "key naming", "key rename"
- "new data source", "new slug", "data-store key"
- "ss:data:v1", "upstash key", "ioredis key"
- "evict", "TTL", "expire a key"

## The contract

1. ALL keys are built via helpers in `src/lib/redis/keys.ts` (Wave 1 / Wave 4 landed).
   Inline string keys (e.g. `redis.get("ss:data:v1:foo")`) are a code smell -- flag them.
   `npm run lint:redis-keys` enforces this; do not bypass.
2. Namespace prefix is `ss:data:v1:`. Bumping `v1` is a migration, not a rename.
3. Slug is `kebab-case` and matches the route segment under `src/app/api/cron/<slug>/`
   AND the file under `data/<slug>.json` AND the data-store write call.
4. The three-tier read is sacred: Redis -> bundled file -> in-memory last-known-good.
   Every new source MUST plug into this order via `src/lib/data-store.ts`. No bespoke
   read paths.

## Procedure for a key change

1. Open `src/lib/redis/keys.ts` and add/rename the helper. If the file does not exist
   yet (pre-Phase-4), create it and migrate the inline call sites in the same PR.
2. Update the slug table in `tasks/data-api.md` (canonical list).
3. If renaming, write a one-shot migration script under `scripts/migrations/redis-<date>-<slug>.mjs`
   that copies old -> new and deletes old. Run it once per environment.
4. Update `.env.example` if a new env var is needed (almost never -- prefer one Redis pair).
5. Run `npm run verify:data-store` after migration to confirm read fidelity.

## Delegation

For non-trivial schema changes (new compound keys, TTL strategy, index sets), dispatch
the `redis-schema-reviewer` subagent with the proposed key shape, expected access
patterns, and write/read frequency. Wait for its sign-off before applying.

## Three-tier read -- do not break it

```
async refreshXFromStore() -> Redis (with 30s rate-limit + in-flight dedupe)
                          -> bundled data/x.json (cold start fallback)
                          -> in-memory cache (last-known-good)
```

Pattern reference: `src/lib/trending.ts:refreshTrendingFromStore`.
Server components call the async refresh ONCE at the top, then sync getters return cached
values for the rest of the render. This is why home page renders are cheap.

## Anti-patterns

- Inline `redis.get("ss:data:v1:...")` strings outside `keys.ts`.
- Mocking Redis in tests that exercise scoring logic (2026-Q1 incident).
- Setting both `REDIS_URL` AND `UPSTASH_REDIS_REST_URL` (pick exactly one).
- Bypassing `data-store.ts` for "just one quick read".
- Committing a key rename without the migration script.
