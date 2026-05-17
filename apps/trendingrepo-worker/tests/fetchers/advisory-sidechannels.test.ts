import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext, RedisHandle } from '../../src/lib/types.js';

const mockState = vi.hoisted(() => ({
  store: new Map<string, string>(),
  fetchJsonWithRetry: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock('../../src/lib/env.js', () => ({
  loadEnv: () => ({
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? 'test',
    PORT: Number(process.env.PORT ?? 8080),
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  }),
}));

vi.mock('../../src/lib/redis.js', () => {
  const dataPrefix = 'ss:data:v1';
  const metaPrefix = 'ss:meta:v1';

  function payloadKey(key: string): string {
    return `${dataPrefix}:${key}`;
  }

  function metaKey(key: string): string {
    return `${metaPrefix}:${key}`;
  }

  const redis: RedisHandle = {
    async get(key) {
      return mockState.store.get(key) ?? null;
    },
    async set(key, value) {
      mockState.store.set(key, value);
    },
    async del(key) {
      mockState.store.delete(key);
    },
    async quit() {
      // no-op
    },
  };

  return {
    getRedis: async () => redis,
    readDataStore: async <T,>(key: string): Promise<T | null> => {
      const raw = mockState.store.get(payloadKey(key));
      return raw ? (JSON.parse(raw) as T) : null;
    },
    writeDataStore: async (key: string, value: unknown) => {
      const writtenAt = new Date().toISOString();
      mockState.store.set(payloadKey(key), JSON.stringify(value));
      mockState.store.set(metaKey(key), writtenAt);
      return { source: 'redis' as const, writtenAt };
    },
  };
});

vi.mock('../../src/lib/util/http-helpers.js', () => {
  class HttpStatusError extends Error {
    status: number;
    statusText: string;

    constructor(response: { status: number; statusText: string }, url: string, bodyText = '') {
      super(
        `HTTP ${response.status} ${response.statusText}${url ? ` - ${url}` : ''}${
          bodyText ? ` - ${bodyText}` : ''
        }`,
      );
      this.name = 'HttpStatusError';
      this.status = response.status;
      this.statusText = response.statusText;
    }
  }

  return {
    fetchJsonWithRetry: mockState.fetchJsonWithRetry,
    HttpStatusError,
    sleep: mockState.sleep,
  };
});

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function makeContext(): FetcherContext {
  return {
    db: null as unknown as FetcherContext['db'],
    redis: null as unknown as FetcherContext['redis'],
    http: {
      async json<T>() {
        return { data: {} as T, cached: false };
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

function seedPayload(key: string, value: unknown): void {
  mockState.store.set(`ss:data:v1:${key}`, JSON.stringify(value));
  mockState.store.set(`ss:meta:v1:${key}`, new Date().toISOString());
}

function readPayload<T>(key: string): T {
  const raw = mockState.store.get(`ss:data:v1:${key}`);
  expect(raw).toBeDefined();
  return JSON.parse(raw ?? 'null') as T;
}

afterEach(() => {
  restoreEnv();
  mockState.store.clear();
  mockState.fetchJsonWithRetry.mockReset();
  mockState.sleep.mockReset();
  vi.resetModules();
});

describe('advisory side-channel fetchers', () => {
  it('npm-dependents uses anonymous Libraries.io reads when the key is missing', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.LIBRARIES_IO_API_KEY;
    seedPayload('trending-mcp', {
      items: [
        {
          slug: 'context7',
          package_name: '@upstash/context7',
          package_registry: 'npm',
          raw: { sources: ['official'] },
        },
      ],
    });
    mockState.fetchJsonWithRetry.mockResolvedValue({
      dependent_repos_count: 12,
      dependents_count: 3,
    });

    const { default: fetcher } = await import('../../src/fetchers/npm-dependents/index.js');
    const result = await fetcher.run(makeContext());

    expect(result.redisPublished).toBe(true);
    expect(result.metricsWritten).toBe(1);
    expect(mockState.fetchJsonWithRetry).toHaveBeenCalledWith(
      'https://libraries.io/api/npm/%40upstash%2Fcontext7',
      expect.objectContaining({
        headers: expect.objectContaining({ accept: 'application/json' }),
      }),
    );
    expect(readPayload('mcp-dependents')).toMatchObject({
      summary: {
        context7: { count: 15, packageName: '@upstash/context7' },
      },
      counts: { roster: 1, npmPackages: 1, ok: 1, failed: 0, cacheHit: 0 },
      status: 'ok',
    });
  });

  it('npm-dependents publishes an empty aggregate when the roster has no npm package coordinates', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.LIBRARIES_IO_API_KEY;
    seedPayload('trending-mcp', {
      items: [
        {
          slug: 'smithery-only',
          url: 'https://smithery.invalid/example',
          raw: { sources: ['smithery'] },
        },
      ],
    });

    const { default: fetcher } = await import('../../src/fetchers/npm-dependents/index.js');
    const result = await fetcher.run(makeContext());

    expect(result.redisPublished).toBe(true);
    expect(result.itemsSeen).toBe(1);
    expect(result.metricsWritten).toBe(0);
    expect(mockState.fetchJsonWithRetry).not.toHaveBeenCalled();
    expect(readPayload('mcp-dependents')).toMatchObject({
      summary: {},
      counts: { roster: 1, npmPackages: 0, ok: 0, failed: 0, cacheHit: 0 },
      status: 'empty',
      reason: 'no_npm_packages',
    });
  });

  it('mcp-smithery-rank uses anonymous Smithery reads when the key is missing', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SMITHERY_API_KEY;
    const ctx = makeContext();
    ctx.http.json = vi.fn(async () => ({
      data: {
        servers: [
          {
            qualifiedName: '@modelcontextprotocol/server-github',
            id: 'github',
            namespace: '@modelcontextprotocol',
            slug: 'server-github',
          },
        ],
        pagination: { totalPages: 1, totalCount: 1 },
      },
      cached: false,
    }));

    const { default: fetcher } = await import('../../src/fetchers/mcp-smithery-rank/index.js');
    const result = await fetcher.run(ctx);

    expect(result.redisPublished).toBe(true);
    expect(result.metricsWritten).toBe(2);
    expect(ctx.http.json).toHaveBeenCalledWith(
      'https://registry.smithery.ai/servers?page=1&pageSize=100',
      { timeoutMs: 20_000 },
    );
    expect(readPayload('mcp-smithery-rank')).toMatchObject({
      total: 1,
      summary: {
        '@modelcontextprotocol/server-github': {
          rank: 1,
          total: 1,
          qualifiedName: '@modelcontextprotocol/server-github',
        },
      },
      status: 'ok',
    });
  });

  it('hotness-snapshot writes current empty snapshots for domains with no scoreable items', async () => {
    seedPayload('trending-skill', { items: [] });
    seedPayload('trending-skill-sh', { items: [{ id: 'missing-score' }] });
    seedPayload('trending-mcp', { items: [{ id: 'mcp-a', hotness: 42 }] });

    const { default: fetcher } = await import('../../src/fetchers/hotness-snapshot/index.js');
    const result = await fetcher.run(makeContext());
    const today = new Date().toISOString().slice(0, 10);

    expect(result.redisPublished).toBe(true);
    expect(readPayload(`hotness-snapshot:trending-skill:${today}`)).toMatchObject({
      date: today,
      scores: {},
      counts: { total: 0 },
      status: 'empty',
      reason: 'empty_roster',
    });
    expect(readPayload(`hotness-snapshot:trending-skill-sh:${today}`)).toMatchObject({
      date: today,
      scores: {},
      counts: { total: 0 },
      status: 'empty',
      reason: 'no_scoreable_items',
    });
    expect(readPayload(`hotness-snapshot:trending-mcp:${today}`)).toMatchObject({
      date: today,
      scores: { 'mcp-a': 42 },
      counts: { total: 1 },
      status: 'ok',
    });
  });

  it('skill-install-snapshot writes current and prev empty snapshots when install counts are absent', async () => {
    seedPayload('trending-skill', { items: [{ slug: 'skill-a' }] });
    seedPayload('trending-skill-sh', { items: [] });

    const { default: fetcher } = await import('../../src/fetchers/skill-install-snapshot/index.js');
    const result = await fetcher.run(makeContext());
    const today = new Date().toISOString().slice(0, 10);

    expect(result.redisPublished).toBe(true);
    expect(result.metricsWritten).toBe(0);
    expect(readPayload(`skill-install-snapshot:${today}`)).toMatchObject({
      date: today,
      installs: {},
      counts: { sources: 2, skills: 0 },
      status: 'empty',
      reason: 'no_install_counts',
    });
    for (const slot of ['1d', '7d', '30d']) {
      expect(readPayload(`skill-install-snapshot:prev:${slot}`)).toMatchObject({
        installs: {},
        counts: { sources: 0, skills: 0 },
        status: 'empty',
        reason: 'history_missing',
      });
    }
  });
});
