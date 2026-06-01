import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../lib/types.js';

const readDataStoreMock = vi.hoisted(() => vi.fn());
const writeDataStoreMock = vi.hoisted(() =>
  vi.fn(async () => ({
    source: 'redis' as const,
    writtenAt: '2026-06-01T00:00:00.000Z',
  })),
);
const loadTrackedReposMock = vi.hoisted(() =>
  vi.fn(async () => new Map<string, string>()),
);
const fetchWithTimeoutMock = vi.hoisted(() => vi.fn());
const fetchJsonWithRetryMock = vi.hoisted(() => vi.fn());
const sleepMock = vi.hoisted(() => vi.fn(async () => undefined));
const callLlmMock = vi.hoisted(() => vi.fn());
const isLlmConfiguredMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('../../lib/redis.js', () => ({
  readDataStore: readDataStoreMock,
  writeDataStore: writeDataStoreMock,
}));

vi.mock('../../lib/util/tracked-repos.js', () => ({
  loadTrackedRepos: loadTrackedReposMock,
}));

vi.mock('../../lib/util/http-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/util/http-helpers.js')>();
  return {
    ...actual,
    fetchWithTimeout: fetchWithTimeoutMock,
    fetchJsonWithRetry: fetchJsonWithRetryMock,
    sleep: sleepMock,
  };
});

vi.mock('../../lib/llm/router.js', () => ({
  callLlm: callLlmMock,
  getLlmProvider: () => 'kimi',
  isLlmConfigured: isLlmConfiguredMock,
}));

function makeContext(overrides: Partial<FetcherContext> = {}): FetcherContext {
  return {
    db: null as unknown as FetcherContext['db'],
    redis: null as unknown as FetcherContext['redis'],
    http: {
      async json() {
        throw new Error('not used');
      },
      async text() {
        throw new Error('not used');
      },
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    } as unknown as FetcherContext['log'],
    dryRun: false,
    since: new Date('2026-06-01T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  readDataStoreMock.mockReset();
  writeDataStoreMock.mockClear();
  loadTrackedReposMock.mockReset();
  loadTrackedReposMock.mockResolvedValue(new Map<string, string>());
  fetchWithTimeoutMock.mockReset();
  fetchJsonWithRetryMock.mockReset();
  sleepMock.mockClear();
  callLlmMock.mockReset();
  isLlmConfiguredMock.mockReset();
  isLlmConfiguredMock.mockReturnValue(true);
});

describe('worker fetcher empty publish guards', () => {
  it('engagement-composite preserves the prior slug when upstream payloads are missing', async () => {
    readDataStoreMock.mockResolvedValue(null);
    const { default: fetcher } = await import('../engagement-composite/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'upstream-missing')).toBe(true);
  });

  it('crunchbase preserves the prior slug when all RSS feeds fail', async () => {
    fetchWithTimeoutMock.mockRejectedValue(new Error('rss unavailable'));
    const { default: fetcher } = await import('../crunchbase/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'empty-signals')).toBe(true);
  });

  it('npm-packages preserves the prior slug when discovery returns no usable rows', async () => {
    fetchJsonWithRetryMock.mockRejectedValue(new Error('npm unavailable'));
    const { default: fetcher } = await import('../npm-packages/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'empty-packages')).toBe(true);
  });

  it('trendshift-daily preserves the prior slug when fetch fails', async () => {
    const { default: fetcher } = await import('../trendshift-daily/index.js');

    const result = await fetcher.run(
      makeContext({
        http: {
          async json() {
            throw new Error('not used');
          },
          async text() {
            throw new Error('trendshift unavailable');
          },
        },
      }),
    );

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'fetch')).toBe(true);
  });

  it('consensus-analyst preserves prior verdicts when LLM is unconfigured', async () => {
    isLlmConfiguredMock.mockReturnValue(false);
    readDataStoreMock.mockImplementation(async (key: string) => {
      if (key === 'consensus-trending') {
        return {
          itemCount: 1,
          bandCounts: {
            strong_consensus: 1,
            early_call: 0,
            divergence: 0,
            external_only: 0,
            single_source: 0,
          },
          sourceStats: {},
          weights: {},
          items: [
            {
              fullName: 'owner/repo',
              consensusScore: 90,
              sourceCount: 3,
              confidence: 90,
              verdict: 'strong_consensus',
              maxRankGap: 0,
            },
          ],
        };
      }
      if (key === 'consensus-verdicts') {
        return {
          items: {
            'old/repo': {
              fullName: 'old/repo',
              summary: 'old',
            },
          },
        };
      }
      return null;
    });
    const { default: fetcher } = await import('../consensus-analyst/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'llm-unconfigured')).toBe(true);
  });

  it('consensus-analyst skips publishing when every fresh item call fails', async () => {
    callLlmMock.mockRejectedValue(new Error('llm unavailable'));
    readDataStoreMock.mockImplementation(async (key: string) => {
      if (key === 'consensus-trending') {
        return {
          itemCount: 1,
          bandCounts: {
            strong_consensus: 1,
            early_call: 0,
            divergence: 0,
            external_only: 0,
            single_source: 0,
          },
          sourceStats: {},
          weights: {},
          items: [
            {
              fullName: 'owner/repo',
              consensusScore: 90,
              sourceCount: 3,
              confidence: 90,
              verdict: 'strong_consensus',
              maxRankGap: 0,
            },
          ],
        };
      }
      if (key === 'consensus-verdicts') {
        return {
          items: {
            'old/repo': {
              fullName: 'old/repo',
              summary: 'old',
            },
          },
        };
      }
      return null;
    });
    const { default: fetcher } = await import('../consensus-analyst/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'empty-verdicts')).toBe(true);
  });

  it('funding-news preserves the prior slug when every RSS feed fails', async () => {
    fetchWithTimeoutMock.mockRejectedValue(new Error('rss unavailable'));
    const { default: fetcher } = await import('../funding-news/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'empty-live-signals')).toBe(true);
  });

  it('lmarena preserves the prior slug when pagination fails after partial rows', async () => {
    let page = 0;
    const { default: fetcher } = await import('../lmarena/index.js');

    const result = await fetcher.run(
      makeContext({
        http: {
          async json<T>() {
            if (page === 0) {
              page += 1;
              return {
                data: {
                  num_rows_total: 150,
                  rows: Array.from({ length: 100 }, (_, index) => ({
                    row_idx: index,
                    row: {
                      model_name: `Model ${index}`,
                      organization: 'Org',
                      rating: 1200 + index,
                      vote_count: 10,
                      rank: index + 1,
                      category: 'overall',
                      leaderboard_publish_date: '2026-06-01',
                    },
                  })),
                } as T,
                cached: false,
              };
            }
            throw new Error('hf page unavailable');
          },
          async text() {
            throw new Error('not used');
          },
        },
      }),
    );

    expect(writeDataStoreMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors.some((error) => error.stage === 'pagination-incomplete')).toBe(true);
  });
});
