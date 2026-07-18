import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Response } from 'undici';
import { createHttpClient } from '../src/lib/http.js';
import {
  _resetGithubTokenPoolForTests,
  pickGithubToken,
} from '../src/lib/util/github-token-pool.js';

const ORIGINAL_ENV = { ...process.env };
const fetch = vi.fn();

beforeEach(() => {
  fetch.mockReset();
  process.env.DATA_STORE_DISABLE = '1';
  process.env.GITHUB_TOKEN = 'github-secret-token';
  delete process.env.GH_TOKEN_POOL;
  delete process.env.GITHUB_TOKEN_POOL;
  _resetGithubTokenPoolForTests();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  _resetGithubTokenPoolForTests();
});

function client() {
  return createHttpClient({
    redis: null,
    fetch: fetch as typeof import('undici').fetch,
  });
}

describe('GitHub HTTP quota accounting', () => {
  it('records rate-limit headers before rejecting a non-2xx response', async () => {
    fetch.mockResolvedValue(
      new Response('forbidden', {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3_600),
        },
      }),
    );

    await expect(
      client().json('https://api.github.com/user', {
        headers: { Authorization: 'Bearer github-secret-token' },
        maxRetries: 0,
        useEtagCache: false,
      }),
    ).rejects.toThrow('403');

    expect(pickGithubToken()).toBeNull();
  });

  it('quarantines a GitHub bearer token on 401 without leaking it', async () => {
    fetch.mockResolvedValue(new Response('unauthorized', { status: 401 }));

    await expect(
      client().json('https://api.github.com/user', {
        headers: { Authorization: 'Bearer github-secret-token' },
        maxRetries: 0,
        useEtagCache: false,
      }),
    ).rejects.toThrow(/^http: 401 .*https:\/\/api\.github\.com\/user$/);

    expect(pickGithubToken()).toBeNull();
  });
});
