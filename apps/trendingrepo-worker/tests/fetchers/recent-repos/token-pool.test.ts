import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext, HttpOptions } from '../../../src/lib/types.js';

const ORIGINAL_ENV = { ...process.env };
const redis = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => undefined),
}));

vi.mock('../../../src/lib/redis.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/redis.js')>()),
  getRedis: async () => redis,
}));

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function makeContext(seenHeaders: Array<Record<string, string>>): FetcherContext {
  return {
    db: null as unknown as FetcherContext['db'],
    redis: null as unknown as FetcherContext['redis'],
    http: {
      async json<T>(rawUrl: string, opts?: HttpOptions) {
        seenHeaders.push(opts?.headers ?? {});
        const url = new URL(rawUrl);
        const query = url.searchParams.get('q') ?? '';
        const page = Number(url.searchParams.get('page'));
        const needsSecondPage =
          page === 1 &&
          (query.includes('stars:>=5 ') || query.includes('stars:>=20 ')) &&
          !query.includes('created:>=30d');
        const items = needsSecondPage
          ? Array.from({ length: 100 }, (_, index) => ({
              id: index,
              full_name: `owner/repo-${index}`,
              name: `repo-${index}`,
              owner: { login: 'owner' },
              html_url: `https://github.com/owner/repo-${index}`,
              created_at: '2026-07-17T00:00:00.000Z',
            }))
          : [];
        return { data: { items } as T, cached: false };
      },
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
    since: new Date('2026-05-03T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

afterEach(() => {
  restoreEnv();
  redis.get.mockClear();
  redis.set.mockClear();
  vi.resetModules();
});

describe('recent-repos GitHub authentication', () => {
  it('merges the singleton and both pool aliases without duplicates', async () => {
    vi.resetModules();
    process.env.GITHUB_TOKEN = 'singleton-token';
    process.env.GH_TOKEN_POOL = 'pool-token-alpha, pool-token-bravo, pool-token-alpha';
    process.env.GITHUB_TOKEN_POOL = 'pool-token-bravo,pool-token-charlie,singleton-token';

    const {
      getGithubTokens,
      pickGithubToken,
      _resetGithubTokenPoolForTests,
    } = await import('../../../src/lib/util/github-token-pool.js');

    _resetGithubTokenPoolForTests();

    expect(getGithubTokens()).toEqual([
      'singleton-token',
      'pool-token-alpha',
      'pool-token-bravo',
      'pool-token-charlie',
    ]);
    expect(pickGithubToken()).toBe('singleton-token');
    expect(pickGithubToken()).toBe('pool-token-alpha');
  });

  it('uses legacy GITHUB_TOKEN only when no pool PATs are configured', async () => {
    vi.resetModules();
    process.env.GITHUB_TOKEN = 'singleton-token';
    delete process.env.GH_TOKEN_POOL;
    delete process.env.GITHUB_TOKEN_POOL;

    const {
      getGithubTokens,
      pickGithubToken,
      _resetGithubTokenPoolForTests,
    } = await import('../../../src/lib/util/github-token-pool.js');

    _resetGithubTokenPoolForTests();

    expect(getGithubTokens()).toEqual(['singleton-token']);
    expect(pickGithubToken()).toBe('singleton-token');
  });

  it('returns null when every configured token is known unusable', async () => {
    process.env.GH_TOKEN_POOL = 'pool-token-alpha,pool-token-bravo';
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN_POOL;

    const {
      pickGithubToken,
      recordRateLimit,
      _resetGithubTokenPoolForTests,
    } = await import('../../../src/lib/util/github-token-pool.js');

    _resetGithubTokenPoolForTests();
    const futureReset = Math.floor(Date.now() / 1000) + 3_600;
    recordRateLimit('pool-token-alpha', 0, futureReset);
    recordRateLimit('pool-token-bravo', 0, futureReset);

    expect(pickGithubToken()).toBeNull();
  });

  it('keeps search exhausted after a healthy core response', async () => {
    process.env.GITHUB_TOKEN = 'single-token';
    delete process.env.GH_TOKEN_POOL;
    delete process.env.GITHUB_TOKEN_POOL;

    const {
      pickGithubToken,
      recordRateLimit,
      _resetGithubTokenPoolForTests,
    } = await import('../../../src/lib/util/github-token-pool.js');

    _resetGithubTokenPoolForTests();
    const futureReset = Math.floor(Date.now() / 1000) + 3_600;
    recordRateLimit('single-token', 0, futureReset, 'search');
    recordRateLimit('single-token', 4_999, futureReset, 'core');

    expect(pickGithubToken('search')).toBeNull();
    expect(pickGithubToken('core')).toBe('single-token');
  });

  it('keeps a 401 quarantine active across every resource', async () => {
    process.env.GITHUB_TOKEN = 'single-token';
    delete process.env.GH_TOKEN_POOL;
    delete process.env.GITHUB_TOKEN_POOL;

    const {
      pickGithubToken,
      quarantine,
      recordRateLimit,
      _resetGithubTokenPoolForTests,
    } = await import('../../../src/lib/util/github-token-pool.js');

    _resetGithubTokenPoolForTests();
    const futureReset = Math.floor(Date.now() / 1000) + 3_600;
    quarantine('single-token');
    recordRateLimit('single-token', 30, futureReset, 'search');
    recordRateLimit('single-token', 4_999, futureReset, 'core');

    expect(pickGithubToken('search')).toBeNull();
    expect(pickGithubToken('core')).toBeNull();
    expect(pickGithubToken('graphql')).toBeNull();
    await vi.waitFor(() =>
      expect(
        redis.set.mock.calls.filter(([key]) =>
          String(key).startsWith('pool:github:tokens:'),
        ),
      ).toHaveLength(3),
    );
    for (const [, payload] of redis.set.mock.calls.filter(([key]) =>
      String(key).startsWith('pool:github:tokens:'),
    )) {
      expect(JSON.parse(String(payload)).quarantinedUntilMs).toBeGreaterThan(Date.now());
    }
  });

  it('still honors the app pool legacy wire format during hydration', async () => {
    process.env.GITHUB_TOKEN = 'single-token';
    delete process.env.GH_TOKEN_POOL;
    delete process.env.GITHUB_TOKEN_POOL;
    redis.get.mockResolvedValueOnce(JSON.stringify({
      tokenLabel: 'sing****oken',
      remaining: 0,
      resetUnixSec: Math.floor(Date.now() / 1000) + 3_600,
      quarantinedUntilMs: null,
    }));

    const {
      isHydrated,
      pickGithubToken,
      _resetGithubTokenPoolForTests,
    } = await import('../../../src/lib/util/github-token-pool.js');

    _resetGithubTokenPoolForTests();
    expect(pickGithubToken('core')).toBe('single-token');
    await vi.waitFor(() => expect(isHydrated()).toBe(true));
    expect(pickGithubToken('core')).toBeNull();
    expect(pickGithubToken('search')).toBe('single-token');
  });

  it('preserves an existing worker search hint when publishing a healthy core response', async () => {
    process.env.GITHUB_TOKEN = 'single-token';
    delete process.env.GH_TOKEN_POOL;
    delete process.env.GITHUB_TOKEN_POOL;
    const futureReset = Math.floor(Date.now() / 1000) + 3_600;
    const searchKey = 'pool:github:token-resources:sing****oken:search';
    const coreKey = 'pool:github:token-resources:sing****oken:core';
    redis.get.mockImplementation(async (key: string) =>
      key === searchKey
        ? JSON.stringify({ remaining: 0, resetUnixSec: futureReset })
        : null,
    );

    const {
      isHydrated,
      pickGithubToken,
      recordRateLimit,
      _resetGithubTokenPoolForTests,
    } = await import('../../../src/lib/util/github-token-pool.js');

    _resetGithubTokenPoolForTests();
    expect(pickGithubToken('core')).toBe('single-token');
    await vi.waitFor(() => expect(isHydrated()).toBe(true));
    recordRateLimit('single-token', 4_999, futureReset, 'core');

    await vi.waitFor(() =>
      expect(redis.set.mock.calls.some(([key]) => key === coreKey)).toBe(true),
    );
    const [, resourcePayload] =
      redis.set.mock.calls.find(([key]) => key === coreKey) ?? [];
    expect(JSON.parse(String(resourcePayload))).toEqual({
      remaining: 4_999,
      resetUnixSec: futureReset,
    });
    const [, payload] =
      redis.set.mock.calls.find(([key]) => key === 'pool:github:tokens:sing****oken') ?? [];
    expect(JSON.parse(String(payload))).toMatchObject({
      remaining: 4_999,
      resetUnixSec: futureReset,
      resources: {
        search: { remaining: 0, resetUnixSec: futureReset },
        core: { remaining: 4_999, resetUnixSec: futureReset },
      },
    });
  });

  it('publishes the same masked token label as the app pool', async () => {
    process.env.GITHUB_TOKEN = 'abcd-secret-wxyz';
    delete process.env.GH_TOKEN_POOL;
    delete process.env.GITHUB_TOKEN_POOL;

    const {
      recordRateLimit,
      _resetGithubTokenPoolForTests,
    } = await import('../../../src/lib/util/github-token-pool.js');

    _resetGithubTokenPoolForTests();
    recordRateLimit('abcd-secret-wxyz', 42, 1_800_000_000);

    const aggregateKey = 'pool:github:tokens:abcd****wxyz';
    const resourceKey = 'pool:github:token-resources:abcd****wxyz:core';
    await vi.waitFor(() => expect(redis.set).toHaveBeenCalledTimes(2));
    const [, payload] =
      redis.set.mock.calls.find(([key]) => key === aggregateKey) ?? [];
    const [, resourcePayload] =
      redis.set.mock.calls.find(([key]) => key === resourceKey) ?? [];
    expect(String(payload)).not.toContain('abcd-secret-wxyz');
    expect(JSON.parse(String(payload))).toMatchObject({
      remaining: 42,
      resetUnixSec: 1_800_000_000,
      resources: {
        core: { remaining: 42, resetUnixSec: 1_800_000_000 },
      },
    });
    expect(JSON.parse(String(resourcePayload))).toEqual({
      remaining: 42,
      resetUnixSec: 1_800_000_000,
    });
  });

  it('uses the worker GitHub token pool instead of legacy GH_PAT', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.DATA_STORE_DISABLE = '1';
    process.env.GH_PAT = 'legacy-single-token';
    process.env.GH_TOKEN_POOL = 'pool-token-alpha,pool-token-bravo';
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN_POOL;

    const seenHeaders: Array<Record<string, string>> = [];
    const { default: fetcher } = await import('../../../src/fetchers/recent-repos/index.js');

    await fetcher.run(makeContext(seenHeaders));

    expect(seenHeaders).toHaveLength(21);
    expect(seenHeaders.map((headers) => headers.Authorization)).toEqual([
      'Bearer pool-token-alpha',
      'Bearer pool-token-bravo',
      ...Array.from({ length: 19 }, (_, index) =>
        index % 2 === 0 ? 'Bearer pool-token-alpha' : 'Bearer pool-token-bravo',
      ),
    ]);
  });
});
