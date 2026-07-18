import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../../lib/types.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  vi.doUnmock('../../../lib/redis.js');
  vi.doUnmock('../../../lib/util/http-helpers.js');
  vi.doUnmock('../../collection-rankings/fallback.js');
  vi.resetModules();
});

describe('repo-metadata GitHub token rotation', () => {
  it('does not refresh stale metadata when every GitHub batch fails authentication', async () => {
    process.env.DATA_STORE_DISABLE = '1';
    process.env.REPO_METADATA_BATCH_SIZE = '1';
    process.env.GH_TOKEN_POOL = 'expired-token';
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN_POOL;

    const previous = {
      fetchedAt: '2026-07-17T00:00:00.000Z',
      items: [
        { fullName: 'owner/one', stars: 7 },
        { fullName: 'owner/two', stars: 8 },
      ],
    };
    const writeDataStore = vi.fn(async () => ({
      source: 'redis' as const,
      writtenAt: '2026-07-18T00:00:00.000Z',
    }));
    vi.doMock('../../../lib/redis.js', () => ({
      getRedis: async () => null,
      readDataStore: async (slug: string) => {
        if (slug === 'recent-repos') {
          return { items: [{ fullName: 'owner/one' }, { fullName: 'owner/two' }] };
        }
        if (slug === 'repo-metadata') return previous;
        return null;
      },
      writeDataStore,
    }));
    vi.doMock('../../collection-rankings/fallback.js', () => ({
      METRICS: [],
      SEED_COLLECTION_RANKINGS: { collections: {} },
    }));
    vi.doMock('../../../lib/util/http-helpers.js', () => ({
      fetchJsonWithRetry: vi.fn(async (_url: string, opts: Record<string, unknown>) => {
        (opts.onResponse as (response: Response) => void)(
          new Response('unauthorized', { status: 401 }),
        );
        throw new Error('HTTP 401 Unauthorized');
      }),
    }));

    const pool = await import('../../../lib/util/github-token-pool.js');
    pool._resetGithubTokenPoolForTests();
    const { default: fetcher } = await import('../index.js');
    const result = await fetcher.run({
      db: null,
      redis: null,
      http: null,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      dryRun: false,
      since: new Date('2026-07-18T00:00:00.000Z'),
      signalRunComplete: vi.fn(),
    } as unknown as FetcherContext);

    expect(result.redisPublished).toBe(false);
    expect(result.itemsSeen).toBe(previous.items.length);
    expect(writeDataStore).not.toHaveBeenCalled();
  });

  it('moves the next GraphQL batch off a token quarantined by a 401', async () => {
    process.env.DATA_STORE_DISABLE = '1';
    process.env.REPO_METADATA_BATCH_SIZE = '1';
    process.env.GH_TOKEN_POOL = 'pool-token-alpha,pool-token-bravo';
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN_POOL;

    const writeDataStore = vi.fn(async (slug: string, payload: unknown) => {
      void slug;
      void payload;
      return {
        source: 'redis' as const,
        writtenAt: new Date().toISOString(),
      };
    });
    vi.doMock('../../../lib/redis.js', () => ({
      getRedis: async () => null,
      readDataStore: async (slug: string) => {
        if (slug === 'recent-repos') {
          return { items: [{ fullName: 'owner/one' }, { fullName: 'owner/two' }] };
        }
        if (slug === 'repo-metadata') {
          return { items: [{ fullName: 'owner/one', stars: 7 }] };
        }
        return null;
      },
      writeDataStore,
    }));
    vi.doMock('../../collection-rankings/fallback.js', () => ({
      METRICS: [],
      SEED_COLLECTION_RANKINGS: { collections: {} },
    }));

    const authorizations: string[] = [];
    let call = 0;
    vi.doMock('../../../lib/util/http-helpers.js', () => ({
      fetchJsonWithRetry: vi.fn(async (_url: string, opts: Record<string, unknown>) => {
        const headers = opts.headers as Record<string, string>;
        authorizations.push(headers.Authorization ?? '');
        if (call++ === 0) {
          (opts.onResponse as (response: Response) => void)(
            new Response('unauthorized', { status: 401 }),
          );
          throw new Error('HTTP 401 Unauthorized');
        }
        return {
          data: {
            r0: {
              databaseId: 2,
              name: 'two',
              nameWithOwner: 'owner/two',
              owner: { login: 'owner', avatarUrl: '' },
              url: 'https://github.com/owner/two',
              stargazerCount: 9,
              forkCount: 1,
              issues: { totalCount: 0 },
            },
          },
        };
      }),
    }));

    const pool = await import('../../../lib/util/github-token-pool.js');
    pool._resetGithubTokenPoolForTests();
    const { default: fetcher } = await import('../index.js');
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    await fetcher.run({
      db: null,
      redis: null,
      http: null,
      log,
      dryRun: false,
      since: new Date('2026-07-18T00:00:00.000Z'),
      signalRunComplete: vi.fn(),
    } as unknown as FetcherContext);

    expect(authorizations).toEqual([
      'Bearer pool-token-alpha',
      'Bearer pool-token-bravo',
    ]);
    expect(writeDataStore).toHaveBeenCalledOnce();
    const payload = writeDataStore.mock.calls[0]![1] as {
      items: Array<{ fullName: string }>;
      failures: Array<{ fullName: string; reason: string }>;
    };
    expect(payload.items.map((item) => item.fullName)).toEqual(['owner/one', 'owner/two']);
    expect(payload.failures).toContainEqual(
      expect.objectContaining({
        fullName: 'owner/one',
        reason: 'batch-failed-kept-previous',
      }),
    );
  });
});
