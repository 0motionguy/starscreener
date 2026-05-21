// Unit tests for the reddit fetcher's OAuth client-credentials flow.
//
// Covers the 4 contract bullets from `bot/swarm-a3-reddit-oauth`:
//   (a) the token endpoint is called with HTTP Basic auth derived from
//       REDDIT_CLIENT_ID:REDDIT_CLIENT_SECRET.
//   (b) the bearer token is cached in-process across successive
//       sub-reddit requests (one token mint per run).
//   (c) data requests hit https://oauth.reddit.com/r/<sub>/new with
//       `Authorization: Bearer <token>` and the configured User-Agent.
//   (d) when REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET is unset, the
//       fetcher emits a warn log, skips the run, and returns a
//       valid (empty) RunResult instead of crashing.
//
// We mock `undici.fetch`, the data-store layer, and the tracked-repos
// loader so the test never touches a network or a real redis.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext } from '../../../lib/types.js';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('undici', () => ({
  fetch: fetchMock,
}));

vi.mock('../../../lib/redis.js', () => ({
  writeDataStore: vi.fn(async () => ({ source: 'redis' as const, writtenAt: new Date().toISOString() })),
  readDataStore: vi.fn(async () => null),
}));

vi.mock('../../../lib/util/tracked-repos.js', () => ({
  loadTrackedRepos: vi.fn(async () => new Map<string, string>()),
}));

// Keep the test fast by shrinking SUBREDDITS to two entries. We also
// want to assert the data endpoint is hit per-sub, so 2 is enough to
// prove the loop and the bearer reuse without N×100ms test latency.
vi.mock('../../../lib/util/source-watchers.js', () => ({
  SUBREDDITS: ['LocalLLaMA', 'ClaudeAI'],
}));

// Short-circuit the 5s REQUEST_PAUSE_MS between subs (the fetcher awaits
// `setTimeout` via its internal sleep helper). Replaced once, restored
// once, so the test suite stays under a second of wall time.
const originalSetTimeout = globalThis.setTimeout;

function makeContext(overrides: Partial<FetcherContext> = {}): FetcherContext {
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
        return { data: {} as T, cached: false };
      },
      async text() {
        return { data: '', cached: false };
      },
    },
    log,
    dryRun: false,
    since: new Date('2026-05-21T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
    ...overrides,
  };
}

function tokenResponse(token: string, expiresIn = 3600): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({ access_token: token, token_type: 'bearer', expires_in: expiresIn, scope: '*' }),
  } as unknown as Response;
}

function listingResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({ data: { children: [] } }),
  } as unknown as Response;
}

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

beforeEach(async () => {
  fetchMock.mockReset();
  vi.resetModules();
  // Short-circuit sleep() so 5s pauses between subs don't add up.
  globalThis.setTimeout = ((cb: () => void) => {
    cb();
    return 0 as unknown as ReturnType<typeof globalThis.setTimeout>;
  }) as typeof globalThis.setTimeout;
  // Each test starts with a clean module-level token cache.
  const mod = await import('../index.js');
  (mod as { __resetRedditOAuthCache?: () => void }).__resetRedditOAuthCache?.();
});

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout;
  restoreEnv();
});

