import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../../lib/types.js';

const readDataStoreMock = vi.hoisted(() => vi.fn());
const writeDataStoreMock = vi.hoisted(() =>
  vi.fn(async () => ({
    source: 'redis' as const,
    writtenAt: '2026-05-31T10:00:00.000Z',
  })),
);

vi.mock('../../../lib/redis.js', () => ({
  readDataStore: readDataStoreMock,
  writeDataStore: writeDataStoreMock,
}));

const originalSetTimeout = globalThis.setTimeout;

function makeContext(): FetcherContext {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as FetcherContext['log'];
  return {
    db: null as unknown as FetcherContext['db'],
    redis: null as unknown as FetcherContext['redis'],
    http: {
      async json() {
        throw new Error('OSSInsight 500');
      },
      async text() {
        throw new Error('OSSInsight 500');
      },
    },
    log,
    dryRun: false,
    since: new Date('2026-05-31T10:00:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetModules();
  readDataStoreMock.mockReset();
  writeDataStoreMock.mockClear();
  globalThis.setTimeout = ((cb: () => void) => {
    cb();
    return 0 as unknown as ReturnType<typeof globalThis.setTimeout>;
  }) as typeof globalThis.setTimeout;
});

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout;
});

describe('collection-rankings degraded writes', () => {
  it('freshens the slug with cached per-metric rows when OSSInsight fails', async () => {
    readDataStoreMock.mockResolvedValueOnce({
      fetchedAt: '2026-05-30T10:00:00.000Z',
      period: 'past_28_days',
      collections: {
        '10139': {
          stars: [
            {
              repoId: 123,
              repoName: 'alpha/project',
              currentPeriodGrowth: 10,
              pastPeriodGrowth: 5,
              growthPop: 2,
              rankPop: 1,
              total: 100,
              currentPeriodRank: 1,
              pastPeriodRank: 2,
            },
          ],
          issues: [],
        },
      },
    });
    const { default: fetcher } = await import('../index.js');

    await fetcher.run(makeContext());

    const writes = writeDataStoreMock.mock.calls as unknown as Array<
      [string, unknown, unknown?]
    >;
    const write = writes.find(
      ([slug]) => slug === 'collection-rankings',
    );
    expect(write).toBeDefined();
    const payload = write?.[1] as {
      status?: string;
      dataAsOf?: string | null;
      collections?: Record<string, { stars?: unknown[]; issues?: unknown[] }>;
      errors?: unknown[];
    };

    expect(payload.status).toBe('degraded');
    expect(payload.dataAsOf).toBe('2026-05-30T10:00:00.000Z');
    expect(payload.collections?.['10139']?.stars).toHaveLength(1);
    expect(payload.errors?.length).toBeGreaterThan(0);
    expect(write?.[2]).toEqual({ writer: 'worker:collection-rankings:degraded' });
  });
});
