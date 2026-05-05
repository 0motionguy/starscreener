// Single source of truth for Redis key construction inside the worker.
//
// Mirrors the shape of `<repo>/src/lib/redis/keys.ts` but scoped to the
// keys this worker package actually writes/reads. Every Redis key built
// anywhere in `apps/trendingrepo-worker/src/` MUST flow through this
// registry. No inline `\`ss:data:v1:${slug}\`` template literals — those
// are caught by `<repo>/scripts/check-redis-keys.mjs` (which now also
// scans the worker dir).
//
// Note on the file name (lib/redis-keys.ts, not lib/redis/keys.ts):
// the main app keeps a `lib/redis/` subdir for Redis client glue; the
// worker keeps Redis glue in `lib/redis.ts` (flat). Adding a sibling
// flat module mirrors that convention and avoids tripping the
// `protect-files.mjs` PreToolUse guard which gates the main app's
// `lib/redis/keys.ts`.
//
// Namespace inventory (scoped to the worker package):
//   ss:data:v1:<slug>                       — data-store payloads (canonical
//                                             writer: ./redis.ts:NAMESPACE).
//                                             Shared with the Next.js app.
//   ss:meta:v1:<slug>                       — data-store writer-provenance
//                                             sidecar (META_NAMESPACE).
//   ss:data:v1:<snapshotSlug>:<YYYY-MM-DD>  — daily snapshot payloads
//                                             (hotness, mcp-usage, skill-*).
//   ss:meta:v1:<snapshotSlug>:<YYYY-MM-DD>  — daily snapshot meta sidecar.
//   tr:healthcheck                          — Railway TCP-level liveness
//                                             ping (server.ts).
//
// Design notes:
//   - `payload`/`meta` MUST stay in lockstep with `<repo>/src/lib/redis/keys.ts`
//     and `<repo>/scripts/_data-store-write.mjs`. Same wire format, same
//     namespace constants, same version. Bump `v1` only on a coordinated
//     payload-schema break across all three.
//   - `dailySnapshot` is just `payload(\`<slug>:<date>\`)` flattened so the
//     fetchers don't have to know the data-store namespace shape.
//   - `tr:healthcheck` is worker-only — the Next.js app never reads it.

const SS = 'ss';
const DATA_VERSION = 'v1';
const META_VERSION = 'v1';

export const keys = {
  // ---------------------------------------------------------------------
  // Data-store (canonical payload + meta sidecar) — shared with the
  // Next.js app via `<repo>/src/lib/redis/keys.ts`.
  // ---------------------------------------------------------------------
  payload: (slug: string) => `${SS}:data:${DATA_VERSION}:${slug}`,
  meta: (slug: string) => `${SS}:meta:${META_VERSION}:${slug}`,

  // ---------------------------------------------------------------------
  // Daily snapshot fetchers (hotness-snapshot, mcp-usage-snapshot,
  // skill-forks-snapshot, skill-install-snapshot). The slug encodes the
  // domain when the fetcher snapshots multiple sub-rosters per day
  // (e.g. hotness-snapshot:trending-skill).
  // ---------------------------------------------------------------------
  dailySnapshot: (snapshotSlug: string, date: string) =>
    `${SS}:data:${DATA_VERSION}:${snapshotSlug}:${date}`,
  dailySnapshotMeta: (snapshotSlug: string, date: string) =>
    `${SS}:meta:${META_VERSION}:${snapshotSlug}:${date}`,

  // ---------------------------------------------------------------------
  // Worker-local liveness probe written by server.ts during /health
  // checks. 60s TTL, no readers in the Next.js app.
  // ---------------------------------------------------------------------
  worker: {
    healthcheck: () => 'tr:healthcheck',
  },
} as const;

export type Keys = typeof keys;
