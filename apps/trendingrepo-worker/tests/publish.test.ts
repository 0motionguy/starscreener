import { describe, it, expect } from 'vitest';
import { TRENDING_ITEM_TYPES } from '../src/lib/types.js';

describe('TRENDING_ITEM_TYPES', () => {
  it('is non-empty, all entries are strings, and contains no duplicates', () => {
    expect(TRENDING_ITEM_TYPES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(TRENDING_ITEM_TYPES).size).toBe(TRENDING_ITEM_TYPES.length);
    for (const t of TRENDING_ITEM_TYPES) expect(typeof t).toBe('string');
  });

  it('includes the foundational kinds we always ship', () => {
    // These were the v1 types; refactors can add more (e.g. 'paper') but
    // never silently drop one of the founding seven.
    for (const t of ['skill', 'mcp', 'hf_model', 'hf_dataset', 'hf_space', 'repo', 'idea']) {
      expect(TRENDING_ITEM_TYPES).toContain(t);
    }
  });
});

describe.skip('publishLeaderboard (integration)', () => {
  it.todo('writes denormalized JSON to ss:data:v1:trending:<type>');
  it.todo('returns redisPublished=false when DATA_STORE_DISABLE=1');
});
