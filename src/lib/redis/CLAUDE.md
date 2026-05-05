---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Redis layer conventions

This directory holds Redis client glue and the canonical key registry
for the data-store. Read `src/lib/data-store.ts` first — it is the
contract this directory implements.

## Key construction — single source of truth

The only place a Redis key string is allowed to be constructed is
`keys.ts` (or whatever this dir's registry file is named). Everywhere
else imports a builder. No inline `\`ss:data:v1:${slug}\`` literals
anywhere in `src/` or `scripts/`.

The current namespaces are `ss:data:v1:<slug>` for payloads and
`ss:meta:v1:<slug>` for the writer-provenance / writtenAt sidecar.
Bump the `v1` only when the payload schema is breaking.

## Two backends, one contract

Both backends MUST satisfy the `RedisClientLike` shape defined in
`src/lib/data-store.ts`:

- `redis://` / `rediss://` URLs → ioredis (TCP, Railway-native).
- `https://` URL + REST token → Upstash REST.

Pick by URL scheme. Never both at once. Missing creds degrade silently
to file + memory tier (see `data-store.ts`).

## Three-tier read order is sacred

`Redis → bundled file → in-memory last-known-good`. Never reorder.
Never short-circuit. The whole point is graceful degradation when
Redis is brown — the page keeps rendering whatever it last saw.

## No throw-on-boot

Missing env never throws. One-shot warn in production, silent in dev.
Mirrors `data-store.ts:no-throw-on-boot` discipline.
