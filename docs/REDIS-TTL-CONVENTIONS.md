---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Redis TTL Conventions (Per Prefix)

Owners: Backend + Platform

This is the authoritative TTL policy by Redis key prefix. Prefixes come from [`src/lib/redis/keys.ts`](../src/lib/redis/keys.ts), and TTL values are verified against the current writers.

## Prefix TTL Matrix

| Prefix | Purpose | TTL policy | Writer(s) |
|---|---|---|---|
| `ss:data:v1:<slug>` | Canonical payload cache | Default `86400s` (24h). Override per-write; `ttlSeconds: 0` means no expiry. | `src/lib/data-store.ts`, `scripts/_data-store-write.mjs` |
| `ss:meta:v1:<slug>` | Payload freshness/provenance sidecar | Matches payload TTL exactly (same `set` options as payload). | `src/lib/data-store.ts`, `scripts/_data-store-write.mjs` |
| `ss:stripe:event:<eventId>` | Stripe webhook idempotency lock | Fixed `86400s` (24h). | `src/lib/stripe/idempotency.ts` |
| `ss:llm:events:v1` | LLM events stream | No key TTL. Retention is stream trim (`xtrim`), not `expire`. | `src/lib/llm/*`, `/api/cron/llm/aggregate` |
| `ss:llm:gen-meta:v1` | LLM generation metadata stream | No key TTL. Retention is stream trim/length policy, not `expire`. | `src/lib/llm/*` |
| `ss:llm:agg:cursor` | LLM aggregator cursor checkpoint | No TTL (persistent cursor key). | `/api/cron/llm/aggregate` |
| `pool:github:tokens:<ns>:<label>` | Published token-state snapshot | No explicit TTL currently (state overwritten on publish). | `src/lib/github-token-pool.ts` |
| `pool:github:usage:<ns>:<fp>:<bucket>` | GitHub per-key hourly usage | Fixed `90000s` (25h). | `src/lib/pool/github-telemetry.ts` |
| `pool:github:quarantine:<ns>:<fp>` | GitHub key quarantine | Absolute expiry via `EXAT` at quarantine-until timestamp. | `src/lib/pool/github-telemetry.ts` |
| `pool:github:budget:used:samples` | Pool budget sample zset | No explicit TTL currently (rolling trim manages retention). | `src/lib/github-pool-budget.ts` |
| `pool:github:budget:used:alerted-at` | Budget alert cooldown marker | Fixed `3600s` (1h). | `src/lib/github-pool-budget.ts` |
| `pool:reddit:usage:<fp>:<bucket>` | Reddit per-UA hourly usage | Fixed `90000s` (25h). | `src/lib/pool/reddit-telemetry.ts` |
| `pool:reddit:quarantine:<fp>` | Reddit UA quarantine | Absolute expiry via `EXAT` at quarantine-until timestamp. | `src/lib/pool/reddit-telemetry.ts` |
| `pool:twitter:usage:<source>:<bucket>` | Twitter-source hourly usage | Fixed `90000s` (25h). | `src/lib/pool/twitter-telemetry.ts` |
| `pool:twitter:degradation:<bucket>` | Twitter degradation counters | Fixed `90000s` (25h). | `src/lib/pool/twitter-telemetry.ts` |
| `ratelimit:<source>:samples` | Rolling rate-limit headroom sample zset | No explicit TTL; retention enforced by score/rank trimming window. | `src/lib/rate-limit-headroom.ts` |
| `ratelimit:<source>:rolling` | Cached rolling stats hash | Fixed `90000s` (25h). | `src/lib/rate-limit-headroom.ts` |
| `ratelimit:<source>:alerted-at` | Headroom alert cooldown marker | Fixed `3600s` (1h). | `src/lib/rate-limit-headroom.ts` |

## Guardrails

1. New Redis keys must be registered in `src/lib/redis/keys.ts` before use.
2. New prefixes must add an explicit row to this document in the same PR.
3. Prefer explicit `EX`/`EXAT`; avoid implicit forever keys unless intentionally durable.
4. If a key uses rolling trim instead of TTL, document the trim window and owner.
