import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../../lib/types.js';
import {
  buildFallbackTrendingPayload,
  type FallbackTrendingPayload,
} from '../fallback.js';

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

function emptyTrendingPayload() {
  return {
    fetchedAt: '2026-05-28T14:22:00.018Z',
    buckets: {
      past_24_hours: { All: [], Python: [], TypeScript: [], Rust: [], Go: [] },
      past_week: { All: [], Python: [], TypeScript: [], Rust: [], Go: [] },
      past_month: { All: [], Python: [], TypeScript: [], Rust: [], Go: [] },
    },
  };
}

function requirePayload(
  payload: FallbackTrendingPayload | null,
): FallbackTrendingPayload {
  expect(payload).not.toBeNull();
  return payload as FallbackTrendingPayload;
}

function bucket(
  payload: FallbackTrendingPayload,
  period: string,
  language: string,
): Array<Record<string, string>> {
  return (payload.buckets[period]?.[language] ?? []) as Array<Record<string, string>>;
}

beforeEach(() => {
  vi.resetModules();
  readDataStoreMock.mockReset();
  writeDataStoreMock.mockClear();
  globalThis.setTimeout = ((cb: () => void) => {
    cb();
    return 0 as unknown as ReturnType<typeof globalThis.setTimeout>;
  }) as typeof globalThis.setTimeout;

  readDataStoreMock.mockImplementation(async (slug: string) => {
    if (slug === 'trending') return emptyTrendingPayload();
    if (slug === 'repo-registry') {
      return {
        version: 1,
        writtenAt: '2026-05-31T09:47:00.000Z',
        count: 1,
        repos: {
          'alpha/project': {
            fullName: 'alpha/project',
            repoId: '123',
            language: 'TypeScript',
            description: 'durable registry row',
            stars: 200,
            forks: 7,
            totalScore: 77,
            firstSeenAt: '2026-05-30T00:00:00.000Z',
            lastSeenAt: '2026-05-31T09:47:00.000Z',
            lastSource: 'trending',
          },
        },
      };
    }
    if (slug === 'consensus-trending') {
      return {
        computedAt: '2026-05-31T09:50:00.000Z',
        itemCount: 1,
        items: [
          {
            fullName: 'alpha/project',
            rank: 1,
            consensusScore: 42,
            sourceCount: 3,
          },
        ],
      };
    }
    if (slug === 'recent-repos') {
      return { fetchedAt: '2026-05-31T09:25:00.000Z', items: [] };
    }
    if (slug === 'star-activity-deltas') {
      return {
        computedAt: '2026-05-31T10:00:00.000Z',
        coverage: { exact: 3, nearest: 0, 'cold-start': 0, 'no-history': 0 },
        repos: {
          'alpha/project': {
            stars_now: 250,
            latest_d: '2026-05-31',
            delta_24h: { value: 11, basis: 'exact', from_d: '2026-05-30' },
            delta_7d: { value: 31, basis: 'exact', from_d: '2026-05-24' },
            delta_30d: { value: 90, basis: 'nearest', from_d: '2026-05-01' },
          },
        },
      };
    }
    return null;
  });
});

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout;
});

