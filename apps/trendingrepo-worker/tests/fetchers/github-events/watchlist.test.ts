import { describe, expect, it } from 'vitest';
import {
  deriveWatchlist,
  fromEngagementComposite,
  fromRepoMetadata,
  fromTrending,
} from '../../../src/fetchers/github-events/watchlist.js';

const engagement = (
  rows: Array<{ repoId: number; fullName: string; rank?: number }>,
): { items: Array<{ repoId: number; fullName: string; rank?: number }> } => ({
  items: rows,
});

const trending = (
  perBucket: Array<{ repo_id: number | string; repo_name: string }>,
): { buckets: Record<string, Record<string, typeof perBucket>> } => ({
  buckets: {
    past_24_hours: {
      All: perBucket,
    },
  },
});

const repoMetadata = (
  items: Array<{ githubId: number; fullName: string; stars: number }>,
): { items: typeof items } => ({ items });

describe('fromEngagementComposite', () => {
  it('respects explicit rank field when present', () => {
    const candidates = fromEngagementComposite(
      engagement([
        { repoId: 1, fullName: 'a/b', rank: 3 },
        { repoId: 2, fullName: 'c/d', rank: 1 },
        { repoId: 3, fullName: 'e/f', rank: 2 },
      ]),
    );
    expect(candidates.map((c) => c.rank)).toEqual([3, 1, 2]);
  });

  it('falls back to array position when rank is missing', () => {
    const candidates = fromEngagementComposite(
      engagement([
        { repoId: 1, fullName: 'a/b' },
        { repoId: 2, fullName: 'c/d' },
      ]),
    );
    expect(candidates.map((c) => c.rank)).toEqual([1, 2]);
  });

  it('skips rows with missing or invalid repoId / fullName', () => {
    const candidates = fromEngagementComposite({
      items: [
        { repoId: 1, fullName: 'a/b' },
        { repoId: 0, fullName: 'bad/zero' },
        { repoId: 99, fullName: 'no-slash' },
        { fullName: 'missing/id' },
        { repoId: 4 },
      ] as never,
    });
    expect(candidates.map((c) => c.repoId)).toEqual([1]);
  });

  it('returns [] for null / non-object inputs', () => {
    expect(fromEngagementComposite(null)).toEqual([]);
    expect(fromEngagementComposite(undefined)).toEqual([]);
    expect(fromEngagementComposite({} as never)).toEqual([]);
  });
});

describe('fromTrending', () => {
  it('coerces string repo_id and uses bucket position as rank', () => {
    const candidates = fromTrending(
      trending([
        { repo_id: '111', repo_name: 'a/b' },
        { repo_id: 222, repo_name: 'c/d' },
      ]),
    );
    expect(candidates).toEqual([
      { repoId: 111, fullName: 'a/b', rank: 1 },
      { repoId: 222, fullName: 'c/d', rank: 2 },
    ]);
  });

  it('dedupes across buckets, keeping the lowest-rank occurrence', () => {
    const payload = {
      buckets: {
        past_24_hours: {
          All: [
            { repo_id: '1', repo_name: 'a/b' },
            { repo_id: '2', repo_name: 'c/d' },
          ],
          Python: [
            { repo_id: '2', repo_name: 'c/d' }, // rank 1 here, beats the 2 above
            { repo_id: '3', repo_name: 'e/f' },
          ],
        },
      },
    };
    const candidates = fromTrending(payload);
    const cd = candidates.find((c) => c.fullName === 'c/d');
    expect(cd?.rank).toBe(1);
    // Sorted ascending by rank.
    expect(candidates[0]?.rank).toBe(1);
  });

  it('returns [] for malformed / missing buckets', () => {
    expect(fromTrending(null)).toEqual([]);
    expect(fromTrending({} as never)).toEqual([]);
    expect(fromTrending({ buckets: null } as never)).toEqual([]);
  });
});

