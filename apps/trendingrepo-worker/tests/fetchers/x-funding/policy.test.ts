import { afterEach, describe, expect, it, vi } from 'vitest';

const writeDataStoreMock = vi.fn();
const fetchWithTimeoutMock = vi.fn();

vi.mock('../../../src/lib/redis.js', () => ({
  writeDataStore: writeDataStoreMock,
}));

vi.mock('../../../src/lib/util/http-helpers.js', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}));

const ORIGINAL_APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ORIGINAL_APIFY_APPROVAL = process.env.TRENDINGREPO_ENABLE_APIFY;

describe('x-funding Apify policy', () => {
  afterEach(() => {
    if (ORIGINAL_APIFY_TOKEN === undefined) delete process.env.APIFY_API_TOKEN;
    else process.env.APIFY_API_TOKEN = ORIGINAL_APIFY_TOKEN;
    if (ORIGINAL_APIFY_APPROVAL === undefined) delete process.env.TRENDINGREPO_ENABLE_APIFY;
    else process.env.TRENDINGREPO_ENABLE_APIFY = ORIGINAL_APIFY_APPROVAL;
    vi.restoreAllMocks();
    writeDataStoreMock.mockReset();
    fetchWithTimeoutMock.mockReset();
  });

  it('does not scrape or publish when APIFY_API_TOKEN is present without operator approval', async () => {
    vi.resetModules();
    process.env.APIFY_API_TOKEN = 'token-present';
    delete process.env.TRENDINGREPO_ENABLE_APIFY;
    fetchWithTimeoutMock.mockRejectedValue(new Error('network blocked'));
    writeDataStoreMock.mockResolvedValue({ source: 'redis' });
    const { default: fetcher } = await import('../../../src/fetchers/x-funding/index.js');

    const result = await fetcher.run({
      dryRun: false,
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as never);

    expect(result.itemsSeen).toBe(0);
    expect(result.redisPublished).toBe(false);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
    expect(writeDataStoreMock).not.toHaveBeenCalled();
  });
});