describe('oss-trending fallback', () => {
  it('builds OSS-compatible 3x5 buckets, language buckets, and string activity fields', () => {
    const payload = buildFallbackTrendingPayload(
      {
        registry: {
          repos: {
            'alpha/project': {
              fullName: 'alpha/project',
              repoId: '123',
              language: 'TypeScript',
              description: 'registry description',
              stars: 200,
              forks: 7,
              totalScore: 77,
            },
          },
        },
        metadata: null,
        consensus: {
          items: [
            {
              fullName: 'alpha/project',
              rank: 1,
              consensusScore: 42,
              sourceCount: 3,
            },
          ],
        },
        recent: null,
        starActivityDeltas: {
          repos: {
            'alpha/project': {
              stars_now: 250,
              delta_24h: { value: 11, basis: 'exact' },
              delta_7d: { value: 31, basis: 'exact' },
              delta_30d: { value: 90, basis: 'nearest' },
            },
          },
        },
      },
      '2026-05-31T10:00:00.000Z',
    );

    const fallback = requirePayload(payload);

    expect(Object.keys(fallback.buckets)).toEqual([
      'past_24_hours',
      'past_week',
      'past_month',
    ]);
    expect(Object.keys(fallback.buckets.past_24_hours ?? {})).toEqual([
      'All',
      'Python',
      'TypeScript',
      'Rust',
      'Go',
    ]);
    expect(bucket(fallback, 'past_24_hours', 'All')[0]).toMatchObject({
      repo_id: '123',
      repo_name: 'alpha/project',
      primary_language: 'TypeScript',
      description: 'registry description',
      stars: '11',
      forks: '7',
      pull_requests: '',
      pushes: '',
      contributor_logins: '',
      collection_names: '',
    });
    expect(bucket(fallback, 'past_24_hours', 'TypeScript')[0]?.stars).toBe('11');
    expect(bucket(fallback, 'past_24_hours', 'Python')).toEqual([]);
    expect(bucket(fallback, 'past_week', 'All')[0]?.stars).toBe('31');
    expect(bucket(fallback, 'past_month', 'All')[0]?.stars).toBe('90');
    expect(Number(bucket(fallback, 'past_24_hours', 'All')[0]?.total_score)).toBeGreaterThan(0);
  });

  it('uses repo-metadata for missing repo ids and skips candidates that cannot join by repo_id', () => {
    const payload = buildFallbackTrendingPayload(
      {
        registry: {
          repos: {
            'missing/id': {
              fullName: 'missing/id',
              repoId: null,
              language: 'Python',
              description: 'must be skipped',
              stars: 100,
              forks: 1,
              totalScore: 9,
            },
            'metadata/id': {
              fullName: 'metadata/id',
              repoId: null,
              language: null,
              description: '',
              stars: 200,
              forks: 2,
              totalScore: 10,
            },
          },
        },
        metadata: {
          items: [
            {
              githubId: 456,
              fullName: 'metadata/id',
              language: 'Rust',
              description: 'metadata wins',
              stars: 220,
              forks: 4,
            },
          ],
        },
        consensus: null,
        recent: null,
        starActivityDeltas: {
          repos: {
            'missing/id': {
              stars_now: 101,
              delta_24h: { value: 5, basis: 'exact' },
              delta_7d: { value: 9, basis: 'exact' },
              delta_30d: { value: 20, basis: 'exact' },
            },
            'metadata/id': {
              stars_now: 220,
              delta_24h: { value: 6, basis: 'exact' },
              delta_7d: { value: 12, basis: 'exact' },
              delta_30d: { value: 25, basis: 'exact' },
            },
          },
        },
      },
      '2026-05-31T10:00:00.000Z',
    );

    const fallback = requirePayload(payload);

    expect(bucket(fallback, 'past_24_hours', 'All').map((row) => row.repo_name)).toEqual([
      'metadata/id',
    ]);
    expect(bucket(fallback, 'past_24_hours', 'Rust')[0]).toMatchObject({
      repo_id: '456',
      repo_name: 'metadata/id',
      primary_language: 'Rust',
      description: 'metadata wins',
    });
  });

  it('returns null when no internal candidate has a joinable repo_id', () => {
    const payload = buildFallbackTrendingPayload(
      {
        registry: {
          repos: {
            'missing/id': {
              fullName: 'missing/id',
              repoId: null,
              language: 'Go',
              description: '',
              stars: 1,
              forks: 0,
              totalScore: 1,
            },
          },
        },
        metadata: null,
        consensus: null,
        recent: null,
        starActivityDeltas: {
          repos: {
            'missing/id': {
              stars_now: 10,
              delta_24h: { value: 1, basis: 'exact' },
              delta_7d: { value: 2, basis: 'exact' },
              delta_30d: { value: 3, basis: 'exact' },
            },
          },
        },
      },
      '2026-05-31T10:00:00.000Z',
    );

    expect(payload).toBeNull();
  });

  it('publishes a non-empty trending payload from internal sources when OSSInsight is fully down', async () => {
    const { default: fetcher } = await import('../index.js');

    await fetcher.run(makeContext());

    const writes = writeDataStoreMock.mock.calls as unknown as Array<
      [string, unknown, unknown?]
    >;
    const trendingWrite = writes.find(
      ([slug]) => slug === 'trending',
    );
    expect(trendingWrite).toBeDefined();

    const payload = trendingWrite?.[1] as FallbackTrendingPayload;
    expect(bucket(payload, 'past_24_hours', 'All')[0]).toMatchObject({
      repo_id: '123',
      repo_name: 'alpha/project',
      primary_language: 'TypeScript',
      description: 'durable registry row',
      stars: '11',
      forks: '7',
    });
    expect(bucket(payload, 'past_week', 'All')[0]?.stars).toBe('31');
    expect(bucket(payload, 'past_month', 'TypeScript')[0]?.stars).toBe('90');
  });
});
