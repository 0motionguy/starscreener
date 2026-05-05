import { describe, expect, it } from 'vitest';

import {
  applyEngagementFloor,
  buildEngagementFloor,
  mergeAllPostsPayload,
} from '../../src/fetchers/reddit/index.js';

// AGN-370 regression: when fetchRedditJson falls back to the RSS Atom
// parser, every post is returned with score=0/num_comments=0 (Atom
// doesn't carry those fields). Without the engagement-floor protection
// applied below, the Redis payload was overwritten with all-zero
// engagement and the public /reddit page rendered "0 upvotes / 0
// comments" everywhere — the user-reported P0 bug for this ticket.

const NOW_SEC = Math.floor(Date.UTC(2026, 4, 5, 0, 0, 0) / 1000); // 2026-05-05
const CUTOFF_SEC = NOW_SEC - 7 * 24 * 60 * 60;

function basePost(overrides: Record<string, unknown>) {
  return {
    id: 'p1',
    subreddit: 'programming',
    title: 't',
    url: 'https://example.com',
    permalink: 'https://www.reddit.com/r/programming/comments/p1/t/',
    score: 0,
    numComments: 0,
    createdUtc: NOW_SEC - 3600,
    author: 'u',
    repoFullName: null,
    ageHours: 1,
    velocity: 0,
    trendingScore: 0,
    content_tags: [],
    value_score: 0,
    ...overrides,
  } as unknown as Parameters<typeof applyEngagementFloor>[0][number];
}

describe('AGN-370: reddit engagement floor', () => {
  describe('mergeAllPostsPayload', () => {
    it('preserves prior engagement when current has zeros (RSS-Atom fallback)', () => {
      const previous = [basePost({ id: 'p1', score: 42, numComments: 7 })];
      const current = [basePost({ id: 'p1', score: 0, numComments: 0 })];
      const merged = mergeAllPostsPayload(previous, current, CUTOFF_SEC);
      expect(merged).toHaveLength(1);
      expect(merged[0]?.score).toBe(42);
      expect(merged[0]?.numComments).toBe(7);
    });

    it('takes max engagement when current has higher values', () => {
      const previous = [basePost({ id: 'p1', score: 10, numComments: 2 })];
      const current = [basePost({ id: 'p1', score: 50, numComments: 9 })];
      const merged = mergeAllPostsPayload(previous, current, CUTOFF_SEC);
      expect(merged[0]?.score).toBe(50);
      expect(merged[0]?.numComments).toBe(9);
    });

    it('mixes max-of-each independently (score from prev, comments from current)', () => {
      const previous = [basePost({ id: 'p1', score: 100, numComments: 0 })];
      const current = [basePost({ id: 'p1', score: 0, numComments: 25 })];
      const merged = mergeAllPostsPayload(previous, current, CUTOFF_SEC);
      expect(merged[0]?.score).toBe(100);
      expect(merged[0]?.numComments).toBe(25);
    });

    it('drops posts older than cutoff', () => {
      const stale = basePost({ id: 'old', createdUtc: CUTOFF_SEC - 1, score: 99 });
      const current = [basePost({ id: 'p1', score: 5, numComments: 1 })];
      const merged = mergeAllPostsPayload([stale], current, CUTOFF_SEC);
      expect(merged.find((p) => p.id === 'old')).toBeUndefined();
      expect(merged.find((p) => p.id === 'p1')).toBeDefined();
    });
  });

  describe('buildEngagementFloor', () => {
    it('returns empty floor when previous payload is null/undefined', () => {
      expect(buildEngagementFloor(null).size).toBe(0);
      expect(buildEngagementFloor(undefined).size).toBe(0);
    });

    it('aggregates max engagement across allPosts/topPosts/mentions', () => {
      const floor = buildEngagementFloor({
        allPosts: [basePost({ id: 'a', score: 5, numComments: 1 })],
        topPosts: [basePost({ id: 'a', score: 7, numComments: 0 })],
        mentions: {
          'foo/bar': {
            posts: [basePost({ id: 'a', score: 3, numComments: 8 })],
          },
        },
      });
      const a = floor.get('a');
      expect(a?.score).toBe(7); // max across the three
      expect(a?.numComments).toBe(8); // max across the three
    });

    it('handles malformed input without throwing', () => {
      const floor = buildEngagementFloor({
        allPosts: undefined,
        topPosts: undefined,
        mentions: undefined,
      });
      expect(floor.size).toBe(0);
    });
  });

  describe('applyEngagementFloor', () => {
    it('preserves prior score/numComments when current is zero', () => {
      const floor = new Map<string, { score: number; numComments: number }>([
        ['p1', { score: 42, numComments: 7 }],
      ]);
      const out = applyEngagementFloor(
        [basePost({ id: 'p1', score: 0, numComments: 0 })],
        floor,
      );
      expect(out[0]?.score).toBe(42);
      expect(out[0]?.numComments).toBe(7);
    });

    it('keeps higher current value (engagement only grows on a 7d window)', () => {
      const floor = new Map<string, { score: number; numComments: number }>([
        ['p1', { score: 10, numComments: 2 }],
      ]);
      const out = applyEngagementFloor(
        [basePost({ id: 'p1', score: 50, numComments: 9 })],
        floor,
      );
      expect(out[0]?.score).toBe(50);
      expect(out[0]?.numComments).toBe(9);
    });

    it('passes through posts with no prior floor entry untouched', () => {
      const floor = new Map<string, { score: number; numComments: number }>([
        ['other', { score: 99, numComments: 99 }],
      ]);
      const post = basePost({ id: 'p1', score: 5, numComments: 1 });
      const out = applyEngagementFloor([post], floor);
      expect(out[0]).toBe(post); // identity preserved when no change
    });

    it('returns input identity when floor is empty (cold start)', () => {
      const posts = [basePost({ id: 'p1', score: 0, numComments: 0 })];
      const out = applyEngagementFloor(posts, new Map());
      expect(out).toBe(posts);
    });
  });
});
