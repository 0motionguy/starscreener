// Verifies the F5 since-window contract:
//   1. Default = now - 24h
//   2. fetcher.defaultLookbackHours overrides the default
//   3. opts.since (CLI --since) wins over both
//
// Runs against a mock Fetcher that captures ctx.since. We force dry-run +
// DATA_STORE_DISABLE so runFetcher takes the no-db / no-redis path and we
// don't need infra to be live.
//
// Run: cd apps/trendingrepo-worker && npx tsx --test src/__tests__/run-since.test.ts

// vitest exposes a compatible `test` runner; we keep node:assert for
// strict equality semantics matching the rest of the worker test suite.
import { test } from 'vitest';
import assert from 'node:assert/strict';

// Disable data-store and silence pino before importing the worker code so
// loadEnv() and getLogger() pick the right config on first cache.
process.env.DATA_STORE_DISABLE = '1';
process.env.LOG_LEVEL = 'fatal';
process.env.NODE_ENV = 'test';

const { runFetcher } = await import('../run.js');

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

function makeMock(overrides: Partial<Fetcher> = {}): {
  fetcher: Fetcher;
  captured: { since: Date | null };
} {
  const captured: { since: Date | null } = { since: null };
  const fetcher: Fetcher = {
    name: 'mock',
    schedule: '0 * * * *',
    async run(ctx: FetcherContext) {
      captured.since = ctx.since;
      return emptyResult('mock');
    },
    ...overrides,
  };
  return { fetcher, captured };
}

const TOLERANCE_MS = 1000;

test('default since = now - 24h when no override', async () => {
  const { fetcher, captured } = makeMock();
  const before = Date.now();
  await runFetcher(fetcher, { dryRun: true });
  const after = Date.now();
  assert.ok(captured.since instanceof Date, 'ctx.since was not set');
  const delta = (captured.since as Date).getTime();
  const expectedMin = before - 24 * 3600_000 - TOLERANCE_MS;
  const expectedMax = after - 24 * 3600_000 + TOLERANCE_MS;
  assert.ok(
    delta >= expectedMin && delta <= expectedMax,
    `expected ~now-24h, got ${new Date(delta).toISOString()}`,
  );
});

test('fetcher.defaultLookbackHours overrides the 24h default', async () => {
  const { fetcher, captured } = makeMock({ defaultLookbackHours: 168 });
  const before = Date.now();
  await runFetcher(fetcher, { dryRun: true });
  const after = Date.now();
  assert.ok(captured.since instanceof Date);
  const delta = (captured.since as Date).getTime();
  const expectedMin = before - 168 * 3600_000 - TOLERANCE_MS;
  const expectedMax = after - 168 * 3600_000 + TOLERANCE_MS;
  assert.ok(
    delta >= expectedMin && delta <= expectedMax,
    `expected ~now-168h, got ${new Date(delta).toISOString()}`,
  );
});

test('opts.since wins over fetcher.defaultLookbackHours', async () => {
  const explicit = new Date('2026-02-01T00:00:00Z');
  const { fetcher, captured } = makeMock({ defaultLookbackHours: 168 });
  await runFetcher(fetcher, { dryRun: true, since: explicit });
  assert.ok(captured.since instanceof Date);
  assert.equal(
    (captured.since as Date).toISOString(),
    explicit.toISOString(),
    'opts.since must be passed through verbatim',
  );
});
