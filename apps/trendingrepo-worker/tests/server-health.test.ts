import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'DATA_STORE_DISABLE',
  'NODE_ENV',
  'REDIS_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE',
  'WORKER_HEALTH_FORCE_SCHEDULER',
  'WORKER_HEALTH_FORCE_PUBLISH',
  'WORKER_HEALTH_STARTUP_GRACE_MS',
  'WORKER_HEALTH_MAX_IDLE_MS',
  'WORKER_HEALTH_MAX_PUBLISH_IDLE_MS',
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

  it('fails production health when Redis is disabled', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.NODE_ENV = 'production';
    process.env.DATA_STORE_DISABLE = '1';

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { oneShotHealthcheck } = await import('../src/server.js');

    await expect(oneShotHealthcheck()).resolves.toBe(1);
  });

  it('fails enforced health when cron has not reported progress after startup grace', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.DATA_STORE_DISABLE = '1';
    process.env.WORKER_HEALTH_FORCE_SCHEDULER = '1';
    process.env.WORKER_HEALTH_STARTUP_GRACE_MS = '0';

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { oneShotHealthcheck } = await import('../src/server.js');

    await expect(oneShotHealthcheck({ enforceScheduler: true })).resolves.toBe(1);
  });

  it('fails enforced health when scheduler ran but no Redis publish succeeded', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.DATA_STORE_DISABLE = '1';
    process.env.WORKER_HEALTH_FORCE_SCHEDULER = '1';
    process.env.WORKER_HEALTH_STARTUP_GRACE_MS = '0';
    process.env.WORKER_HEALTH_MAX_IDLE_MS = '60000';

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { oneShotHealthcheck, recordRun } = await import('../src/server.js');
    recordRun(new Date());

    await expect(oneShotHealthcheck({ enforceScheduler: true })).resolves.toBe(1);
  });

  it('passes enforced health after recordRun marks Redis publication progress', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.DATA_STORE_DISABLE = '1';
    process.env.WORKER_HEALTH_FORCE_SCHEDULER = '1';
    process.env.WORKER_HEALTH_STARTUP_GRACE_MS = '0';
    process.env.WORKER_HEALTH_MAX_IDLE_MS = '60000';
    process.env.WORKER_HEALTH_MAX_PUBLISH_IDLE_MS = '60000';

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { oneShotHealthcheck, recordRun } = await import('../src/server.js');
    recordRun(new Date(), { redisPublished: true });

    await expect(oneShotHealthcheck({ enforceScheduler: true })).resolves.toBe(0);
  });
});
