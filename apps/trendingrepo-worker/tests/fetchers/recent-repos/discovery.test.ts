import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../../src/lib/types.js';

const store = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn().mockResolvedValue(null),
  readDataStore: store.read,
  writeDataStore: store.write,
}));

function repo(fullName: string, stars: number, createdAt: string, discoveredBy?: string[]) {
  const [owner = '', name = ''] = fullName.split('/');
  return {
    githubId: stars,
    fullName,
    name,
    owner,
    ownerAvatarUrl: '',
    description: '',
    url: `https://github.com/${fullName}`,
    language: null,
    topics: [],
    stars,
    forks: 0,
    openIssues: 0,
    createdAt,
    updatedAt: createdAt,
    pushedAt: createdAt,
    discoveredBy,
  };
}

function context(json: FetcherContext['http']['json']): FetcherContext {
  return {
    db: null as unknown as FetcherContext['db'],
    redis: null as unknown as FetcherContext['redis'],
    http: {
      json,
      async text() {
        return { data: '', cached: false };
      },
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as FetcherContext['log'],
    dryRun: false,
    since: new Date('2026-07-18T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.read.mockResolvedValue(null);
  store.write.mockResolvedValue({ source: 'redis', writtenAt: '2026-07-18T00:00:00.000Z' });
});

describe('recent-repos discovery plan', () => {
  it('uses five general pages plus one page for each focused category', async () => {
    const { DISCOVERY_QUERIES } = await import('../../../src/fetchers/recent-repos/index.js');

    expect(DISCOVERY_QUERIES.reduce((sum, query) => sum + query.pages, 0)).toBe(20);
    expect(DISCOVERY_QUERIES.filter((query) => query.categoryId)).toHaveLength(15);
    expect(
      DISCOVERY_QUERIES.filter((query) => query.categoryId).every(
        (query) => query.days === 30 && query.minStars === 5 && query.pages === 1,
      ),
    ).toBe(true);
  });

  it('reserves five rows per populated category before filling by stars per age', async () => {
    const { CATEGORY_QUERIES, selectRecentRepos } = await import(
      '../../../src/fetchers/recent-repos/index.js'
    );
    const createdAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const candidates = CATEGORY_QUERIES.flatMap((query) =>
      Array.from({ length: 6 }, (_, index) =>
        repo(`${query.categoryId}/repo-${index}`, index + 1, createdAt, [query.id]),
      ),
    );
    candidates.push(
      ...Array.from({ length: 260 }, (_, index) =>
        repo(`general/repo-${index}`, 10_000 - index, createdAt, ['general:1d']),
      ),
      repo('GENERAL/REPO-0', 20_000, createdAt, ['category:devtools']),
      {
        ...repo('piracy/photoshop-crack-download', 50_000, createdAt, ['category:devtools']),
        description: 'Free cracked premium software keygen',
      },
    );

    const selected = selectRecentRepos(candidates, 300);

    expect(selected).toHaveLength(300);
    expect(new Set(selected.map((row) => row.fullName.toLowerCase())).size).toBe(300);
    for (const query of CATEGORY_QUERIES) {
      expect(
        selected.filter((row) => row.discoveredBy?.includes(query.id)),
        query.categoryId,
      ).toHaveLength(5);
    }
    expect(selected.some((row) => row.fullName.includes('photoshop-crack'))).toBe(false);
  });

  it('keeps legitimate security repos and excludes observed cheat and piracy repos', async () => {
    const { selectRecentRepos } = await import(
      '../../../src/fetchers/recent-repos/index.js'
    );
    const createdAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const selected = selectRecentRepos(
      [
        repo('research/surface-crack-detection', 50, createdAt),
        repo('Porchetta-Industries/CrackMapExec', 100, createdAt),
        repo('piracy/photoshop-crack-download', 500, createdAt),
        repo('spam/External-Dayz-Cheat', 50_000, createdAt),
        repo('spam/elden-ring-unlocked-tools', 40_000, createdAt),
        repo('spam/red-giant-download', 30_000, createdAt),
      ],
      10,
    );

    expect(selected.map((row) => row.fullName)).toEqual([
      'Porchetta-Industries/CrackMapExec',
      'research/surface-crack-detection',
    ]);
  });

  it('does not rewrite last-good data when every query fails', async () => {
    const existing = repo('kept/repo', 10, '2026-07-01T00:00:00.000Z');
    store.read.mockResolvedValue({ fetchedAt: '2026-07-01T00:00:00.000Z', items: [existing] });
    const { default: fetcher } = await import('../../../src/fetchers/recent-repos/index.js');

    const result = await fetcher.run(
      context(async () => {
        throw new Error('GitHub unavailable');
      }),
    );

    expect(result.itemsSeen).toBe(1);
    expect(result.redisPublished).toBe(false);
    expect(store.write).not.toHaveBeenCalled();
  });

  it('does not fall back to anonymous search when the configured pool is exhausted', async () => {
    const previousTokens = {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      GH_TOKEN_POOL: process.env.GH_TOKEN_POOL,
      GITHUB_TOKEN_POOL: process.env.GITHUB_TOKEN_POOL,
    };
    const existing = repo('kept/repo', 10, '2026-07-01T00:00:00.000Z');
    store.read.mockResolvedValue({ fetchedAt: '2026-07-01T00:00:00.000Z', items: [existing] });
    const json = vi.fn(async <T>() => ({ data: { items: [] } as T, cached: false }));
    const pool = await import('../../../src/lib/util/github-token-pool.js');

    try {
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN_POOL = 'exhausted-token';
      delete process.env.GITHUB_TOKEN_POOL;
      pool._resetGithubTokenPoolForTests();
      pool.recordRateLimit('exhausted-token', 0, Math.floor(Date.now() / 1000) + 3600);
      const { default: fetcher } = await import('../../../src/fetchers/recent-repos/index.js');

      const result = await fetcher.run(context(json));

      expect(result.itemsSeen).toBe(1);
      expect(result.redisPublished).toBe(false);
      expect(json).not.toHaveBeenCalled();
      expect(store.write).not.toHaveBeenCalled();
    } finally {
      for (const [name, value] of Object.entries(previousTokens)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      pool._resetGithubTokenPoolForTests();
    }
  });

  it('merges prior rows when only part of the query plan succeeds', async () => {
    const existing = repo('kept/repo', 10, '2026-07-01T00:00:00.000Z');
    store.read.mockResolvedValue({ fetchedAt: '2026-07-01T00:00:00.000Z', items: [existing] });
    const { default: fetcher } = await import('../../../src/fetchers/recent-repos/index.js');

    const result = await fetcher.run(
      context(async <T>(rawUrl: string) => {
        const query = new URL(rawUrl).searchParams.get('q') ?? '';
        if (!query.includes('topic:ai-agent')) throw new Error('query failed');
        return {
          data: {
            total_count: 1,
            incomplete_results: true,
            items: [
              {
                id: 2,
                full_name: 'fresh/repo',
                name: 'repo',
                owner: { login: 'fresh' },
                html_url: 'https://github.com/fresh/repo',
                stargazers_count: 20,
                created_at: '2026-07-17T00:00:00.000Z',
              },
            ],
          } as T,
          cached: false,
        };
      }),
    );

    expect(result.itemsSeen).toBe(2);
    expect(store.write).toHaveBeenCalledOnce();
    const payload = store.write.mock.calls[0]?.[1];
    expect(payload).toMatchObject({
      diagnostics: {
        attemptedQueries: 18,
        succeededQueries: 1,
        incompleteQueries: 1,
      },
    });
    expect(payload.items.map((row: { fullName: string }) => row.fullName)).toEqual([
      'fresh/repo',
      'kept/repo',
    ]);
  });
});
