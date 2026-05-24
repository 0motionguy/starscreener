import { describe, it, expect } from 'vitest';
import { TRENDING_ITEM_TYPES } from '../src/lib/types.js';

describe('TRENDING_ITEM_TYPES', () => {
  it('is non-empty, all entries are strings, and contains no duplicates', () => {
    expect(TRENDING_ITEM_TYPES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(TRENDING_ITEM_TYPES).size).toBe(TRENDING_ITEM_TYPES.length);
    for (const t of TRENDING_ITEM_TYPES) expect(typeof t).toBe('string');
  });

  it('includes the foundational kinds we ship post-2026-05-24 refocus', () => {
    // skills / mcp / hf_* dropped 2026-05-24 (operator refocus to GitHub repos
    // only; the LLMs surface is backed by Artificial Analysis, not HF).
    for (const t of ['repo', 'idea', 'post', 'paper']) {
      expect(TRENDING_ITEM_TYPES).toContain(t);
    }
  });
});

describe.skip('publishLeaderboard (integration)', () => {
  it.todo('writes denormalized JSON to ss:data:v1:trending:<type>');
  it.todo('returns redisPublished=false when DATA_STORE_DISABLE=1');
});
