import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../../lib/types.js';

const writeDataStoreMock = vi.hoisted(() =>
  vi.fn(async () => ({
    source: 'redis' as const,
    writtenAt: '2026-06-01T04:07:00.000Z',
  })),
);

vi.mock('../../../lib/redis.js', () => ({
  writeDataStore: writeDataStoreMock,
}));

function makeContext(payload: unknown): FetcherContext {
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
      async json<T>() {
        return { data: payload as T, cached: false };
      },
      async text() {
        return { data: '', cached: false };
      },
    },
    log,
    dryRun: false,
    since: new Date('2026-06-01T04:07:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T04:07:00.000Z'));
  writeDataStoreMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('manual-repos fetcher', () => {
  it('stamps fetchedAt with the mirror run time instead of preserving stale source metadata', async () => {
    const { default: fetcher } = await import('../index.js');

    await fetcher.run(
      makeContext({
        fetchedAt: '2026-04-23T06:34:56.377Z',
        items: [{ fullName: 'owner/repo' }],
      }),
    );

    expect(writeDataStoreMock).toHaveBeenCalledWith(
      'manual-repos',
      expect.objectContaining({
        fetchedAt: '2026-06-01T04:07:00.000Z',
        items: [{ fullName: 'owner/repo' }],
      }),
    );
  });
});
