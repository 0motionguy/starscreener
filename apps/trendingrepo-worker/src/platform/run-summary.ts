/**
 * Per-fetcher run-summary log emitter.
 *
 * Move 1, Phase 3 of the Source Platform migration. At the end of every
 * `runFetcher()` call (success or error), we emit ONE structured line that
 * a future log scraper / freshness dashboard can ingest without parsing
 * pino's full JSON envelope. The line is intentionally human-greppable:
 *
 *   [run-summary] source=<id> status=<ok|err> duration_ms=<N>
 *                 records_in=<N> records_out=<N>
 *                 contract_freshness_budget_ms=<N|missing>
 *
 * Why a separate helper? Three reasons:
 *   1. Phase 3 is purely additive — wrapping the existing pino calls would
 *      be K3 surgery against the current observability story.
 *   2. Move 3 will swap `console.log` for a Redis stream / Sentry breadcrumb
 *      without re-touching every call site if the formatting lives here.
 *   3. The constraint "don't add new dependencies" rules out any structured
 *      logging library; plain `console.log` is the contract.
 *
 * See:
 *   - apps/trendingrepo-worker/src/run.ts (consumer)
 *   - apps/trendingrepo-worker/src/platform/source-contract.ts
 *   - ~/.claude/plans/hidden-pondering-meadow.md (approved plan)
 */

import type { SourceContract } from './source-contract.js';

export type RunSummaryStatus = 'ok' | 'err';

export interface RunSummary {
  sourceId: string;
  status: RunSummaryStatus;
  durationMs: number;
  recordsIn: number;
  recordsOut: number;
  contract?: SourceContract;
}

/**
 * Emit one `[run-summary] ...` line for the given fetcher run. Uses
 * `console.log` so the line shows up in Railway / docker logs irrespective
 * of pino's level filter. Never throws — a failing logger must not fail
 * the cron tick.
 */
export function emitRunSummary(summary: RunSummary): void {
  try {
    const budget =
      summary.contract && Number.isFinite(summary.contract.freshness_budget_ms)
        ? String(summary.contract.freshness_budget_ms)
        : 'missing';
    // Single-line, key=value, space-separated. Stable order so a regex / awk
    // pipeline can be authored against this format without surprise.
    const line =
      `[run-summary] source=${summary.sourceId}` +
      ` status=${summary.status}` +
      ` duration_ms=${summary.durationMs}` +
      ` records_in=${summary.recordsIn}` +
      ` records_out=${summary.recordsOut}` +
      ` contract_freshness_budget_ms=${budget}`;
    // eslint-disable-next-line no-console
    console.log(line);
  } catch {
    // Swallow: emitting a summary line is observability, not correctness.
  }
}
