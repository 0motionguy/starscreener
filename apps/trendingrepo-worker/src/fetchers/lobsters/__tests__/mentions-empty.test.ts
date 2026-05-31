import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../../lib/types.js';

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

vi.mock('../../../lib/util/tracked-repos.js', () => ({
  loadTrackedRepos: vi.fn(async () => new Map()),
}));

const originalSetTimeout = globalThis.setTimeout;

function story() {
  return {
    short_id: 'abc123',
    created_at: '2026-05-31T09:00:00.000Z',
    title: 'General AI systems discussion',
    url: 'https://example.com/post',
    description: 'No tracked repository link in this story.',
    score: 10,
    comment_count: 2,
    tags: ['ai'],
    user: 'tester',
  };
}

function makeContext(): FetcherContext {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as FetcherContext['log'];
  let calls = 0;
  return {
    db: null as unknown as FetcherContext['db'],
    redis: null as unknown as FetcherContext['redis'],
    http: {
      async json<T>() {
        calls += 1;
        return { data: (calls === 1 ? [story()] : []) as T, cached: false };
      },
      async text() {
        return { data: '', cached: false };
      },
    },
    log,
    dryRun: false,
    since: new Date('2026-05-31T10:00:00.000Z'),
    signalRunComplete: vi.fn(),
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
});

describe('lobsters empty mentions', () => {
  it('publishes lobsters-mentions even when no tracked repos were mentioned', async () => {
    readDataStoreMock.mockResolvedValue(null);
    const { default: fetcher } = await import('../index.js');

    await fetcher.run(makeContext());

    const writes = writeDataStoreMock.mock.calls as unknown as Array<
      [string, unknown, unknown?]
    >;
    const write = writes.find(
      ([slug]) => slug === 'lobsters-mentions',
    );
    expect(write).toBeDefined();
    const payload = write?.[1] as {
      scannedStories?: number;
      mentions?: Record<string, unknown>;
      leaderboard?: unknown[];
    };
    expect(payload.scannedStories).toBe(1);
    expect(payload.mentions).toEqual({});
    expect(payload.leaderboard).toEqual([]);
  });
});
