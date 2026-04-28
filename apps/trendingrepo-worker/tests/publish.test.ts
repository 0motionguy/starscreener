import { describe, it, expect } from 'vitest';
import { TRENDING_ITEM_TYPES } from '../src/lib/types.js';

describe('TRENDING_ITEM_TYPES', () => {
  it('lists all 7 types', () => {
    expect(TRENDING_ITEM_TYPES).toHaveLength(7);
    expect(new Set(TRENDING_ITEM_TYPES).size).toBe(7);
  });
});

describe.skip('publishLeaderboard (integration)', () => {
  it.todo('writes denormalized JSON to ss:data:v1:trending:<type>');
  it.todo('returns redisPublished=false when DATA_STORE_DISABLE=1');
});