describe('reddit fetcher OAuth client-credentials grant', () => {
  it('(a) mints a token with Basic auth, (b) caches it across sub-reddits, (c) calls oauth.reddit.com with Bearer + UA', async () => {
    process.env.REDDIT_CLIENT_ID = 'test-client-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-client-secret';
    process.env.REDDIT_USER_AGENT = 'trendingrepo-worker/0.1 (by /u/tester)';

    fetchMock
      .mockResolvedValueOnce(tokenResponse('test-bearer-abc'))
      .mockResolvedValue(listingResponse());

    const { default: fetcher } = await import('../index.js');
    const result = await fetcher.run(makeContext());

    expect(result.errors).toEqual([]);

    // (a) Token call: first fetch hits the token URL with Basic auth +
    //     grant_type=client_credentials in a urlencoded body.
    const tokenCall = fetchMock.mock.calls[0];
    expect(tokenCall?.[0]).toBe('https://www.reddit.com/api/v1/access_token');
    const tokenInit = tokenCall?.[1] as { method: string; headers: Record<string, string>; body: string };
    expect(tokenInit.method).toBe('POST');
    const expectedBasic = Buffer.from('test-client-id:test-client-secret', 'utf8').toString('base64');
    expect(tokenInit.headers.authorization).toBe(`Basic ${expectedBasic}`);
    expect(tokenInit.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(tokenInit.headers['user-agent']).toBe('trendingrepo-worker/0.1 (by /u/tester)');
    expect(tokenInit.body).toContain('grant_type=client_credentials');

    // (b) Bearer caching: exactly one POST to the token URL across the
    //     full run, regardless of how many sub-reddits get scanned.
    const tokenPosts = fetchMock.mock.calls.filter(([url]) => url === 'https://www.reddit.com/api/v1/access_token');
    expect(tokenPosts).toHaveLength(1);

    // (c) Data calls: every subsequent fetch must hit oauth.reddit.com,
    //     carry the bearer we just minted, and the configured UA.
    const dataCalls = fetchMock.mock.calls.slice(1);
    expect(dataCalls.length).toBeGreaterThanOrEqual(2); // one per SUBREDDIT mock entry
    for (const [url, init] of dataCalls) {
      expect(String(url)).toMatch(/^https:\/\/oauth\.reddit\.com\/r\/[A-Za-z0-9_]+\/new\?limit=\d+$/);
      const headers = (init as { headers: Record<string, string> }).headers;
      expect(headers.authorization).toBe('Bearer test-bearer-abc');
      expect(headers['user-agent']).toBe('trendingrepo-worker/0.1 (by /u/tester)');
    }
  });

  it('(d) when REDDIT_CLIENT_ID is missing, skips the run with a warn log and never calls fetch', async () => {
    delete process.env.REDDIT_CLIENT_ID;
    process.env.REDDIT_CLIENT_SECRET = 'present-but-id-missing';

    const { default: fetcher } = await import('../index.js');
    const ctx = makeContext();
    const result = await fetcher.run(ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.fetcher).toBe('reddit');
    expect(result.itemsSeen).toBe(0);
    expect(result.redisPublished).toBe(false);
    expect(result.errors).toEqual([]);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ hasClientId: false, hasClientSecret: true }),
      expect.stringContaining('OAuth env vars missing'),
    );
  });

  it('(d) when REDDIT_CLIENT_SECRET is missing, skips the run with a warn log and never calls fetch', async () => {
    process.env.REDDIT_CLIENT_ID = 'present-but-secret-missing';
    delete process.env.REDDIT_CLIENT_SECRET;

    const { default: fetcher } = await import('../index.js');
    const ctx = makeContext();
    const result = await fetcher.run(ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ hasClientId: true, hasClientSecret: false }),
      expect.stringContaining('OAuth env vars missing'),
    );
  });

  it('uses the default User-Agent (trendingrepo-worker/0.1) when REDDIT_USER_AGENT is unset', async () => {
    process.env.REDDIT_CLIENT_ID = 'cid';
    process.env.REDDIT_CLIENT_SECRET = 'csec';
    delete process.env.REDDIT_USER_AGENT;

    fetchMock
      .mockResolvedValueOnce(tokenResponse('tok'))
      .mockResolvedValue(listingResponse());

    const { default: fetcher } = await import('../index.js');
    await fetcher.run(makeContext());

    const tokenInit = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(tokenInit.headers['user-agent']).toBe('trendingrepo-worker/0.1');

    const firstDataCall = fetchMock.mock.calls[1]?.[1] as { headers: Record<string, string> };
    expect(firstDataCall.headers['user-agent']).toBe('trendingrepo-worker/0.1');
  });
});
