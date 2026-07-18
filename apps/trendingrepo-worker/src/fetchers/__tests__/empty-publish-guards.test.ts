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

  it('consensus-analyst normalizes partial model output and publishes a healthy merge', async () => {
    callLlmMock
      .mockResolvedValueOnce({
        text: '{"tagline":null,"verdict":"strong_consensus"}',
        usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 },
        meta: { provider: 'nanogpt', model: 'moonshotai/kimi-k2.6' },
      })
      .mockResolvedValueOnce({
        text: '{"headline":"Today in repos","bullets":["One","Two"]}',
        usage: { inputTokens: 4, outputTokens: 2, cachedInputTokens: 0 },
        meta: { provider: 'nanogpt', model: 'moonshotai/kimi-k2.6' },
      });
    readDataStoreMock.mockImplementation(async (key: string) => {
      if (key === 'consensus-trending') {
        const absent = { present: false, rank: null, score: null, normalized: 0 };
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
              rank: 1,
              consensusScore: 90,
              sourceCount: 1,
              confidence: 90,
              externalRank: 1,
              oursRank: 1,
              verdict: 'strong_consensus',
              maxRankGap: 0,
              sources: {
                ours: { present: true, rank: 1, score: 90, normalized: 0.9 },
                gh: { present: true, rank: 1, score: 90, normalized: 0.9 },
                hf: absent,
                hn: absent,
                x: absent,
                r: absent,
                pdh: absent,
                dev: absent,
                bs: absent,
              },
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

    expect(callLlmMock.mock.calls[0]).toHaveLength(2);
    expect(callLlmMock.mock.calls[1]).toHaveLength(2);
    expect(writeDataStoreMock).toHaveBeenCalledWith(
      'consensus-verdicts',
      expect.objectContaining({
        status: 'ok',
        items: expect.objectContaining({
          'old/repo': expect.any(Object),
          'owner/repo': expect.objectContaining({
            summary: expect.stringContaining('owner/repo'),
            verdict: 'strong',
          }),
        }),
      }),
    );
    expect(result.redisPublished).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('consensus-analyst only keeps healthy status when every timed-out row is retained', async () => {
    callLlmMock.mockImplementation(async (options: { systemPrompt: string; userMessage: string }) => {
      if (options.systemPrompt.includes('Daily Verdict editor')) {
        return {
          text: '{"headline":"Today in repos","bullets":["One","Two"]}',
          usage: { inputTokens: 4, outputTokens: 2, cachedInputTokens: 0 },
          meta: { provider: 'nanogpt', model: 'moonshotai/kimi-k2.6' },
        };
      }
      if (options.userMessage.includes('owner/repo-4')) {
        throw new Error('LLM stream idle');
      }
      return {
        text: '{"tagline":null,"verdict":"strong_consensus"}',
        usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 },
        meta: { provider: 'nanogpt', model: 'moonshotai/kimi-k2.6' },
      };
    });
    const absent = { present: false, rank: null, score: null, normalized: 0 };
    const items = Array.from({ length: 5 }, (_, index) => ({
      fullName: `owner/repo-${index}`,
      rank: index + 1,
      consensusScore: 90 - index,
      sourceCount: 1,
      confidence: 90,
      externalRank: index + 1,
      oursRank: index + 1,
      verdict: 'strong_consensus' as const,
      maxRankGap: 0,
      sources: {
        ours: { present: true, rank: index + 1, score: 90, normalized: 0.9 },
        gh: { present: true, rank: index + 1, score: 90, normalized: 0.9 },
        hf: absent,
        hn: absent,
        x: absent,
        r: absent,
        pdh: absent,
        dev: absent,
        bs: absent,
      },
    }));
    let retainFailedItem = true;
    readDataStoreMock.mockImplementation(async (key: string) => {
      if (key === 'consensus-trending') {
        return {
          itemCount: items.length,
          bandCounts: {
            strong_consensus: items.length,
            early_call: 0,
            divergence: 0,
            external_only: 0,
            single_source: 0,
          },
          sourceStats: {},
          weights: {},
          items,
        };
      }
      if (key === 'consensus-verdicts') {
        return {
          items: retainFailedItem
            ? {
                'owner/repo-4': {
                  fullName: 'owner/repo-4',
                  summary: 'retained report',
                },
              }
            : {},
        };
      }
      return null;
    });
    const { default: fetcher } = await import('../consensus-analyst/index.js');

    const result = await fetcher.run(makeContext());

    expect(writeDataStoreMock).toHaveBeenCalledWith(
      'consensus-verdicts',
      expect.objectContaining({
        status: 'ok',
        warnings: [expect.objectContaining({ stage: 'item-call', itemSourceId: 'owner/repo-4' })],
        items: expect.objectContaining({
          'owner/repo-4': expect.objectContaining({ summary: 'retained report' }),
        }),
      }),
    );
    expect(result.errors).toEqual([]);

    retainFailedItem = false;
    writeDataStoreMock.mockClear();
    const degradedResult = await fetcher.run(makeContext());
    const degradedCalls = writeDataStoreMock.mock.calls as unknown as Array<[string, {
      status: string;
      errors?: Array<{ stage: string }>;
      items: Record<string, unknown>;
    }]>;
    const degradedPayload = degradedCalls[0]![1];

    expect(degradedPayload.status).toBe('degraded');
    expect(degradedPayload.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: 'unretained-item-failures' })]),
    );
    expect(degradedPayload.items).not.toHaveProperty('owner/repo-4');
    expect(degradedResult.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: 'unretained-item-failures' })]),
    );
  });

  it('consensus-analyst-tail normalizes a partial tail item instead of dropping it', async () => {
    callLlmMock.mockResolvedValue({
      text: 'null',
      usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 },
      meta: { provider: 'nanogpt', model: 'moonshotai/kimi-k2.6' },
    });
    const absent = { present: false, rank: null, score: null, normalized: 0 };
    const items = Array.from({ length: 31 }, (_, index) => ({
      fullName: index === 30 ? 'owner/tail-repo' : `owner/repo-${index}`,
      rank: index + 1,
      consensusScore: 70,
      sourceCount: 1,
      confidence: 65,
      externalRank: index + 1,
      oursRank: index + 1,
      verdict: 'early_call' as const,
      maxRankGap: 0,
      sources: {
        ours: { present: true, rank: index + 1, score: 70, normalized: 0.7 },
        gh: { present: true, rank: index + 1, score: 70, normalized: 0.7 },
        hf: absent,
        hn: absent,
        x: absent,
        r: absent,
        pdh: absent,
        dev: absent,
        bs: absent,
      },
    }));
    readDataStoreMock.mockImplementation(async (key: string) => {
      if (key === 'consensus-trending') {
        return {
          itemCount: items.length,
          bandCounts: {
            strong_consensus: 0,
            early_call: items.length,
            divergence: 0,
            external_only: 0,
            single_source: 0,
          },
          sourceStats: {},
          weights: {},
          items,
        };
      }
      if (key === 'consensus-verdicts') {
        return {
          status: 'degraded',
          errors: [{ stage: 'insufficient-fresh-coverage', message: 'too few fresh rows' }],
          warnings: [{ stage: 'item-call', message: 'retained timeout' }],
          generator: 'kimi',
          ribbon: { headline: 'Existing', bullets: ['One', 'Two'] },
          items: {},
          usage: {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCachedInputTokens: 0,
          },
        };
      }
      return null;
    });
    const { default: fetcher } = await import('../consensus-analyst-tail/index.js');

    const result = await fetcher.run(makeContext());

    expect(callLlmMock.mock.calls[0]).toHaveLength(2);
    expect(writeDataStoreMock).toHaveBeenCalledWith(
      'consensus-verdicts',
      expect.objectContaining({
        status: 'degraded',
        errors: [{ stage: 'insufficient-fresh-coverage', message: 'too few fresh rows' }],
        warnings: [{ stage: 'item-call', message: 'retained timeout' }],
        generator: 'template',
        items: {
          'owner/tail-repo': expect.objectContaining({
            verdict: 'early',
            summary: expect.stringContaining('owner/tail-repo'),
          }),
        },
      }),
    );
    expect(result.redisPublished).toBe(true);
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
