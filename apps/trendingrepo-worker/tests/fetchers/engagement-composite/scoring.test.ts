import { describe, it, expect } from 'vitest';
import {
  WEIGHTS,
  buildCohortContext,
  composeScore,
  logNormalize,
  normalizeOne,
  percentileRank,
  scoreCohort,
} from '../../../src/fetchers/engagement-composite/scoring.js';
import {
  COMPONENT_KEYS,
  type ComponentKey,
  type ComponentScore,
  type NormalizedRepoSignals,
} from '../../../src/fetchers/engagement-composite/types.js';

function emptyComponents(): Record<ComponentKey, ComponentScore> {
  const out = {} as Record<ComponentKey, ComponentScore>;
  for (const key of COMPONENT_KEYS) out[key] = { raw: 0, normalized: 0 };
  return out;
}

function makeRow(fullName: string, overrides: Partial<NormalizedRepoSignals> = {}): NormalizedRepoSignals {
  return {
    fullName,
    hn: 0,
    reddit: 0,
    bluesky: 0,
    devto: 0,
    npm: 0,
    ghStars: 0,
    ph: 0,
    ...overrides,
  };
}

describe('WEIGHTS', () => {
  it('sums to exactly 1.00 (invariant — protects the composite contract)', () => {
    let sum = 0;
    for (const key of COMPONENT_KEYS) sum += WEIGHTS[key];
    expect(sum).toBeCloseTo(1, 6);
  });

  it('has a weight defined for every component key', () => {
    for (const key of COMPONENT_KEYS) {
      expect(WEIGHTS[key]).toBeGreaterThanOrEqual(0);
      expect(WEIGHTS[key]).toBeLessThanOrEqual(1);
    }
  });
});

describe('percentileRank', () => {
  it('returns 0 for an empty cohort', () => {
    expect(percentileRank(10, [])).toBe(0);
  });
  it('returns 0.5 for a singleton cohort regardless of value', () => {
    expect(percentileRank(10, [10])).toBe(0.5);
  });
  it('places the smallest value below the largest', () => {
    const sorted = [1, 2, 3, 4, 5];
    const lo = percentileRank(1, sorted);
    const hi = percentileRank(5, sorted);
    expect(lo).toBeLessThan(hi);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
  });
  it('handles duplicates with mid-rank tiebreak', () => {
    // [1, 5, 5, 5, 9] — for value=5: lower=1, equal=3 → (1+1.5)/5 = 0.5
    expect(percentileRank(5, [1, 5, 5, 5, 9])).toBeCloseTo(0.5, 6);
  });
  it('returns 0 for a value below the cohort minimum', () => {
    expect(percentileRank(0, [1, 2, 3])).toBe(0);
  });
});

describe('logNormalize', () => {
  it('returns 0 for non-positive value or non-positive max', () => {
    expect(logNormalize(0, 100)).toBe(0);
    expect(logNormalize(-5, 100)).toBe(0);
    expect(logNormalize(50, 0)).toBe(0);
    expect(logNormalize(50, -1)).toBe(0);
  });
  it('returns ~1 when value equals max', () => {
    expect(logNormalize(1000, 1000)).toBeCloseTo(1, 6);
  });
  it('compresses heavy-tailed distributions', () => {
    // 1M downloads vs 10 downloads — log10(1e6+1)/log10(1e6+1) = 1
    // log10(11)/log10(1e6+1) ~= 1.04 / 6.0 ~= 0.17, NOT 1e-5.
    const top = logNormalize(1_000_000, 1_000_000);
    const tail = logNormalize(10, 1_000_000);
    expect(top).toBeCloseTo(1, 6);
    expect(tail).toBeGreaterThan(0.1);
    expect(tail).toBeLessThan(0.3);
  });
});

