import { describe, expect, it } from 'vitest';
import {
  CATEGORY_BRIEFS,
  CHUNK_SIZE,
  VALID_CATEGORY_IDS,
} from '../types.js';

describe('category-classify types', () => {
  it('VALID_CATEGORY_IDS has exactly 32 entries (post-C-CAT)', () => {
    expect(VALID_CATEGORY_IDS).toHaveLength(32);
  });

  it('CATEGORY_BRIEFS has a one-line description for every id', () => {
    for (const id of VALID_CATEGORY_IDS) {
      expect(CATEGORY_BRIEFS[id]).toBeDefined();
      expect(CATEGORY_BRIEFS[id].length).toBeGreaterThan(20);
    }
  });

  it('VALID_CATEGORY_IDS has no duplicates', () => {
    const set = new Set(VALID_CATEGORY_IDS);
    expect(set.size).toBe(VALID_CATEGORY_IDS.length);
  });

  it('CHUNK_SIZE keeps the LLM prompt small (≤25 repos per call)', () => {
    expect(CHUNK_SIZE).toBeLessThanOrEqual(25);
    expect(CHUNK_SIZE).toBeGreaterThan(0);
  });
});