describe('fromRepoMetadata', () => {
  it('ranks by stars descending', () => {
    const candidates = fromRepoMetadata(
      repoMetadata([
        { githubId: 1, fullName: 'low/stars', stars: 50 },
        { githubId: 2, fullName: 'high/stars', stars: 9000 },
        { githubId: 3, fullName: 'mid/stars', stars: 1500 },
      ]),
    );
    expect(candidates.map((c) => c.fullName)).toEqual([
      'high/stars',
      'mid/stars',
      'low/stars',
    ]);
    expect(candidates.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it('skips items with missing githubId or fullName', () => {
    const candidates = fromRepoMetadata({
      items: [
        { githubId: 1, fullName: 'a/b', stars: 100 },
        { fullName: 'missing/id', stars: 999 },
        { githubId: 2, stars: 10 },
        { githubId: 3, fullName: 'no-slash', stars: 5 },
      ] as never,
    });
    expect(candidates.map((c) => c.fullName)).toEqual(['a/b']);
  });
});

describe('deriveWatchlist', () => {
  it('uses engagement-composite alone when it can fill the target', () => {
    const result = deriveWatchlist({
      target: 2,
      engagement: engagement([
        { repoId: 1, fullName: 'a/b' },
        { repoId: 2, fullName: 'c/d' },
        { repoId: 3, fullName: 'e/f' },
      ]),
      trending: trending([{ repo_id: 999, repo_name: 'unused/repo' }]),
      repoMetadata: repoMetadata([{ githubId: 888, fullName: 'unused/meta', stars: 1 }]),
    });
    expect(result.drivers).toEqual(['engagement-composite']);
    expect(result.entries.map((e) => e.repoId)).toEqual([1, 2]);
  });

  it('falls through to trending when engagement is empty', () => {
    const result = deriveWatchlist({
      target: 2,
      engagement: null,
      trending: trending([
        { repo_id: '11', repo_name: 'a/b' },
        { repo_id: '22', repo_name: 'c/d' },
      ]),
      repoMetadata: null,
    });
    expect(result.drivers).toEqual(['trending']);
    expect(result.entries.map((e) => e.repoId)).toEqual([11, 22]);
  });

  it('falls through to repo-metadata when both upstream sources are missing', () => {
    const result = deriveWatchlist({
      target: 2,
      engagement: null,
      trending: null,
      repoMetadata: repoMetadata([
        { githubId: 7, fullName: 'big/star', stars: 50000 },
        { githubId: 8, fullName: 'mid/star', stars: 5000 },
      ]),
    });
    expect(result.drivers).toEqual(['repo-metadata']);
    expect(result.entries.map((e) => e.fullName)).toEqual(['big/star', 'mid/star']);
  });

  it('unions sources in priority order when no single source can fill the target', () => {
    const result = deriveWatchlist({
      target: 4,
      engagement: engagement([{ repoId: 1, fullName: 'a/b' }]),
      trending: trending([
        { repo_id: 2, repo_name: 'c/d' },
        { repo_id: 3, repo_name: 'e/f' },
      ]),
      repoMetadata: repoMetadata([{ githubId: 4, fullName: 'g/h', stars: 100 }]),
    });
    expect(result.drivers).toContain('engagement-composite');
    expect(result.drivers).toContain('trending');
    expect(result.entries.length).toBeGreaterThanOrEqual(3);
    expect(result.entries.map((e) => e.repoId).sort()).toEqual([1, 2, 3, 4]);
  });

  it('returns empty + driver list when every source is missing', () => {
    const result = deriveWatchlist({
      target: 10,
      engagement: null,
      trending: null,
      repoMetadata: null,
    });
    expect(result.entries).toEqual([]);
    expect(result.drivers).toEqual([]);
    expect(result.available).toEqual([]);
  });

  it('caps output at target even if more candidates exist', () => {
    const result = deriveWatchlist({
      target: 1,
      engagement: engagement([
        { repoId: 1, fullName: 'a/b' },
        { repoId: 2, fullName: 'c/d' },
        { repoId: 3, fullName: 'e/f' },
      ]),
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.rank).toBe(1);
  });
});