describe('normalizeOne', () => {
  const sortedValues = [10, 20, 30, 40, 50];
  const ctx = { sortedValues, max: 50 };

  it('collapses raw=0 to normalized=0 for every component', () => {
    for (const key of COMPONENT_KEYS) {
      expect(normalizeOne(key, 0, ctx)).toBe(0);
    }
  });

  it('clamps to [0,1]', () => {
    const v = normalizeOne('hn', 100, { sortedValues, max: 50 });
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('uses log normalization for npm and ghStars', () => {
    const npm = normalizeOne('npm', 50, { sortedValues: [], max: 50 });
    expect(npm).toBeCloseTo(1, 6);
    const ghStars = normalizeOne('ghStars', 50, { sortedValues: [], max: 50 });
    expect(ghStars).toBeCloseTo(1, 6);
  });

  it('uses percentile normalization for hn/reddit/bluesky/devto/ph', () => {
    for (const key of ['hn', 'reddit', 'bluesky', 'devto', 'ph'] as ComponentKey[]) {
      const v = normalizeOne(key, 30, ctx);
      // 30 is the median of [10,20,30,40,50] → percentileRank=0.5
      expect(v).toBeCloseTo(0.5, 6);
    }
  });
});

describe('buildCohortContext', () => {
  it('excludes zeros from the sorted positives array', () => {
    const rows: NormalizedRepoSignals[] = [
      makeRow('a/a', { hn: 0, reddit: 0 }),
      makeRow('b/b', { hn: 5, reddit: 10 }),
      makeRow('c/c', { hn: 0, reddit: 0 }),
    ];
    const ctx = buildCohortContext(rows);
    expect(ctx.hn.sortedValues).toEqual([5]);
    expect(ctx.reddit.sortedValues).toEqual([10]);
    expect(ctx.hn.max).toBe(5);
    expect(ctx.reddit.max).toBe(10);
  });

  it('handles an empty cohort without throwing', () => {
    const ctx = buildCohortContext([]);
    for (const key of COMPONENT_KEYS) {
      expect(ctx[key].sortedValues).toEqual([]);
      expect(ctx[key].max).toBe(0);
    }
  });
});

describe('composeScore', () => {
  it('returns 0 for all-zero components', () => {
    expect(composeScore(emptyComponents())).toBe(0);
  });

  it('returns 100 for all-one normalized components (invariant)', () => {
    const comps = emptyComponents();
    for (const key of COMPONENT_KEYS) comps[key] = { raw: 1, normalized: 1 };
    expect(composeScore(comps)).toBe(100);
  });

  it('clamps and rounds to 1 decimal', () => {
    const comps = emptyComponents();
    comps.hn = { raw: 100, normalized: 0.5 };
    // Only hn contributes (weight 0.20 * 0.5 = 0.10) → 10.0
    expect(composeScore(comps)).toBe(10);
  });
});

describe('scoreCohort', () => {
  it('returns empty array for empty input', () => {
    expect(scoreCohort([])).toEqual([]);
  });

  it('produces 1-based ranks sorted by score desc', () => {
    const rows: NormalizedRepoSignals[] = [
      makeRow('low/low', { hn: 1, ghStars: 1 }),
      makeRow('mid/mid', { hn: 50, ghStars: 50 }),
      makeRow('high/high', { hn: 100, ghStars: 100 }),
    ];
    const items = scoreCohort(rows);
    expect(items).toHaveLength(3);
    expect(items[0]!.fullName).toBe('high/high');
    expect(items[0]!.rank).toBe(1);
    expect(items[2]!.fullName).toBe('low/low');
    expect(items[2]!.rank).toBe(3);
    expect(items[0]!.compositeScore).toBeGreaterThan(items[2]!.compositeScore);
  });

  it('breaks ties by fullName ascending (deterministic on cold cohorts)', () => {
    const rows: NormalizedRepoSignals[] = [
      makeRow('zebra/zebra'),
      makeRow('alpha/alpha'),
      makeRow('mango/mango'),
    ];
    const items = scoreCohort(rows);
    // All scores are 0 — order should be alpha, mango, zebra.
    expect(items.map((i) => i.fullName)).toEqual([
      'alpha/alpha',
      'mango/mango',
      'zebra/zebra',
    ]);
  });

  it('caps results at topLimit', () => {
    const rows: NormalizedRepoSignals[] = Array.from({ length: 50 }, (_, i) =>
      makeRow(`repo${i}/repo${i}`, { hn: i + 1 }),
    );
    const items = scoreCohort(rows, 10);
    expect(items).toHaveLength(10);
    // The top one should be the largest hn score (49+1=50) which is repo49.
    expect(items[0]!.fullName).toBe('repo49/repo49');
  });

  it('emits the full component breakdown per item', () => {
    const rows: NormalizedRepoSignals[] = [
      makeRow('a/a', { hn: 10, reddit: 20, bluesky: 5, devto: 3, npm: 1000, ghStars: 50, ph: 7 }),
    ];
    const items = scoreCohort(rows);
    expect(items[0]!.components.hn.raw).toBe(10);
    expect(items[0]!.components.reddit.raw).toBe(20);
    expect(items[0]!.components.bluesky.raw).toBe(5);
    expect(items[0]!.components.devto.raw).toBe(3);
    expect(items[0]!.components.npm.raw).toBe(1000);
    expect(items[0]!.components.ghStars.raw).toBe(50);
    expect(items[0]!.components.ph.raw).toBe(7);
    for (const key of COMPONENT_KEYS) {
      expect(items[0]!.components[key].normalized).toBeGreaterThanOrEqual(0);
      expect(items[0]!.components[key].normalized).toBeLessThanOrEqual(1);
    }
  });

  it('yields a finite, in-range composite score for a realistic batch', () => {
    const rows: NormalizedRepoSignals[] = [
      makeRow('vercel/next.js', {
        hn: 250, reddit: 800, bluesky: 50, devto: 40,
        npm: 5_000_000, ghStars: 1200, ph: 800,
      }),
      makeRow('foo/bar', {
        hn: 5, reddit: 20, bluesky: 0, devto: 0,
        npm: 100, ghStars: 5, ph: 0,
      }),
      makeRow('cold/repo'),
    ];
    const items = scoreCohort(rows);
    for (const item of items) {
      expect(Number.isFinite(item.compositeScore)).toBe(true);
      expect(item.compositeScore).toBeGreaterThanOrEqual(0);
      expect(item.compositeScore).toBeLessThanOrEqual(100);
    }
    // Rounding to 1 decimal contract.
    for (const item of items) {
      expect(item.compositeScore * 10).toBeCloseTo(Math.round(item.compositeScore * 10), 6);
    }
  });

  it('repos with all-zero signals receive compositeScore=0 (not NaN)', () => {
    const rows: NormalizedRepoSignals[] = [
      makeRow('warm/warm', { hn: 100, ghStars: 50 }),
      makeRow('cold/cold'),
    ];
    const items = scoreCohort(rows);
    const cold = items.find((i) => i.fullName === 'cold/cold');
    expect(cold).toBeDefined();
    expect(cold!.compositeScore).toBe(0);
  });
});
