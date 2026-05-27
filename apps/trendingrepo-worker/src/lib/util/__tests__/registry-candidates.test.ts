import { describe, expect, it } from 'vitest';
import {
  extractTrendingFullNames,
  rankedRegistryFullNames,
  unionOrderedFullNames,
} from '../registry-candidates.js';

describe('rankedRegistryFullNames', () => {
  it('returns empty when registry is null', () => {
    expect(rankedRegistryFullNames(null, 25)).toEqual([]);
  });

  it('orders by lastSeenAt desc', () => {
    const registry = {
      repos: {
        a: { fullName: 'old/a', lastSeenAt: '2026-04-01T00:00:00.000Z' },
        b: { fullName: 'new/b', lastSeenAt: '2026-05-27T00:00:00.000Z' },
        c: { fullName: 'mid/c', lastSeenAt: '2026-05-15T00:00:00.000Z' },
      },
    };
    expect(rankedRegistryFullNames(registry, 10)).toEqual([
      'new/b',
      'mid/c',
      'old/a',
    ]);
  });

  it('caps to limit', () => {
    const registry = {
      repos: {
        a: { fullName: 'a/1', lastSeenAt: '2026-05-27T03:00:00.000Z' },
        b: { fullName: 'b/2', lastSeenAt: '2026-05-27T02:00:00.000Z' },
        c: { fullName: 'c/3', lastSeenAt: '2026-05-27T01:00:00.000Z' },
      },
    };
    expect(rankedRegistryFullNames(registry, 2)).toEqual(['a/1', 'b/2']);
  });

  it('skips malformed entries', () => {
    const registry = {
      repos: {
        good: { fullName: 'a/good', lastSeenAt: '2026-05-27T00:00:00.000Z' },
        noSlash: { fullName: 'noslash', lastSeenAt: '2026-05-27T00:00:00.000Z' },
        missingDate: { fullName: 'b/nodate' } as { fullName: string; lastSeenAt: string },
      },
    };
    expect(rankedRegistryFullNames(registry, 25)).toEqual(['a/good']);
  });
});

describe('unionOrderedFullNames', () => {
  it('returns empty for no lists', () => {
    expect(unionOrderedFullNames()).toEqual([]);
  });

  it('preserves first-occurrence order across lists', () => {
    const trending = ['a/one', 'b/two'];
    const tail = ['b/two', 'c/three', 'd/four'];
    expect(unionOrderedFullNames(trending, tail)).toEqual([
      'a/one',
      'b/two',
      'c/three',
      'd/four',
    ]);
  });

  it('case-insensitive dedupe', () => {
    expect(unionOrderedFullNames(['A/B'], ['a/b'])).toEqual(['A/B']);
  });

  it('skips empty/non-slash/non-string entries', () => {
    const out = unionOrderedFullNames(
      ['a/ok', '', 'noslash'],
      [null as unknown as string, 42 as unknown as string, 'b/ok'],
    );
    expect(out).toEqual(['a/ok', 'b/ok']);
  });

  it('trims surrounding whitespace', () => {
    expect(unionOrderedFullNames(['  a/ok  '])).toEqual(['a/ok']);
  });
});

describe('extractTrendingFullNames', () => {
  it('returns empty on null', () => {
    expect(extractTrendingFullNames(null)).toEqual([]);
  });

  it('returns empty on missing past_24_hours.All bucket', () => {
    expect(extractTrendingFullNames({ buckets: {} })).toEqual([]);
  });

  it('returns ordered fullNames from past_24_hours.All', () => {
    const trending = {
      buckets: {
        past_24_hours: {
          All: [
            { repo_name: 'a/one' },
            { repo_name: 'b/two' },
            { repo_name: 'noslash' },
            { repo_name: 'c/three' },
          ],
        },
      },
    };
    expect(extractTrendingFullNames(trending)).toEqual([
      'a/one',
      'b/two',
      'c/three',
    ]);
  });
});
