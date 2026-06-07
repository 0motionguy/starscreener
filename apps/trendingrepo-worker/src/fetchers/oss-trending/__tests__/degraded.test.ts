import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../../lib/types.js';

const readDataStoreMock = vi.hoisted(() => vi.fn());
const writeDataStoreMock = vi.hoisted(() =>
  vi.fn(async () => ({
    source: 'redis' as const,
    writtenAt: '2026-06-01T00:00:00.000Z',
  })),
);

vi.mock('../../../lib/redis.js', () => ({
  readDataStore: readDataStoreMock,
  writeDataStore: writeDataStoreMock,
}));

const originalSetTimeout = globalThis.setTimeout;
const originalOssInsightEnabled = process.env.OSSINSIGHT_ENABLED;

const PERIODS = ['past_24_hours', 'past_week', 'past_month'] as const;
const LANGUAGES = [
  'All',
  'Python',
  'TypeScript',
  'Rust',
  'Go',
  'JavaScript',
  'Java',
  'C++',
  'C#',
  'Kotlin',
] as const;

function makeContext(
  handler: FetcherContext['http']['json'],
): FetcherContext {
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
      json: handler,
      async text() {
        throw new Error('not used');
      },
    },
    log,
    dryRun: false,
    since: new Date('2026-06-01T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

function makePriorTrending() {
  const buckets: Record<string, Record<string, unknown[]>> = {};
  for (const period of PERIODS) {
    buckets[period] = {};
    for (const language of LANGUAGES) {
      buckets[period][language] = [
        {
          repo_id: `${period}:${language}`,
          repo_name: `cached/${language.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          primary_language: language,
          description: 'cached row',
          stars: '100',
          forks: '10',
          pull_requests: '1',
          pushes: '2',
          total_score: '3',
          contributor_logins: '',
          collection_names: '',
        },
      ];
    }
  }
  return {
    fetchedAt: '2026-05-31T20:00:00.000Z',
    buckets,
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
  if (originalOssInsightEnabled === undefined) {
    delete process.env.OSSINSIGHT_ENABLED;
  } else {
    process.env.OSSINSIGHT_ENABLED = originalOssInsightEnabled;
  }
});

describe('oss-trending degraded writes', () => {
  it('does not publish fresh empty trending or hot-collections payloads on total OSSInsight failure', async () => {
    readDataStoreMock.mockResolvedValue(null);
    const { default: fetcher } = await import('../index.js');

    const result = await fetcher.run(
      makeContext(async () => {
        throw new Error('OSSInsight 500');
      }),
    );

    expect(result.redisPublished).toBe(false);
    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(
      result.errors.some((entry) =>
        entry.message.includes('skipped empty trending publish'),
      ),
    ).toBe(true);
    expect(
      result.errors.some((entry) =>
        entry.message.includes('skipped empty hot-collections publish'),
      ),
    ).toBe(true);
  });

  it('freshens degraded payloads only when every failed leaf has cached rows', async () => {
    process.env.OSSINSIGHT_ENABLED = '1';
    readDataStoreMock
      .mockResolvedValueOnce(makePriorTrending())
      .mockResolvedValueOnce({
        fetchedAt: '2026-05-31T20:05:00.000Z',
        rows: [
          {
            id: 10098,
            name: 'AI Agent Frameworks',
            repos: 17,
            repoId: 1,
            repoName: 'cached/project',
            repoCurrentPeriodRank: 1,
            repoPastPeriodRank: 2,
            repoRankChanges: 1,
          },
        ],
      });
    const { default: fetcher } = await import('../index.js');

    const result = await fetcher.run(
      makeContext(async () => {
        throw new Error('OSSInsight 500');
      }),
    );

    expect(result.redisPublished).toBe(true);
    const writes = writeDataStoreMock.mock.calls as unknown as Array<
      [string, unknown, unknown?]
    >;
    const trendingWrite = writes.find(([slug]) => slug === 'trending');
    const hotWrite = writes.find(([slug]) => slug === 'hot-collections');

    expect(trendingWrite?.[2]).toEqual({ writer: 'worker:oss-trending:degraded' });
    expect(hotWrite?.[2]).toEqual({ writer: 'worker:oss-trending:degraded' });
    expect((trendingWrite?.[1] as { status?: string }).status).toBe('degraded');
    expect((hotWrite?.[1] as { status?: string }).status).toBe('degraded');
    expect(
      (trendingWrite?.[1] as { buckets?: Record<string, Record<string, unknown[]>> })
        .buckets?.past_24_hours?.All,
    ).toHaveLength(1);
    expect((hotWrite?.[1] as { rows?: unknown[] }).rows).toHaveLength(1);
  });
});
