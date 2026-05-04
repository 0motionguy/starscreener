import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'DATA_STORE_DISABLE',
  'REDIS_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE',
] as const;

const previousEnv = new Map<string, string | undefined>();
for (const key of ENV_KEYS) previousEnv.set(key, process.env[key]);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = previousEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('worker healthcheck', () => {
  it('allows Redis-only deployments when Supabase is not configured', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.DATA_STORE_DISABLE = '1';

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { oneShotHealthcheck } = await import('../src/server.js');

    await expect(oneShotHealthcheck()).resolves.toBe(0);
  });
});
