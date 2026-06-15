import { describe, expect, it } from 'vitest';
import {
  mergeItems,
  pickRunSlice,
  topTierFullNames,
} from '../index.js';
import {
  searchVideos,
  sevenDaysAgo,
  YouTubeQuotaExceededError,
  YouTubeApiError,
} from '../youtube-client.js';
import type { VideoMentionsEntry } from '../types.js';

describe('topTierFullNames', () => {
  it('returns up to tierSize fullNames in input order, filtering malformed rows', () => {
    const payload = {
      items: [
        { fullName: 'vercel/next.js', rank: 1 },
        { fullName: 'facebook/react', rank: 2 },
        { fullName: 'invalid-no-slash', rank: 3 },
        { fullName: '', rank: 4 },
        { fullName: 'huggingface/transformers', rank: 5 },
      ],
    };
    expect(topTierFullNames(payload, 3)).toEqual([
      'vercel/next.js',
      'facebook/react',
      'huggingface/transformers',
    ]);
  });

  it('returns empty array for null/empty payloads', () => {
    expect(topTierFullNames(null)).toEqual([]);
    expect(topTierFullNames(undefined)).toEqual([]);
    expect(topTierFullNames({})).toEqual([]);
    expect(topTierFullNames({ items: [] })).toEqual([]);
  });

  it('respects the tierSize cap when input is larger', () => {
    const items = Array.from({ length: 250 }, (_, i) => ({
      fullName: `owner${i}/repo${i}`,
      rank: i + 1,
    }));
    const out = topTierFullNames({ items }, 200);
    expect(out).toHaveLength(200);
    expect(out[0]).toBe('owner0/repo0');
    expect(out[199]).toBe('owner199/repo199');
  });
});

describe('pickRunSlice', () => {
  const tier = Array.from({ length: 200 }, (_, i) => `o/${i}`);

  it('returns the first reposPerRun starting at cursor 0', () => {
    const { picked, nextCursor } = pickRunSlice(tier, 0, 100);
    expect(picked).toHaveLength(100);
    expect(picked[0]).toBe('o/0');
    expect(picked[99]).toBe('o/99');
    expect(nextCursor).toBe(100);
  });

  it('returns the second half starting at cursor 100', () => {
    const { picked, nextCursor } = pickRunSlice(tier, 100, 100);
    expect(picked).toHaveLength(100);
    expect(picked[0]).toBe('o/100');
    expect(picked[99]).toBe('o/199');
    expect(nextCursor).toBe(0);
  });

  it('wraps around when the slice spans the tier end', () => {
    const { picked, nextCursor } = pickRunSlice(tier, 150, 100);
    expect(picked).toHaveLength(100);
    expect(picked[0]).toBe('o/150');
    expect(picked[49]).toBe('o/199');
    expect(picked[50]).toBe('o/0');
    expect(picked[99]).toBe('o/49');
    expect(nextCursor).toBe(50);
  });

  it('normalizes a cursor beyond the tier size with modulo', () => {
    const { picked, nextCursor } = pickRunSlice(tier, 200, 100);
    expect(picked[0]).toBe('o/0');
    expect(nextCursor).toBe(100);
  });

  it('handles negative cursor input safely (floors at 0 mod)', () => {
    const { picked } = pickRunSlice(tier, -50, 10);
    expect(picked[0]).toBe('o/150');
  });

  it('returns empty + cursor 0 for an empty tier', () => {
    expect(pickRunSlice([], 5, 10)).toEqual({ picked: [], nextCursor: 0 });
  });

  it('caps reposPerRun at the effective tier size', () => {
    const small = ['a/b', 'c/d', 'e/f'];
    const { picked, nextCursor } = pickRunSlice(small, 0, 100);
    expect(picked).toHaveLength(3);
    expect(nextCursor).toBe(0);
  });
});

