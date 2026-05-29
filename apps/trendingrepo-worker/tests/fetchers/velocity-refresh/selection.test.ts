import { describe, it, expect } from 'vitest';
import {
  pickTopByVelocity,
  mergeDeltaRepos,
  computeCoverage,
} from '../../../src/fetchers/velocity-refresh/index.js';
import type {
  SADeltaBasis,
  SADeltaEntry,
  StarActivityDeltasPayload,
} from '../../../src/fetchers/star-activity-deltas/index.js';

function entry(starsNow: number, v24: number | null): SADeltaEntry {
  const mk = (value: number | null) => ({
    value,
    basis: (value === null ? 'no-history' : 'exact') as SADeltaBasis,
  });
  return {
    stars_now: starsNow,
    latest_d: '2026-05-29',
    delta_24h: mk(v24),
    delta_7d: mk(v24),
    delta_30d: mk(v24),
  };
}

function payload(repos: Record<string, SADeltaEntry>): StarActivityDeltasPayload {
  return {
    computedAt: '2026-05-29T00:00:00Z',
    coverage: { exact: 0, nearest: 0, 'cold-start': 0, 'no-history': 0 },
    repos,
  };
}

describe('pickTopByVelocity', () => {
  it('orders by current 24h velocity desc and caps at topN', () => {
    const deltas = payload({
      'a/a': entry(100, 5),
      'b/b': entry(100, 50),
      'c/c': entry(100, 20),
    });
    expect(pickTopByVelocity(deltas, null, 2)).toEqual(['b/b', 'c/c']);
  });

  it('breaks velocity ties by fullName ascending (deterministic)', () => {
    const deltas = payload({ 'z/z': entry(1, 10), 'a/a': entry(1, 10) });
    expect(pickTopByVelocity(deltas, null, 2)).toEqual(['a/a', 'z/z']);
  });

  it('excludes entries with a null 24h value from the velocity ranking', () => {
    const deltas = payload({ 'a/a': entry(1, null), 'b/b': entry(1, 3) });
    // With no registry top-up, only the repo with a numeric 24h ranks.
    expect(pickTopByVelocity(deltas, null, 5)).toEqual(['b/b']);
  });

  it('tops up from the registry (lowercased) when the deltas slug is thin', () => {
    const deltas = payload({ 'a/a': entry(1, 10) });
    const registry = {
      repos: { x: { fullName: 'New/Repo', lastSeenAt: '2026-05-29T00:00:00Z' } },
    };
    const out = pickTopByVelocity(deltas, registry, 3);
    expect(out[0]).toBe('a/a');
    expect(out).toContain('new/repo');
  });
});

describe('mergeDeltaRepos', () => {
  it('overlays fresh entries and preserves untouched ones', () => {
    const existing = { 'a/a': entry(10, 1), 'b/b': entry(20, 2) };
    const fresh = { 'a/a': entry(99, 9) };
    const merged = mergeDeltaRepos(existing, fresh);
    expect(merged['a/a'].stars_now).toBe(99);
    expect(merged['b/b'].stars_now).toBe(20);
    expect(Object.keys(merged).sort()).toEqual(['a/a', 'b/b']);
  });
});

describe('computeCoverage', () => {
  it('counts all three windows per repo by basis', () => {
    const cov = computeCoverage({ 'a/a': entry(10, 5), 'b/b': entry(10, null) });
    expect(cov.exact).toBe(3); // a/a: 24h+7d+30d all exact
    expect(cov['no-history']).toBe(3); // b/b: all three null
  });
});
