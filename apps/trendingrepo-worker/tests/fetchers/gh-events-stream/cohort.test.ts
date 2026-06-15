import { describe, expect, it } from 'vitest';
import { deriveCohort } from '../../../src/fetchers/gh-events-stream/index.js';

describe('deriveCohort', () => {
  it('returns engagement-composite items in order when present, capped at target', () => {
    const engagement = {
      items: [
        { fullName: 'a/one', rank: 1 },
        { fullName: 'b/two', rank: 2 },
        { fullName: 'c/three', rank: 3 },
      ],
    };
    const cohort = deriveCohort(engagement, null, 2);
    expect(cohort).toEqual(['a/one', 'b/two']);
  });

  it('falls back to repo-metadata sorted by stars desc when engagement-composite is empty', () => {
    const repoMetadata = {
      items: [
        { fullName: 'low/stars', stars: 100 },
        { fullName: 'high/stars', stars: 50_000 },
        { fullName: 'mid/stars', stars: 5_000 },
      ],
    };
    const cohort = deriveCohort(null, repoMetadata, 3);
    expect(cohort).toEqual(['high/stars', 'mid/stars', 'low/stars']);
  });

  it('merges engagement first, then top-stars repo-metadata for the tail (dedup by lowercase)', () => {
    const engagement = { items: [{ fullName: 'A/one' }] };
    const repoMetadata = {
      items: [
        { fullName: 'a/one', stars: 99 }, // dupe — must be skipped (case-insensitive)
        { fullName: 'b/two', stars: 500 },
      ],
    };
    const cohort = deriveCohort(engagement, repoMetadata, 5);
    expect(cohort).toEqual(['A/one', 'b/two']);
  });

  it('rejects entries with missing or malformed fullName', () => {
    const engagement = {
      items: [
        { fullName: 'good/one' },
        { fullName: 'nope' }, // no slash
        { fullName: '' }, // empty
        { fullName: 42 as unknown as string }, // wrong type
        {}, // missing
        { fullName: 'b/two' },
      ],
    };
    const cohort = deriveCohort(engagement, null, 10);
    expect(cohort).toEqual(['good/one', 'b/two']);
  });

  it('returns an empty list when both sources are empty', () => {
    expect(deriveCohort(null, null, 100)).toEqual([]);
    expect(deriveCohort({ items: [] }, { items: [] }, 100)).toEqual([]);
  });

  it('respects target cap even when more candidates exist', () => {
    const engagement = {
      items: Array.from({ length: 500 }, (_, i) => ({
        fullName: `owner/${i}`,
      })),
    };
    const cohort = deriveCohort(engagement, null, 200);
    expect(cohort).toHaveLength(200);
    expect(cohort[0]).toBe('owner/0');
    expect(cohort[199]).toBe('owner/199');
  });
});
