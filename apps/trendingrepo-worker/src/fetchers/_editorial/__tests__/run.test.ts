import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../../lib/types.js';

const readDataStore = vi.fn();
const writeDataStore = vi.fn();

vi.mock('../../../lib/redis.js', () => ({
  readDataStore,
  writeDataStore,
}));

vi.mock('../../../lib/llm/router.js', () => ({
  callLlm: vi.fn(),
  getLlmProvider: () => 'template',
  isLlmConfigured: () => true,
}));

const { runEditorial } = await import('../run.js');

function ctx(): FetcherContext {
  return {
    db: {} as FetcherContext['db'],
    redis: {} as FetcherContext['redis'],
    http: {} as FetcherContext['http'],
    log: {
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as FetcherContext['log'],
    dryRun: false,
    since: new Date('2026-05-31T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

describe('runEditorial', () => {
  beforeEach(() => {
    readDataStore.mockReset();
    writeDataStore.mockReset();
  });

  it('refreshes the data-store heartbeat when there are no new candidates', async () => {
    readDataStore.mockResolvedValue({
      computedAt: '2026-05-28T12:00:00.000Z',
      generator: 'template',
      items: {
        'a__vs__b': {
          slug: 'a__vs__b',
          title: 'A vs B',
          overview: 'Existing overview that should be retained without another LLM call.',
        },
      },
    });
    writeDataStore.mockResolvedValue({
      source: 'redis',
      writtenAt: '2026-05-31T12:00:00.000Z',
    });

    const result = await runEditorial(ctx(), {
      slug: 'editorial-compare',
      fetcherName: 'editorial-compare',
      systemPrompt: 'system',
      buildWorkItems: async () => [],
      skipExisting: true,
    });

    expect(result.redisPublished).toBe(true);
    expect(result.itemsSeen).toBe(1);
    expect(writeDataStore).toHaveBeenCalledOnce();
    expect(writeDataStore.mock.calls[0]?.[0]).toBe('editorial-compare');
    expect(writeDataStore.mock.calls[0]?.[1]).toMatchObject({
      generator: 'template',
      items: {
        'a__vs__b': {
          slug: 'a__vs__b',
          title: 'A vs B',
        },
      },
    });
    expect(writeDataStore.mock.calls[0]?.[1].computedAt).not.toBe(
      '2026-05-28T12:00:00.000Z',
    );
  });
});
