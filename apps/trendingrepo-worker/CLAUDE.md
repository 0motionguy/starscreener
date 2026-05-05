---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# trendingrepo-worker

Sister Railway service. Standalone npm package
(`@trendingrepo/worker`, private, ESM, Node >=20). 44 active fetchers in
`FETCHERS[]` (out of 54 dirs in `src/fetchers/` — `_template`, `arxiv`
[PLANNED, real writer is `scripts/scrape-arxiv.mjs`], plus 4 stub dirs
[`github`, `huggingface`, `mcp-so`, `mcp-servers-repo`] left on disk as
intent docs but intentionally NOT imported into the registry to avoid
Sentry "not yet implemented" spam every cron tick). Plus scoring/publish
jobs. Talks to the same Redis the Next.js app reads, but ships
independently.

Entrypoint: `src/index.ts` (cron mode via `croner`); see
`registry.ts` for the fetcher list and `schedule.ts` for cadences.

## LLM calls — Kimi For Coding endpoint quirks

The consensus-analyst fetcher calls `api.kimi.com/coding/v1` (model
`kimi-for-coding` = K2.6). Two non-negotiable rules — see
`src/fetchers/consensus-analyst/llm.ts`:

1. **`stream: true` is mandatory.** Non-stream calls hang silently
   for any non-trivial payload — no error, just dead socket. The
   wrapper streams + accumulates deltas + parses usage from the final
   chunk.
2. **User-Agent must be on the allowlist.** Send `User-Agent:
   claude-cli/1.0` (or RooCode / Kilo-Code). The OpenAI SDK's default
   UA gets `access_terminated_error`. The wrapper sets it via
   `defaultHeaders`.

For server-grade access, switch to `platform.moonshot.ai` (no UA
gate) by setting `KIMI_BASE_URL` + `KIMI_MODEL`.

## Consensus-analyst sweep — bounded concurrency only

K2.6 is ~80s per call. Sequential 14-call sweep = 18min and blows
the hourly slot. Use the bounded-concurrency queue pattern in
`src/fetchers/consensus-analyst/index.ts` with `ITEM_CONCURRENCY = 4`
(~5min wall, conservative on the subscription's concurrency cap).

## Redis writes

Writes go through `src/lib/redis.ts` (`readDataStore` /
`writeDataStore`) using the same `ss:data:v1:<slug>` namespace as the
Next.js app. Schemas validated with Zod at the fetcher boundary.

## Redis key construction — single source of truth

Every Redis key built anywhere in `apps/trendingrepo-worker/src/` MUST
flow through the registry at `src/lib/redis-keys.ts` (sibling to the
flat `src/lib/redis.ts` Redis glue — kept flat to avoid colliding with
the main app's `protect-files.mjs` hook on `src/lib/redis/keys.ts`).
No inline `\`ss:data:v1:${slug}\`` template literals. Violations are
caught by `<repo>/scripts/check-redis-keys.mjs`, which now scans this
directory too (wired into `npm run lint:guards` at the repo root).

Builders today:

- `keys.payload(slug)` / `keys.meta(slug)` — data-store payload + meta
  sidecar. MUST stay byte-identical with the main app's
  `<repo>/src/lib/redis/keys.ts` (same `ss:data:v1` / `ss:meta:v1`
  namespaces). Bump `v1` only via a coordinated migration across both.
- `keys.dailySnapshot(slug, date)` /
  `keys.dailySnapshotMeta(slug, date)` — daily roll-window keys for
  the snapshot fetchers (`hotness-snapshot`, `mcp-usage-snapshot`,
  `skill-forks-snapshot`, `skill-install-snapshot`).
- `keys.worker.healthcheck()` — `tr:healthcheck`, the only
  worker-private namespace; written by `server.ts` for Railway TCP
  liveness, never read by the Next.js app.

Adding a new key? Add the builder to `redis-keys.ts` first, then call
it from the fetcher. The lint guard fails the build otherwise.
