import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'REDIS_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

describe('worker env aliases', () => {
  const original: Partial<Record<(typeof ENV_KEYS)[number] | 'NODE_ENV', string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
    original.NODE_ENV = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (original.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.NODE_ENV;
    vi.resetModules();
  });

  it('accepts SUPABASE_SERVICE_ROLE_KEY as the service role secret', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(24);

    const { loadEnv } = await import('../src/lib/env.js');
    const env = loadEnv();

    expect(env.SUPABASE_SERVICE_ROLE).toBe(process.env.SUPABASE_SERVICE_ROLE_KEY);
  });

  it('prefers explicit SUPABASE_SERVICE_ROLE over legacy aliases', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE = 'primary-service-role-token';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-service-role-key';
    process.env.SUPABASE_SECRET_KEY = 'legacy-secret-key';

    const { loadEnv } = await import('../src/lib/env.js');
    const env = loadEnv();

    expect(env.SUPABASE_SERVICE_ROLE).toBe('primary-service-role-token');
  });
});
