// src/lib/twitter — public barrel.
//
// Re-exports the TwitterSignalBuilder facade (runtime) + the public types.
// Consumers OUTSIDE src/lib/twitter/ should import from this entry point;
// the per-file modules (service.ts, signal-data.ts, scoring.ts,
// query-bundle.ts, storage.ts, ingest-contract.ts, outbound/audit.ts) are
// @internal and may be reorganised without notice.

export * from "./builder";
export type * from "./types";
