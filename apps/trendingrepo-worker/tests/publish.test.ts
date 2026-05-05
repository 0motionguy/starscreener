import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRENDING_ITEM_TYPES } from '../src/lib/types.js';

const mockState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  store: new Map<string, string>(),
  setCalls: [] as Array<{ key: string; mode?: string; ttl?: number }>,
}));

vi.mock('../src/lib/db.js', () => ({
  queryTopByType: vi.fn(async () => mockState.rows),
}));

vi.mock('../src/lib/env.js', () => ({
  loadEnv: () => ({
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? 'test',
    PORT: Number(process.env.PORT ?? 8080),
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  }),
}));

vi.mock('ioredis', () => {
  class Redis {
    constructor(_url: string, _opts: Record<string, unknown>) {}

    on(_event: string, _handler: (err: Error) => void): void {}

    async get(key: string): Promise<string | null> {
      return mockState.store.get(key) ?? null;
    }

    async set(key: string, value: string, mode?: string, ttl?: number): Promise<void> {
      mockState.store.set(key, value);
      mockState.setCalls.push({ key, mode, ttl });
    }

    async del(key: string): Promise<void> {
      mockState.store.delete(key);
    }

    async quit(): Promise<void> {}
  }

  return { Redis };
});

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'repo-1',
    type: 'repo',
    source: 'github',
    source_id: 'source-1',
    slug: 'owner/repo-1',
    title: 'Repo One',
    description: 'desc',
    url: 'https://github.com/owner/repo-1',
    author: 'owner',
    vendor: null,
    agents: [],
    tags: [],
    language: 'TypeScript',
    license: 'MIT',
    thumbnail_url: null,
    trending_score: 42,
    absolute_popularity: 123,
    cross_source_count: 1,
    first_seen_at: '2026-05-01T00:00:00.000Z',
    last_seen_at: '2026-05-01T00:00:00.000Z',
    last_modified_at: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    raw: {},
    ...overrides,
  };
}

afterEach(async () => {
  const { closeRedis } = await import('../src/lib/redis.js');
  await closeRedis();
  restoreEnv();
  mockState.rows = [];
  mockState.store.clear();
  mockState.setCalls = [];
});

describe('TRENDING_ITEM_TYPES', () => {
  it('is non-empty, all entries are strings, and contains no duplicates', () => {
    expect(TRENDING_ITEM_TYPES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(TRENDING_ITEM_TYPES).size).toBe(TRENDING_ITEM_TYPES.length);
    for (const t of TRENDING_ITEM_TYPES) expect(typeof t).toBe('string');
  });

  it('includes the foundational kinds we always ship', () => {
    // These were the v1 types; refactors can add more (e.g. 'paper') but
    // never silently drop one of the founding seven.
    for (const t of ['skill', 'mcp', 'hf_model', 'hf_dataset', 'hf_space', 'repo', 'idea']) {
      expect(TRENDING_ITEM_TYPES).toContain(t);
    }
  });
});

describe('publishLeaderboard (integration)', () => {
  it('writes denormalized JSON + meta to ss:data:v1/ss:meta:v1 without TTL', async () => {
    process.env.REDIS_URL = 'redis://test';
    delete process.env.DATA_STORE_DISABLE;
    mockState.rows = [makeRow()];

    const { publishLeaderboard } = await import('../src/lib/publish.js');
    const result = await publishLeaderboard(null as never, 'repo');

    expect(result.redisPublished).toBe(true);
    expect(result.items).toBe(1);

    const payloadRaw = mockState.store.get('ss:data:v1:trending-repo');
    const metaRaw = mockState.store.get('ss:meta:v1:trending-repo');
    expect(payloadRaw).toBeDefined();
    expect(metaRaw).toBeDefined();

    const payload = JSON.parse(payloadRaw ?? 'null') as {
      type: string;
      items: Array<{ slug: string; metrics: { stars_total: number } }>;
    };
    expect(payload.type).toBe('repo');
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.slug).toBe('owner/repo-1');
    expect(payload.items[0]?.metrics.stars_total).toBe(123);

    const payloadCall = mockState.setCalls.find((c) => c.key === 'ss:data:v1:trending-repo');
    const metaCall = mockState.setCalls.find((c) => c.key === 'ss:meta:v1:trending-repo');
    expect(payloadCall?.mode).toBeUndefined();
    expect(payloadCall?.ttl).toBeUndefined();
    expect(metaCall?.mode).toBeUndefined();
    expect(metaCall?.ttl).toBeUndefined();
  });

  it('returns redisPublished=false when DATA_STORE_DISABLE=1', async () => {
    process.env.REDIS_URL = 'redis://test';
    process.env.DATA_STORE_DISABLE = '1';
    mockState.rows = [makeRow({ id: 'repo-2', slug: 'owner/repo-2' })];

    const { publishLeaderboard } = await import('../src/lib/publish.js');
    const result = await publishLeaderboard(null as never, 'repo');

    expect(result.redisPublished).toBe(false);
    expect(result.items).toBe(1);
    expect(mockState.store.size).toBe(0);
    expect(mockState.setCalls).toHaveLength(0);
  });
});
