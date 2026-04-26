import { describe, it, expect } from 'vitest';
import {
  WEIGHTS,
  composite,
  computeStats,
  recencyDecay,
  zScore,
  type CompositeInput,
} from '../src/lib/score.js';

describe('recencyDecay', () => {
  it('returns 0 for null', () => {
    expect(recencyDecay(null)).toBe(0);
  });
  it('returns 1 for now-or-future', () => {
    expect(recencyDecay(new Date(Date.now() + 1000))).toBe(1);
  });
  it('halves at half-life', () => {
    const halfLife = new Date(Date.now() - 14 * 86_400_000);
    expect(recencyDecay(halfLife)).toBeCloseTo(0.5, 6);
  });
  it('quarters at 2x half-life', () => {
    const twoHalfLives = new Date(Date.now() - 28 * 86_400_000);
    expect(recencyDecay(twoHalfLives)).toBeCloseTo(0.25, 6);
  });
});

describe('zScore', () => {
  it('returns 0 when stddev is 0', () => {
    expect(zScore(5, 5, 0)).toBe(0);
  });
  it('returns 0 when stddev is non-finite', () => {
    expect(zScore(5, 5, Number.NaN)).toBe(0);
  });
  it('computes z normally', () => {
    expect(zScore(7, 5, 2)).toBe(1);
    expect(zScore(3, 5, 2)).toBe(-1);
  });
});

describe('computeStats', () => {
  it('handles empty array', () => {
    const s = computeStats([]);
    expect(s.n).toBe(0);
    expect(s.sd_d).toBe(0);
  });
  it('matches sample stddev (n-1 denom)', () => {
    const items: CompositeInput[] = [10, 20, 30, 40].map((d) => ({
      downloads_7d: d,
      velocity_delta_7d: 0,
      absolute_popularity: 0,
      last_modified: null,
      cross_source_count: 1,
    }));
    const s = computeStats(items);
    expect(s.n).toBe(4);
    expect(s.mu_d).toBe(25);
    expect(s.sd_d).toBeCloseTo(12.9099, 4);
  });
});

describe('composite', () => {
  it('returns recency+crossSource only when n<2', () => {
    const x: CompositeInput = {
      downloads_7d: 100,
      velocity_delta_7d: 50,
      absolute_popularity: 1000,
      last_modified: new Date(Date.now() - 14 * 86_400_000),
      cross_source_count: 1,
    };
    const score = composite(x, computeStats([x]));
    expect(score).toBeCloseTo(WEIGHTS.recency * 0.5 + WEIGHTS.crossSource * 1, 4);
  });

  it('weights sum to 1.00', () => {
    const sum = WEIGHTS.downloads + WEIGHTS.velocity + WEIGHTS.popularity + WEIGHTS.recency + WEIGHTS.crossSource;
    expect(sum).toBeCloseTo(1, 6);
  });

  it('produces stable scores for a 5-item batch', () => {
    const now = Date.now();
    const items: CompositeInput[] = [
      { downloads_7d: 1000, velocity_delta_7d: 100, absolute_popularity: 5000, last_modified: new Date(now - 1 * 86_400_000), cross_source_count: 3 },
      { downloads_7d: 800,  velocity_delta_7d: 80,  absolute_popularity: 4000, last_modified: new Date(now - 3 * 86_400_000), cross_source_count: 2 },
      { downloads_7d: 600,  velocity_delta_7d: 60,  absolute_popularity: 3000, last_modified: new Date(now - 7 * 86_400_000), cross_source_count: 1 },
      { downloads_7d: 400,  velocity_delta_7d: 40,  absolute_popularity: 2000, last_modified: new Date(now - 14 * 86_400_000), cross_source_count: 1 },
      { downloads_7d: 200,  velocity_delta_7d: 20,  absolute_popularity: 1000, last_modified: new Date(now - 30 * 86_400_000), cross_source_count: 1 },
    ];
    const stats = computeStats(items);
    const scores = items.map((i) => composite(i, stats));
    expect(scores[0]).toBeGreaterThan(scores[4]!);
    expect(scores).toHaveLength(5);
    for (const s of scores) expect(Number.isFinite(s)).toBe(true);
  });
});
