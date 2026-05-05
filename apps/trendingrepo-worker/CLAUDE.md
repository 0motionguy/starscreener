# trendingrepo-worker

Sister Railway service. Standalone npm package
(`@trendingrepo/worker`, private, ESM, Node >=20). Hosts ~30 fetchers
plus scoring/publish jobs. Talks to the same Redis the Next.js app
reads, but ships independently.

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
