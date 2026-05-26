import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FetcherContext, RedisHandle } from '../../../lib/types.js';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.TRENDINGREPO_BASE_URL = 'https://trendingrepo.com';

const fetcher = (await import('../index.js')).default;

function makeRedis(items: string[]): RedisHandle & { lists: Map<string, string[]> } {
  const lists = new Map<string, string[]>([
    ['queue:drop-a-repo', [...items]],
  ]);
  return {
    lists,
    async get() {
      return null;
    },
    async set() {},
    async del() {},
    async quit() {},
    async llen(key) {
      const queue = lists.get(key) ?? [];
      return queue.length;
    },
    async rpop(key) {
      const queue = lists.get(key) ?? [];
      lists.set(key, queue);
      return queue.pop() ?? null;
    },
    async lpush(key, ...values) {
      const queue = lists.get(key) ?? [];
      queue.unshift(...values);
      lists.set(key, queue);
      return queue.length;
    },
  };
}

function makeContext(redis: RedisHandle): FetcherContext {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as unknown as FetcherContext['log'];

  return {
    db: null as unknown as FetcherContext['db'],
    redis,
    http: null as unknown as FetcherContext['http'],
    log,
    dryRun: false,
    since: new Date('2026-05-25T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

describe('drop-intake-drain', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requeues enrich HTTP failures and returns them in RunResult.errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream failed', { status: 503 })),
    );
    const payload = JSON.stringify({
      submissionId: 'sub_123',
      fullName: 'acme/widgets',
      enqueuedAt: '2026-05-25T00:00:00.000Z',
      source: 'web:repo-submissions',
    });

    const redis = makeRedis([payload]);
    const result = await fetcher.run(makeContext(redis));

    expect(result.itemsSeen).toBe(1);
    expect(result.itemsUpserted).toBe(0);
    expect(result.errors).toEqual([
      {
        stage: 'enrich',
        message: expect.stringContaining('503'),
        itemSourceId: 'sub_123',
      },
    ]);
    const requeued = redis.lists.get('queue:drop-a-repo') ?? [];
    expect(requeued).toHaveLength(1);
    expect(JSON.parse(requeued[0]!)).toMatchObject({
      submissionId: 'sub_123',
      attempts: 1,
      source: 'web:repo-submissions',
    });
  });

  it('dead-letters a payload after the final enrich attempt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('still down', { status: 503 })),
    );
    const payload = JSON.stringify({
      submissionId: 'sub_final',
      fullName: 'acme/final',
      enqueuedAt: '2026-05-25T00:00:00.000Z',
      source: 'web:repo-submissions',
      attempts: 2,
    });

    const redis = makeRedis([payload]);
    const result = await fetcher.run(makeContext(redis));

    expect(result.itemsSeen).toBe(1);
    expect(result.itemsUpserted).toBe(0);
    expect(redis.lists.get('queue:drop-a-repo') ?? []).toHaveLength(0);
    const dead = redis.lists.get('queue:drop-a-repo:dead') ?? [];
    expect(dead).toHaveLength(1);
    expect(JSON.parse(dead[0]!)).toMatchObject({
      submissionId: 'sub_final',
      attempts: 3,
      source: 'web:repo-submissions',
    });
  });
});
