import { describe, expect, it } from 'vitest';
import {
  appendToday,
  fetchCurrentStars,
  STAR_ACTIVITY_LIMIT,
  type StarActivityPayload,
} from '../index.js';
import { _resetGithubTokenPoolForTests } from '../../../lib/util/github-token-pool.js';

it('covers the expanded 3000-repo registry by default', () => {
  expect(STAR_ACTIVITY_LIMIT).toBe(3000);
});

it('quarantines a 401 token and rotates the next repo request', async () => {
  const originalFetch = globalThis.fetch;
  const originalPool = process.env.GH_TOKEN_POOL;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  const originalGithubTokenPool = process.env.GITHUB_TOKEN_POOL;
  const authHeaders: string[] = [];
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN_POOL;
  process.env.GH_TOKEN_POOL = 'alpha-token,bravo-token';
  _resetGithubTokenPoolForTests();
  let call = 0;
  globalThis.fetch = async (_input, init) => {
    authHeaders.push(new Headers(init?.headers).get('authorization') ?? '');
    call += 1;
    if (call === 1) return new Response('', { status: 401 });
    return new Response(JSON.stringify({ stargazers_count: 42 }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-ratelimit-remaining': '4998',
        'x-ratelimit-reset': '2000000000',
      },
    });
  };

  try {
    await expect(fetchCurrentStars('owner/first')).resolves.toBeNull();
    await expect(fetchCurrentStars('owner/second')).resolves.toBe(42);
    expect(authHeaders).toEqual(['Bearer alpha-token', 'Bearer bravo-token']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPool === undefined) delete process.env.GH_TOKEN_POOL;
    else process.env.GH_TOKEN_POOL = originalPool;
    if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGithubToken;
    if (originalGithubTokenPool === undefined) delete process.env.GITHUB_TOKEN_POOL;
    else process.env.GITHUB_TOKEN_POOL = originalGithubTokenPool;
    _resetGithubTokenPoolForTests();
  }
});

describe('appendToday', () => {
  const NOW = '2026-05-27T04:17:00.000Z';
  const today = NOW.slice(0, 10);

  it('bootstraps a fresh payload when none exists', () => {
    const out = appendToday(null, 'owner/repo', 500, NOW);
    expect(out.repoId).toBe('owner/repo');
    expect(out.points).toHaveLength(1);
    expect(out.points[0]).toEqual({ d: today, s: 500, delta: 500 });
    expect(out.firstObservedAt).toBe(NOW);
    expect(out.backfillSource).toBe('snapshot-only');
    expect(out.coversFirstStar).toBe(false);
    expect(out.updatedAt).toBe(NOW);
  });

  it('appends a new point on a new day', () => {
    const existing: StarActivityPayload = {
      repoId: 'owner/repo',
      points: [
        { d: '2026-05-26', s: 480, delta: 5 },
        { d: '2026-05-26', s: 500, delta: 20 },
      ],
      firstObservedAt: '2026-05-01T00:00:00.000Z',
      backfillSource: 'stargazer-api',
      coversFirstStar: true,
      updatedAt: '2026-05-26T04:17:00.000Z',
    };
    const out = appendToday(existing, 'owner/repo', 525, NOW);
    expect(out.points).toHaveLength(3);
    expect(out.points[2]).toEqual({ d: today, s: 525, delta: 25 });
    expect(out.firstObservedAt).toBe('2026-05-01T00:00:00.000Z'); // preserved
    expect(out.backfillSource).toBe('stargazer-api'); // preserved
    expect(out.coversFirstStar).toBe(true); // preserved
  });

  it('replaces today’s point (idempotent re-run)', () => {
    const existing: StarActivityPayload = {
      repoId: 'owner/repo',
      points: [
        { d: '2026-05-26', s: 480, delta: 5 },
        { d: today, s: 510, delta: 30 },
      ],
      firstObservedAt: '2026-05-01T00:00:00.000Z',
      backfillSource: 'stargazer-api',
      coversFirstStar: true,
      updatedAt: '2026-05-27T03:00:00.000Z',
    };
    const out = appendToday(existing, 'owner/repo', 525, NOW);
    expect(out.points).toHaveLength(2);
    expect(out.points[1]).toEqual({ d: today, s: 525, delta: 45 }); // delta from PREV point's s=480
  });

  it('preserves the canonical repoId even when payload had a wrong one', () => {
    const existing: StarActivityPayload = {
      repoId: 'OLD/CASE',
      points: [{ d: '2026-05-26', s: 100, delta: 100 }],
      firstObservedAt: '2026-05-26T00:00:00.000Z',
      backfillSource: 'snapshot-only',
      coversFirstStar: false,
      updatedAt: '2026-05-26T00:00:00.000Z',
    };
    const out = appendToday(existing, 'canonical/case', 110, NOW);
    expect(out.repoId).toBe('canonical/case');
  });

  it('computes delta=0 on first day even with non-zero current stars', () => {
    const out = appendToday(null, 'owner/repo', 1000, NOW);
    // First-ever point: prev=0, so delta = currentStars - 0 = currentStars.
    expect(out.points[0]?.delta).toBe(1000);
  });
});
