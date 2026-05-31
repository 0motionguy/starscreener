import { describe, expect, it, vi } from 'vitest';
import type { FetcherContext, RedisHandle } from '../../../lib/types.js';

const readDataStoreMock = vi.hoisted(() => vi.fn());
const writeDataStoreMock = vi.hoisted(() =>
  vi.fn(async () => ({
    source: 'redis' as const,
    writtenAt: '2026-05-31T12:45:00.000Z',
  })),
);

vi.mock('../../../lib/redis.js', () => ({
  readDataStore: readDataStoreMock,
  writeDataStore: writeDataStoreMock,
}));

function makeRedis(): RedisHandle & { getCalls: string[] } {
  const values = new Map<string, string>([
    ['ss:data:v1:trending', 'gz1:not-json-without-datastore-reader'],
    [
      'ss:meta:v1:trending',
      '{"writtenAt":"2026-05-31T12:40:00.000Z","writer":"worker:oss-trending:fallback"}',
    ],
  ]);
  const getCalls: string[] = [];
  return {
    getCalls,
    async get(key: string) {
      getCalls.push(key);
      return values.get(key) ?? null;
    },
    async set(key: string, value: string) {
      values.set(key, value);
    },
    async del(key: string) {
      values.delete(key);
    },
    async quit() {},
  };
}

function makeContext(redis: RedisHandle): FetcherContext {
  return {
    db: null as unknown as FetcherContext['db'],
    redis,
    http: null as unknown as FetcherContext['http'],
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as FetcherContext['log'],
    dryRun: false,
    since: new Date('2026-05-31T12:40:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

describe('deltas current trending read path', () => {
  it('uses readDataStore for the canonical trending slug so gzipped payloads decode', async () => {
    vi.resetModules();
    readDataStoreMock.mockReset();
    writeDataStoreMock.mockClear();
    const { default: fetcher } = await import('../index.js');

    readDataStoreMock.mockResolvedValueOnce({
      fetchedAt: '2026-05-31T12:40:00.000Z',
      buckets: {
        past_24_hours: {
          All: [{ repo_id: '123', stars: '42' }],
        },
      },
    });

    const redis = makeRedis();
    const result = await fetcher.run(makeContext(redis));

    expect(readDataStoreMock).toHaveBeenCalledWith('trending');
    expect(redis.getCalls).not.toContain('ss:data:v1:trending');
    expect(writeDataStoreMock).toHaveBeenCalledWith(
      'deltas',
      expect.objectContaining({
        repos: expect.objectContaining({
          '123': expect.objectContaining({ stars_now: 42 }),
        }),
      }),
    );
    expect(result.itemsSeen).toBe(1);
    expect(result.redisPublished).toBe(true);
  });
});
