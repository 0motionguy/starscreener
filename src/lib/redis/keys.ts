// Single source of truth for Redis key construction.
//
// Every Redis key built anywhere in `src/` MUST flow through this registry.
// No inline `redis.get("foo:bar:" + slug)` template literals — those are
// caught by `scripts/check-redis-keys.mjs` (wired into `npm run lint:guards`).
//
// Namespace inventory (built from the existing codebase, not invented):
//   ss:data:v1:<slug>              — data-store payloads (canonical writer:
//                                    src/lib/data-store.ts:NAMESPACE)
//   ss:meta:v1:<slug>              — data-store writer-provenance sidecar
//                                    (src/lib/data-store.ts:META_NAMESPACE)
//   ss:stripe:event:<eventId>      — Stripe webhook idempotency lock
//                                    (src/lib/stripe/idempotency.ts)
//   ss:llm:events:v1               — LLM event Stream
//                                    (src/lib/llm/types.ts)
//   ss:llm:gen-meta:v1             — LLM gen-meta Stream
//   ss:llm:agg:cursor              — LLM aggregator stream cursor
//   pool:github:tokens:<ns>:<lbl>  — fleet-published per-token state
//                                    (src/lib/github-token-pool.ts)
//   pool:github:usage:<ns>:<fp>:<bucket>      — per-key hourly call counters
//   pool:github:quarantine:<ns>:<fp>          — per-key quarantine state
//   pool:github:budget:used:samples           — budget z-set sample stream
//   pool:github:budget:used:alerted-at        — Sentry alert dedupe stamp
//   pool:reddit:usage:<fp>:<bucket>           — per-UA hourly call counters
//   pool:reddit:usage30m:<fp>:<bucket>        — per-UA per-minute counters
//   pool:reddit:quarantine:<fp>               — per-UA quarantine state
//   pool:twitter:usage:<source>:<bucket>      — per-source hourly counters
//   pool:twitter:degradation:<bucket>         — degradation hourly counter
//   ratelimit:<source>:samples                — rate-limit-headroom z-set
//   ratelimit:<source>:rolling                — rolling-window snapshot hash
//   ratelimit:<source>:alerted-at             — Sentry alert dedupe stamp
//   recovery:<source>:<attemptAt>             — sources-auto-recover event
//   recovery:last:<source>                    — last recovery record
//   recovery:last-attempt:<source>            — recovery throttle stamp
//   recovery:streak:<source>                  — failure streak counter
//
// Design notes:
//   - The `pool:` and `ratelimit:` namespaces predate the `ss:` migration;
//     do NOT renamespace them here — that's a separate Redis migration with
//     dual-read/dual-write transition cost.
//   - `<ns>` for GitHub keys is the active GITHUB_POOL_NAMESPACE
//     (e.g. `prod`, `test`). Callers pass it in; this registry stays pure.
//   - Bucket strings are the existing `YYYY-MM-DD-HH` format produced by
//     `new Date().toISOString().slice(0, 13).replace("T", "-")`.

const SS = "ss";
const DATA_VERSION = "v1";
const META_VERSION = "v1";

export const keys = {
  // ---------------------------------------------------------------------
  // Data-store (canonical payload + meta sidecar)
  // ---------------------------------------------------------------------
  payload: (slug: string) => `${SS}:data:${DATA_VERSION}:${slug}`,
  meta: (slug: string) => `${SS}:meta:${META_VERSION}:${slug}`,

  // ---------------------------------------------------------------------
  // Stripe idempotency (cross-instance lock for webhook events)
  // ---------------------------------------------------------------------
  stripe: {
    event: (eventId: string) => `${SS}:stripe:event:${eventId}`,
  },

  // ---------------------------------------------------------------------
  // LLM event streams + aggregator cursor
  // ---------------------------------------------------------------------
  llm: {
    eventsStream: () => `${SS}:llm:events:v1`,
    genMetaStream: () => `${SS}:llm:gen-meta:v1`,
    aggregatorCursor: () => `${SS}:llm:agg:cursor`,
  },

  // ---------------------------------------------------------------------
  // GitHub PAT pool (fleet-aggregate state + telemetry + budget)
  // ---------------------------------------------------------------------
  pool: {
    github: {
      /** Fleet-published per-token state. ns is `prod`/`test`/etc. */
      tokenStatePrefix: (ns: string) => `pool:github:tokens:${ns}`,
      tokenState: (ns: string, tokenLabel: string) =>
        `pool:github:tokens:${ns}:${tokenLabel}`,
      /** Per-key hourly counters. bucket is `YYYY-MM-DD-HH`. */
      usage: (ns: string, fingerprint: string, bucket: string) =>
        `pool:github:usage:${ns}:${fingerprint}:${bucket}`,
      /** Per-key quarantine state. */
      quarantine: (ns: string, fingerprint: string) =>
        `pool:github:quarantine:${ns}:${fingerprint}`,
      /** Rolling z-set of pool-wide used%. */
      budgetSamples: () => "pool:github:budget:used:samples",
      /** Sentry alert cooldown stamp. */
      budgetAlertedAt: () => "pool:github:budget:used:alerted-at",
    },
    reddit: {
      /** Per-UA hourly counters. fingerprint is sha256(UA) prefix. */
      usage: (fingerprint: string, bucket: string) =>
        `pool:reddit:usage:${fingerprint}:${bucket}`,
      /** Per-UA per-minute counters. bucket is `YYYY-MM-DD-HH-mm`. */
      usage30m: (fingerprint: string, bucket: string) =>
        `pool:reddit:usage30m:${fingerprint}:${bucket}`,
      /** Per-UA quarantine. */
      quarantine: (fingerprint: string) =>
        `pool:reddit:quarantine:${fingerprint}`,
    },
    twitter: {
      /** Per-source hourly counters. source is `apify`/`nitter`. */
      usage: (source: string, bucket: string) =>
        `pool:twitter:usage:${source}:${bucket}`,
      /** Hourly degradation counter (apify -> nitter fallback). */
      degradation: (bucket: string) => `pool:twitter:degradation:${bucket}`,
    },
  },

  // ---------------------------------------------------------------------
  // Per-source rate-limit headroom telemetry
  // ---------------------------------------------------------------------
  rateLimit: {
    samples: (source: string) => `ratelimit:${source}:samples`,
    rolling: (source: string) => `ratelimit:${source}:rolling`,
    alertedAt: (source: string) => `ratelimit:${source}:alerted-at`,
  },

  // ---------------------------------------------------------------------
  // sources-auto-recover (cron self-heal records)
  // ---------------------------------------------------------------------
  recovery: {
    event: (source: string, attemptAt: string) =>
      `recovery:${source}:${attemptAt}`,
    last: (source: string) => `recovery:last:${source}`,
    lastAttempt: (source: string) => `recovery:last-attempt:${source}`,
    streak: (source: string) => `recovery:streak:${source}`,
  },
} as const;

export type Keys = typeof keys;
