import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetcherContext, HttpOptions } from '../../../src/lib/types.js';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function makeContext(seenHeaders: Array<Record<string, string>>): FetcherContext {
  return {
    db: null as unknown as FetcherContext['db'],
    redis: null as unknown as FetcherContext['redis'],
    http: {
      async json<T>(_url: string, opts?: HttpOptions) {
        seenHeaders.push(opts?.headers ?? {});
        return { data: { items: [] } as T, cached: false };
      },
      async text() {
        return { data: '', cached: false };
      },
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as FetcherContext['log'],
    dryRun: false,
    since: new Date('2026-05-03T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

describe('recent-repos GitHub authentication', () => {
  it('uses the worker GitHub token pool instead of legacy GH_PAT', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.DATA_STORE_DISABLE = '1';
    process.env.GH_PAT = 'legacy-single-token';
    process.env.GH_TOKEN_POOL = 'pool-token-alpha,pool-token-bravo';
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN_POOL;

    const seenHeaders: Array<Record<string, string>> = [];
    const { default: fetcher } = await import('../../../src/fetchers/recent-repos/index.js');

    await fetcher.run(makeContext(seenHeaders));

    expect(seenHeaders).toHaveLength(3);
    expect(seenHeaders.map((headers) => headers.Authorization)).toEqual([
      'Bearer pool-token-alpha',
      'Bearer pool-token-alpha',
      'Bearer pool-token-alpha',
    ]);
  });
});
