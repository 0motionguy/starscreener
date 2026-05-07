// Verifies Move 1, Phase 3 contract-binding wiring in run.ts:
//   1. A fetcher whose name matches a SOURCE_CONTRACTS row receives that
//      contract on FetcherContext.contract.
//   2. A fetcher whose name has no SOURCE_CONTRACTS row receives
//      `undefined` and runFetcher does NOT throw — the missing-contract
//      path logs a Sentry warning + log.warn and continues.
//   3. The run-summary line is emitted on the success path (asserted via
//      a console.log spy).
//
// Runs against mock Fetchers in dry-run with DATA_STORE_DISABLE so no
// infra is required. Mirrors run-since.test.ts setup.

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

// Disable data-store and silence pino before importing the worker code.
process.env.DATA_STORE_DISABLE = '1';
process.env.LOG_LEVEL = 'fatal';
process.env.NODE_ENV = 'test';

const { runFetcher } = await import('../run.js');
const { SOURCE_CONTRACTS } = await import('../registry.js');

import type { Fetcher, FetcherContext, RunResult } from '../lib/types.js';

function emptyResult(name: string): RunResult {
  const now = new Date().toISOString();
  return {
    fetcher: name,
    startedAt: now,
    finishedAt: now,
    itemsSeen: 0,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished: false,
    errors: [],
  };
}

function makeMock(name: string): {
  fetcher: Fetcher;
  captured: { contract: FetcherContext['contract'] | undefined };
} {
  const captured: { contract: FetcherContext['contract'] | undefined } = {
    contract: undefined,
  };
  const fetcher: Fetcher = {
    name,
    schedule: '0 * * * *',
    async run(ctx: FetcherContext) {
      captured.contract = ctx.contract;
      return emptyResult(name);
    },
  };
  return { fetcher, captured };
}

describe('runFetcher → SourceContract binding (Move 1, Phase 3)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('passes the matching SourceContract through ctx.contract', async () => {
    // Pick the first registered contract id; that guarantees a real row
    // exists without hard-coding a slug that could be renamed.
    const known = SOURCE_CONTRACTS[0];
    expect(known, 'sources.json must have at least one row').toBeDefined();
    const { fetcher, captured } = makeMock(known!.id);

    await runFetcher(fetcher, { dryRun: true });

    expect(captured.contract).toBeDefined();
    expect(captured.contract?.id).toBe(known!.id);
    expect(typeof captured.contract?.freshness_budget_ms).toBe('number');
  });

  it('does not crash when no SOURCE_CONTRACTS row matches the fetcher name', async () => {
    const { fetcher, captured } = makeMock(
      '__phase3-test-unknown-source-id__',
    );

    // Must not throw. Must hand `undefined` to the fetcher.
    await expect(runFetcher(fetcher, { dryRun: true })).resolves.toBeDefined();
    expect(captured.contract).toBeUndefined();
  });

  it('emits a [run-summary] line on the success path', async () => {
    const known = SOURCE_CONTRACTS[0];
    expect(known).toBeDefined();
    const { fetcher } = makeMock(known!.id);

    await runFetcher(fetcher, { dryRun: true });

    const lines = logSpy.mock.calls.map((c) => String(c[0] ?? ''));
    const summary = lines.find((l) => l.startsWith('[run-summary]'));
    expect(summary, 'run-summary line was not emitted').toBeDefined();
    expect(summary).toContain(`source=${known!.id}`);
    expect(summary).toContain('status=ok');
    expect(summary).toMatch(/duration_ms=\d+/);
    expect(summary).toMatch(/records_in=\d+/);
    expect(summary).toMatch(/records_out=\d+/);
    expect(summary).toContain(
      `contract_freshness_budget_ms=${known!.freshness_budget_ms}`,
    );
  });

  it('emits contract_freshness_budget_ms=missing when no contract is found', async () => {
    const { fetcher } = makeMock('__phase3-test-unknown-source-id__');

    await runFetcher(fetcher, { dryRun: true });

    const lines = logSpy.mock.calls.map((c) => String(c[0] ?? ''));
    const summary = lines.find((l) => l.startsWith('[run-summary]'));
    expect(summary).toBeDefined();
    expect(summary).toContain('contract_freshness_budget_ms=missing');
  });
});
