import { describe, expect, it } from 'vitest';
import {
  chunk,
  buildBatchQuery,
  parseRepoNode,
  reconstructDenseSeries,
  seriesCoversWindow,
} from '../index.js';
import { entryFromPayload } from '../../star-activity-deltas/index.js';

const NOW = new Date('2026-05-29T12:00:00.000Z');
const ms = (iso: string): number => Date.parse(iso);

describe('chunk', () => {
  it('splits into fixed-size groups, last may be short', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('buildBatchQuery', () => {
  it('aliases each repo and embeds the stargazer fragment', () => {
    const q = buildBatchQuery(['vercel/next.js', 'facebook/react']);
    expect(q).toContain('r0: repository(owner: "vercel", name: "next.js")');
    expect(q).toContain('r1: repository(owner: "facebook", name: "react")');
    expect(q).toContain('fragment SG on Repository');
    expect(q).toContain('orderBy: {field: STARRED_AT, direction: ASC}');
  });

  it('skips malformed fullNames (no slash)', () => {
    const q = buildBatchQuery(['owneronly']);
    expect(q).not.toContain('r0: repository');
  });
});

describe('parseRepoNode', () => {
  it('normalizes a node, sorting timestamps ascending', () => {
    const parsed = parseRepoNode({
      stargazerCount: 5699,
      stargazers: {
        totalCount: 5699,
        pageInfo: { hasPreviousPage: true, startCursor: 'CUR' },
        edges: [
          { starredAt: '2026-05-29T09:00:00Z' },
          { starredAt: '2026-05-26T04:00:00Z' },
        ],
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.total).toBe(5699);
    expect(parsed!.hasPreviousPage).toBe(true);
    expect(parsed!.startCursor).toBe('CUR');
    expect(parsed!.starredAtMs[0]).toBe(ms('2026-05-26T04:00:00Z'));
    expect(parsed!.starredAtMs[1]).toBe(ms('2026-05-29T09:00:00Z'));
  });

  it('returns null for a null node (deleted/renamed repo alias)', () => {
    expect(parseRepoNode(null)).toBeNull();
    expect(parseRepoNode({})).toBeNull();
  });
});

describe('seriesCoversWindow', () => {
  const cutoff = '2026-04-24';
  it('true when a point is at/older than the window floor (skip deep walk)', () => {
    expect(seriesCoversWindow([{ d: '2026-03-01' }, { d: '2026-05-29' }], cutoff)).toBe(true);
    expect(seriesCoversWindow([{ d: cutoff }], cutoff)).toBe(true); // boundary inclusive
  });
  it('false when all points are newer than the floor (must page back)', () => {
    expect(seriesCoversWindow([{ d: '2026-05-27' }, { d: '2026-05-29' }], cutoff)).toBe(false);
    expect(seriesCoversWindow([], cutoff)).toBe(false);
    expect(seriesCoversWindow(null, cutoff)).toBe(false);
  });
});

describe('reconstructDenseSeries → entryFromPayload', () => {
  it('slow covered repo: exact 24h/7d/30d window deltas', () => {
    // total 6, all stars collected (covered). 1 star pre-window, then exact
    // anchors at the 24h/7d/30d targets.
    const timestamps = [
      ms('2026-03-01T00:00:00Z'), // before window → becomes the floor (s=1)
      ms('2026-04-29T00:00:00Z'), // 30d target
      ms('2026-05-22T00:00:00Z'), // 7d target
      ms('2026-05-28T00:00:00Z'), // 24h target
      ms('2026-05-29T08:00:00Z'),
      ms('2026-05-29T09:00:00Z'),
    ];
    const points = reconstructDenseSeries({
      timestamps,
      total: 6,
      coveredFirstStar: true,
      recentDays: 35,
      now: NOW,
    });
    const entry = entryFromPayload({
      points,
      backfillSource: 'stargazer-api',
      coversFirstStar: true,
    });
    expect(entry).not.toBeNull();
    expect(entry!.stars_now).toBe(6);
    expect(entry!.delta_24h.value).toBe(2);
    expect(entry!.delta_7d.value).toBe(3);
    expect(entry!.delta_30d.value).toBe(4);
    expect(entry!.delta_30d.basis).toBe('exact');
  });

  it('young viral covered repo: 30d delta == full count (0 before inception)', () => {
    const timestamps = [
      ...Array(10).fill(ms('2026-05-24T00:00:00Z')),
      ...Array(15).fill(ms('2026-05-26T00:00:00Z')),
      ...Array(25).fill(ms('2026-05-29T00:00:00Z')),
    ];
    const points = reconstructDenseSeries({
      timestamps,
      total: 50,
      coveredFirstStar: true,
      recentDays: 35,
      now: NOW,
    });
    const entry = entryFromPayload({
      points,
      backfillSource: 'stargazer-api',
      coversFirstStar: true,
    });
    expect(entry!.stars_now).toBe(50);
    expect(entry!.delta_30d.value).toBe(50); // gained all 50 inside 30d
    expect(entry!.delta_7d.value).toBe(50);
    expect(entry!.delta_24h.value).toBe(25); // 25 of them today
  });

  it('hot uncovered repo: 24h exact, 7d/30d gated to cold-start lower bound', () => {
    // 100 most-recent stars span only 3 days; we did NOT reach the first star.
    const timestamps = [
      ...Array(25).fill(ms('2026-05-27T00:00:00Z')),
      ...Array(35).fill(ms('2026-05-28T00:00:00Z')),
      ...Array(40).fill(ms('2026-05-29T00:00:00Z')),
    ];
    const points = reconstructDenseSeries({
      timestamps,
      total: 5000,
      coveredFirstStar: false,
      recentDays: 35,
      now: NOW,
    });
    const entry = entryFromPayload({
      points,
      backfillSource: 'snapshot-only',
      coversFirstStar: false,
    });
    expect(entry!.stars_now).toBe(5000);
    expect(entry!.delta_24h.basis).toBe('exact');
    expect(entry!.delta_24h.value).toBe(40);
    // 7d/30d can't be reached from a 3-day window → honest lower bound, gated.
    expect(entry!.delta_7d.basis).toBe('cold-start');
    expect(entry!.delta_7d.value).toBe(75);
    expect(entry!.delta_30d.basis).toBe('cold-start');
  });

  it('floors at the window start when covered (does not invent pre-window stars)', () => {
    const points = reconstructDenseSeries({
      timestamps: [ms('2026-05-29T00:00:00Z')],
      total: 1,
      coveredFirstStar: true,
      recentDays: 35,
      now: NOW,
    });
    // Dense series spans cutoff..today; first point is the window floor.
    expect(points[0]!.d).toBe('2026-04-24');
    expect(points[points.length - 1]!.d).toBe('2026-05-29');
    expect(points[points.length - 1]!.s).toBe(1);
  });
});