describe('mergeItems', () => {
  const e = (count: number): VideoMentionsEntry => ({
    count7d: count,
    topVideos: [],
    fetchedAt: '2026-06-15T00:00:00Z',
  });

  it('overlays fresh entries on top of existing, preserving non-overlapping repos', () => {
    const merged = mergeItems(
      { 'vercel/next.js': e(10), 'facebook/react': e(20) },
      { 'facebook/react': e(25), 'huggingface/transformers': e(5) },
    );
    expect(merged['vercel/next.js']?.count7d).toBe(10);
    expect(merged['facebook/react']?.count7d).toBe(25);
    expect(merged['huggingface/transformers']?.count7d).toBe(5);
    expect(Object.keys(merged)).toHaveLength(3);
  });

  it('returns existing untouched when fresh is empty', () => {
    const existing = { 'vercel/next.js': e(10) };
    expect(mergeItems(existing, {})).toEqual(existing);
  });
});

describe('sevenDaysAgo', () => {
  it('returns an ISO string 7d before the supplied now', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    expect(sevenDaysAgo(now)).toBe('2026-06-08T12:00:00.000Z');
  });
});

describe('searchVideos', () => {
  const baseOpts = {
    query: 'vercel/next.js',
    apiKey: 'YT_KEY',
    publishedAfter: '2026-06-08T00:00:00Z',
  };

  it('parses totalResults and up to 5 snippet samples from a 200 OK', async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          pageInfo: { totalResults: 42, resultsPerPage: 50 },
          items: Array.from({ length: 7 }, (_, i) => ({
            id: { videoId: `vid${i}` },
            snippet: {
              title: `Video ${i}`,
              channelTitle: `Channel ${i}`,
              publishedAt: '2026-06-10T00:00:00Z',
            },
          })),
        }),
        { status: 200 },
      );
    const result = await searchVideos({ ...baseOpts, fetchImpl: fakeFetch });
    expect(result.totalResults).toBe(42);
    expect(result.topVideos).toHaveLength(5);
    expect(result.topVideos[0]).toMatchObject({
      title: 'Video 0',
      url: 'https://www.youtube.com/watch?v=vid0',
      channelTitle: 'Channel 0',
      publishedAt: '2026-06-10T00:00:00Z',
    });
  });

  it('skips snippet items missing videoId or title', async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          pageInfo: { totalResults: 3 },
          items: [
            { id: {}, snippet: { title: 'no id' } },
            { id: { videoId: 'v1' }, snippet: {} },
            { id: { videoId: 'v2' }, snippet: { title: 'ok' } },
          ],
        }),
        { status: 200 },
      );
    const result = await searchVideos({ ...baseOpts, fetchImpl: fakeFetch });
    expect(result.totalResults).toBe(3);
    expect(result.topVideos).toHaveLength(1);
    expect(result.topVideos[0]?.url).toBe('https://www.youtube.com/watch?v=v2');
  });

  it('throws YouTubeQuotaExceededError on 403 quotaExceeded', async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'The request cannot be completed because you have exceeded your quota.',
            errors: [{ reason: 'quotaExceeded', message: 'quota gone' }],
          },
        }),
        { status: 403 },
      );
    await expect(searchVideos({ ...baseOpts, fetchImpl: fakeFetch })).rejects.toBeInstanceOf(
      YouTubeQuotaExceededError,
    );
  });

  it('throws YouTubeQuotaExceededError on 403 dailyLimitExceeded', async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            errors: [{ reason: 'dailyLimitExceeded' }],
          },
        }),
        { status: 403 },
      );
    await expect(searchVideos({ ...baseOpts, fetchImpl: fakeFetch })).rejects.toBeInstanceOf(
      YouTubeQuotaExceededError,
    );
  });

  it('throws YouTubeApiError on other non-OK statuses', async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 });
    await expect(searchVideos({ ...baseOpts, fetchImpl: fakeFetch })).rejects.toBeInstanceOf(
      YouTubeApiError,
    );
  });

  it('returns totalResults=0 when pageInfo is missing', async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ items: [] }), { status: 200 });
    const result = await searchVideos({ ...baseOpts, fetchImpl: fakeFetch });
    expect(result.totalResults).toBe(0);
    expect(result.topVideos).toEqual([]);
  });
});
