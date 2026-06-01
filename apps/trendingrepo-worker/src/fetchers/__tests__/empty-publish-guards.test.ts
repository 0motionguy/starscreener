import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../lib/types.js';

const readDataStoreMock = vi.hoisted(() => vi.fn());
const writeDataStoreMock = vi.hoisted(() =>
  vi.fn(async () => ({
    source: 'redis' as const,
    writtenAt: '2026-06-01T00:00:00.000Z',
  })),
);
const loadTrackedReposMock = vi.hoisted(() =>
  vi.fn(async () => new Map<string, string>()),
);
const fetchWithTimeoutMock = vi.hoisted(() => vi.fn());
const fetchJsonWithRetryMock = vi.hoisted(() => vi.fn());
const sleepMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../lib/redis.js', () => ({
  readDataStore: readDataStoreMock,
  writeDataStore: writeDataStoreMock,
}));

vi.mock('../../lib/util/tracked-repos.js', () => ({
  loadTrackedRepos: loadTrackedReposMock,
}));

vi.mock('../../lib/util/http-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/util/http-helpers.js')>();
  return {
    ...actual,
    fetchWithTimeout: fetchWithTimeoutMock,
    fetchJsonWithRetry: fetchJsonWithRetryMock,
    sleep: sleepMock,
  };
});

function makeContext(overrides: Partial<FetcherContext> = {}): FetcherContext {
  return {
    db: null as unknown as FetcherContext['db'],
    redis: null as unknown as FetcherContext['redis'],
    http: {
      async json() {
        throw new Error('not used');
      },
      async text() {
        throw new Error('not used');
      },
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    } as unknown as FetcherContext['log'],
    dryRun: false,
    since: new Date('2026-06-01T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  readDataStoreMock.mockReset();
  writeDataStoreMock.mockClear();
  loadTrackedReposMock.mockReset();
  loadTrackedReposMock.mockResolvedValue(new Map<string, string>());
  fetchWithTimeoutMock.mockReset();
  fetchJsonWithRetryMock.mockReset();
  sleepMock.mockClear();
});

describe('worker fetcher empty publish guards', () => {
  it('engagement-composite preserves the prior slug when upstream payloads are missing', async () => {
    readDataStoreMock.mockResolvedValue(null);
    const { default: fetcher } = await import('../engagement-composite/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'upstream-missing')).toBe(true);
  });

  it('crunchbase preserves the prior slug when all RSS feeds fail', async () => {
    fetchWithTimeoutMock.mockRejectedValue(new Error('rss unavailable'));
    const { default: fetcher } = await import('../crunchbase/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'empty-signals')).toBe(true);
  });

  it('npm-packages preserves the prior slug when discovery returns no usable rows', async () => {
    fetchJsonWithRetryMock.mockRejectedValue(new Error('npm unavailable'));
    const { default: fetcher } = await import('../npm-packages/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'empty-packages')).toBe(true);
  });

  it('trendshift-daily preserves the prior slug when fetch fails', async () => {
    const { default: fetcher } = await import('../trendshift-daily/index.js');

    const result = await fetcher.run(
      makeContext({
        http: {
          async json() {
            throw new Error('not used');
          },
          async text() {
            throw new Error('trendshift unavailable');
          },
        },
      }),
    );

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'fetch')).toBe(true);
  });
});
