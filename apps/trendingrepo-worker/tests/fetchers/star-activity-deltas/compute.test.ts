import { describe, it, expect } from 'vitest';
import {
  computeWindowDelta,
  entryFromPayload,
  type SADeltaValue,
} from '../../../src/fetchers/star-activity-deltas/index.js';

const LATEST = '2026-05-29';

function dayStr(daysAgo: number): string {
  const ms = Date.parse(`${LATEST}T00:00:00Z`) - daysAgo * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Build an ascending-by-date series. `spec` maps daysAgo → cumulative stars.
function series(spec: Array<[number, number]>): Array<{ d: string; s: number }> {
  return spec
    .slice()
    .sort((a, b) => b[0] - a[0]) // oldest first (largest daysAgo first)
    .map(([daysAgo, s]) => ({ d: dayStr(daysAgo), s }));
}

// The app's display gate (src/lib/derived-repos.ts isRealDelta): a delta is
// "real" (shown, not "—") only when value !== null AND basis !== cold-start.
function isReal(v: SADeltaValue): boolean {
  return v.value !== null && v.basis !== 'cold-start';
}

describe('computeWindowDelta', () => {
  it('deep daily series → exact deltas for 24h/7d/30d', () => {
    // s = 1000 + (30 - daysAgo)*10  → +10 stars/day, latest (today) = 1300.
    const points = series(
      Array.from({ length: 31 }, (_, i) => [i, 1000 + (30 - i) * 10] as [number, number]),
    );
    const latest = points[points.length - 1];
    expect(latest.s).toBe(1300);

    const d24 = computeWindowDelta(points, latest, 1, 1);
    const d7 = computeWindowDelta(points, latest, 7, 2);
    const d30 = computeWindowDelta(points, latest, 30, 5);

    expect(d24).toMatchObject({ value: 10, basis: 'exact' });
    expect(d7).toMatchObject({ value: 70, basis: 'exact' });
    expect(d30).toMatchObject({ value: 300, basis: 'exact' });
    expect([d24, d7, d30].every(isReal)).toBe(true);
  });

  it('gappy series → nearest within tolerance, cold-start beyond', () => {
    // Points 8d / 4d / today ago.
    const points = series([
      [8, 100],
      [4, 160],
      [0, 200],
    ]);
    const latest = points[points.length - 1];

    // 7d target: nearest older point is 8d-ago (diff 1d ≤ tol 2) → nearest.
    const d7 = computeWindowDelta(points, latest, 7, 2);
    expect(d7).toMatchObject({ value: 100, basis: 'nearest', from_d: dayStr(8) });
    expect(isReal(d7)).toBe(true);

    // 24h target: nearest older point is 4d-ago (diff 3d > tol 1) → cold-start.
    const d24 = computeWindowDelta(points, latest, 1, 1);
    expect(d24.basis).toBe('cold-start');
    expect(d24.value).toBe(40);
    expect(isReal(d24)).toBe(false); // gated from display
  });

  it('shallow series (3 days) → 24h real but 7d/30d cold-start (honest "—")', () => {
    const points = series([
      [2, 500],
      [1, 520],
      [0, 535],
    ]);
    const latest = points[points.length - 1];

    const d24 = computeWindowDelta(points, latest, 1, 1);
    expect(d24).toMatchObject({ value: 15, basis: 'exact' });
    expect(isReal(d24)).toBe(true);

    const d7 = computeWindowDelta(points, latest, 7, 2);
    const d30 = computeWindowDelta(points, latest, 30, 5);
    expect(d7.basis).toBe('cold-start');
    expect(d30.basis).toBe('cold-start');
    expect(isReal(d7)).toBe(false);
    expect(isReal(d30)).toBe(false);
  });

  it('single point → no-history (cannot diff)', () => {
    const points = series([[0, 999]]);
    const latest = points[points.length - 1];
    expect(computeWindowDelta(points, latest, 1, 1)).toEqual({
      value: null,
      basis: 'no-history',
    });
  });
});

describe('entryFromPayload', () => {
  it('returns null when fewer than 2 points', () => {
    expect(entryFromPayload(null)).toBeNull();
    expect(entryFromPayload({ points: [] })).toBeNull();
    expect(entryFromPayload({ points: [{ d: LATEST, s: 10 }] })).toBeNull();
  });

  it('builds stars_now + all three windows from the latest point', () => {
    const points = series(
      Array.from({ length: 31 }, (_, i) => [i, 1000 + (30 - i) * 10] as [number, number]),
    );
    const entry = entryFromPayload({ points });
    expect(entry).not.toBeNull();
    expect(entry!.stars_now).toBe(1300);
    expect(entry!.latest_d).toBe(LATEST);
    expect(entry!.delta_24h.value).toBe(10);
    expect(entry!.delta_7d.value).toBe(70);
    expect(entry!.delta_30d.value).toBe(300);
  });
});
