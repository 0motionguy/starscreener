// Unit tests for the twitter tier picker. The pure ranker + tier slicing
// are easy to exercise without infra; pickHotRepos / pickWarmRepos /
// pickColdRepos hit readDataStore + loadTrackedRepos so they're integration-
// shaped — we cover them at the deploy-time SCARD-growth proof.

import { describe, expect, it } from 'vitest';

import { rankByVelocity } from '../_picker.js';

describe('rankByVelocity', () => {
  it('sorts by delta_24h.value descending', () => {
    const ranked = rankByVelocity({
      repos: {
        'low/repo': { delta_24h: { value: 5 } },
        'high/repo': { delta_24h: { value: 100 } },
        'mid/repo': { delta_24h: { value: 50 } },
      },
    });
    expect(ranked.map((r) => r.fullName)).toEqual([
      'high/repo',
      'mid/repo',
      'low/repo',
    ]);
  });

  it('breaks ties on delta_7d.value descending', () => {
    const ranked = rankByVelocity({
      repos: {
        'a/repo': { delta_24h: { value: 10 }, delta_7d: { value: 50 } },
        'b/repo': { delta_24h: { value: 10 }, delta_7d: { value: 200 } },
        'c/repo': { delta_24h: { value: 10 }, delta_7d: { value: 100 } },
      },
    });
    expect(ranked.map((r) => r.fullName)).toEqual([
      'b/repo',
      'c/repo',
      'a/repo',
    ]);
  });

  it('breaks 24h+7d ties on fullName case-insensitive ascending (determinism)', () => {
    const ranked = rankByVelocity({
      repos: {
        'Z/zenith': { delta_24h: { value: 1 }, delta_7d: { value: 1 } },
        'a/alpha': { delta_24h: { value: 1 }, delta_7d: { value: 1 } },
        'M/middle': { delta_24h: { value: 1 }, delta_7d: { value: 1 } },
      },
    });
    expect(ranked.map((r) => r.fullName)).toEqual([
      'a/alpha',
      'M/middle',
      'Z/zenith',
    ]);
  });

  it('treats missing delta fields as 0 (sorted last)', () => {
    const ranked = rankByVelocity({
      repos: {
        'has/value': { delta_24h: { value: 7 } },
        'no/delta': {},
        'partial/d': { delta_24h: {} as { value?: number } },
      },
    });
    expect(ranked[0]?.fullName).toBe('has/value');
    // The other two tie at 0 — order is fullName ASC
    expect(ranked.slice(1).map((r) => r.fullName)).toEqual(['no/delta', 'partial/d']);
  });

  it('skips entries without owner/name shape', () => {
    const ranked = rankByVelocity({
      repos: {
        'good/repo': { delta_24h: { value: 1 } },
        'bad-no-slash': { delta_24h: { value: 999 } },
        '': { delta_24h: { value: 100 } },
      },
    });
    expect(ranked.map((r) => r.fullName)).toEqual(['good/repo']);
  });

  it('returns [] for null / empty payload', () => {
    expect(rankByVelocity(null)).toEqual([]);
    expect(rankByVelocity(undefined)).toEqual([]);
    expect(rankByVelocity({})).toEqual([]);
    expect(rankByVelocity({ repos: {} })).toEqual([]);
  });

  it('coerces non-numeric delta values to 0 defensively', () => {
    const ranked = rankByVelocity({
      repos: {
        // @ts-expect-error — string instead of number
        'corrupt/repo': { delta_24h: { value: 'not-a-number' } },
        'clean/repo': { delta_24h: { value: 5 } },
      },
    });
    expect(ranked[0]?.fullName).toBe('clean/repo');
    expect(ranked[1]?.d24).toBe(0);
  });
});
