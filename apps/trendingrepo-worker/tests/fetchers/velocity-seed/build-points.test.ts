import { describe, it, expect } from 'vitest';
import { buildRecentPoints } from '../../../src/fetchers/velocity-seed/index.js';

describe('buildRecentPoints', () => {
  it('builds cumulative end-of-day counts descending from the current total', () => {
    // Current total 100; +5 on the 28th, +10 on the 29th (today).
    const perDay = new Map([
      ['2026-05-28', 5],
      ['2026-05-29', 10],
    ]);
    const pts = buildRecentPoints(perDay, 100, new Date('2026-05-29T12:00:00Z'));
    // End of 29th = 100 (current); end of 28th = 100 - 10 = 90.
    expect(pts).toEqual([
      { d: '2026-05-28', s: 90, delta: 5 },
      { d: '2026-05-29', s: 100, delta: 10 },
    ]);
  });

  it('appends a today anchor when the latest bucketed day is older than today', () => {
    // Only the 20th has new stars; nothing since → the count has been flat.
    const perDay = new Map([['2026-05-20', 3]]);
    const pts = buildRecentPoints(perDay, 50, new Date('2026-05-29T00:00:00Z'));
    expect(pts[0]).toEqual({ d: '2026-05-20', s: 50, delta: 3 });
    expect(pts[pts.length - 1]).toEqual({ d: '2026-05-29', s: 50, delta: 0 });
  });

  it('returns a single today anchor for an empty walk', () => {
    const pts = buildRecentPoints(new Map(), 42, new Date('2026-05-29T00:00:00Z'));
    expect(pts).toEqual([{ d: '2026-05-29', s: 42, delta: 0 }]);
  });
});
