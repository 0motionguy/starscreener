/**
 * Source contract lookup helpers.
 *
 * Move 1, Phase 3 of the Source Platform migration. Phase 1 landed the
 * `SourceContract` type (source-contract.ts) and the `SOURCE_CONTRACTS[]`
 * registry (sources.json + registry.ts). Phase 3 binds those contracts into
 * the fetcher RUNTIME so each fetcher knows its own contract at run time
 * (for diagnostics now, freshness/cost enforcement in Move 3).
 *
 * This module is the thin lookup layer between the static registry and the
 * `runFetcher()` call site. Build-time constant cost (Map indexed by id) so
 * cron-tick lookups never become a hotspot.
 *
 * See:
 *   - apps/trendingrepo-worker/src/platform/source-contract.ts (the type)
 *   - apps/trendingrepo-worker/src/platform/sources.json (the data)
 *   - apps/trendingrepo-worker/src/registry.ts (SOURCE_CONTRACTS export)
 *   - apps/trendingrepo-worker/src/run.ts (consumer)
 *   - ~/.claude/plans/hidden-pondering-meadow.md (approved plan)
 */

import { SOURCE_CONTRACTS } from '../registry.js';
import type { SourceContract } from './source-contract.js';

// Built once at import time. SOURCE_CONTRACTS is readonly — the Map is not
// rebuilt on subsequent calls. If a future hot-reload story for
// `sources.json` lands, this Map will need to be rebuilt at refresh time.
let contractsById: Map<string, SourceContract> | null = null;

function getIndex(): Map<string, SourceContract> {
  if (contractsById) return contractsById;
  contractsById = new Map(SOURCE_CONTRACTS.map((c) => [c.id, c]));
  return contractsById;
}

/**
 * Look up the static `SourceContract` for a given source id (typically the
 * `Fetcher.name`). Returns `undefined` for ids without a matching row — the
 * caller decides whether absence is an error. `runFetcher()` treats it as a
 * Sentry warning, not a crash.
 *
 * Phase 3 callers should NOT mutate the returned contract; future phases
 * may switch this to return `Readonly<SourceContract>` once consumer call
 * sites are typed accordingly.
 */
export function getContract(sourceId: string): SourceContract | undefined {
  return getIndex().get(sourceId);
}
