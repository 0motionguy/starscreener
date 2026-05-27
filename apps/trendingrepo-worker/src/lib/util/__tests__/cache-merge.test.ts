import { describe, expect, it } from 'vitest';
import {
  caseInsensitiveKey,
  mergeAndCap,
  shouldPreserveCache,
} from '../cache-merge.js';

interface Row {
  fullName: string;
  stars: number;
  createdAt: string;
}

const byCreatedDescStarsDesc = (a: Row, b: Row): number => {
  const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (delta !== 0) return delta;
  return b.stars - a.stars;
};

function row(fullName: string, stars = 10, createdAt = '2026-05-01T00:00:00.000Z'): Row {
  return { fullName, stars, createdAt };
}

describe('mergeAndCap', () => {
  it('returns empty when both inputs are empty', () => {
    expect(
      mergeAndCap<Row>({
        existing: [],
        fresh: [],
        key: caseInsensitiveKey('fullName'),
        compare: byCreatedDescStarsDesc,
        max: 50,
      }),
    ).toEqual([]);
  });

  it('preserves existing when fresh is empty (the zero-write-fix path)', () => {
    const existing = [row('a/keep', 50), row('b/keep', 25)];
    expect(
      mergeAndCap<Row>({
        existing,
        fresh: [],
        key: caseInsensitiveKey('fullName'),
        compare: byCreatedDescStarsDesc,
        max: 50,
      }).map((r) => r.fullName),
    ).toEqual(['a/keep', 'b/keep']);
  });

  it('overlays fresh on existing (fresh wins on collision)', () => {
    const existing = [row('a/dup', 5), row('b/old', 10)];
    const fresh = [row('a/dup', 99), row('c/new', 20)];
    const out = mergeAndCap<Row>({
      existing,
      fresh,
      key: caseInsensitiveKey('fullName'),
      compare: byCreatedDescStarsDesc,
      max: 50,
    });
    expect(out).toHaveLength(3);
    expect(out.find((r) => r.fullName === 'a/dup')?.stars).toBe(99);
  });

  it('caps by sort order (newest first)', () => {
    const fresh = [
      row('a/old', 100, '2026-04-01T00:00:00.000Z'),
      row('b/new', 50, '2026-05-15T00:00:00.000Z'),
      row('c/mid', 75, '2026-05-01T00:00:00.000Z'),
    ];
    const out = mergeAndCap<Row>({
      existing: [],
      fresh,
      key: caseInsensitiveKey('fullName'),
      compare: byCreatedDescStarsDesc,
      max: 2,
    });
    expect(out.map((r) => r.fullName)).toEqual(['b/new', 'c/mid']);
  });

  it('case-insensitive dedupe via caseInsensitiveKey', () => {
    const out = mergeAndCap<Row>({
      existing: [row('A/B', 10)],
      fresh: [row('a/b', 99)],
      key: caseInsensitiveKey('fullName'),
      compare: byCreatedDescStarsDesc,
      max: 50,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.stars).toBe(99);
  });

  it('drops rows where the key extractor returns falsy', () => {
    const out = mergeAndCap<Row>({
      existing: [row('', 1)],
      fresh: [row('a/ok', 1)],
      key: caseInsensitiveKey('fullName'),
      compare: byCreatedDescStarsDesc,
      max: 50,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.fullName).toBe('a/ok');
  });

  it('respects max < merged size (no negative slice surprises)', () => {
    const existing = Array.from({ length: 10 }, (_, i) =>
      row(`prior/r${i}`, 1, `2026-04-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z`),
    );
    const fresh = Array.from({ length: 5 }, (_, i) =>
      row(`fresh/r${i}`, 1, `2026-05-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z`),
    );
    const out = mergeAndCap<Row>({
      existing,
      fresh,
      key: caseInsensitiveKey('fullName'),
      compare: byCreatedDescStarsDesc,
      max: 7,
    });
    expect(out).toHaveLength(7);
    // The 5 fresh (newest) + the 2 most recent prior should survive.
    expect(out.slice(0, 5).map((r) => r.fullName)).toEqual([
      'fresh/r4',
      'fresh/r3',
      'fresh/r2',
      'fresh/r1',
      'fresh/r0',
    ]);
  });
});

describe('shouldPreserveCache', () => {
  it('true when fresh empty + existing non-empty', () => {
    expect(shouldPreserveCache({ fresh: [], existing: [{}] })).toBe(true);
  });
  it('false when fresh non-empty', () => {
    expect(shouldPreserveCache({ fresh: [{}], existing: [{}] })).toBe(false);
    expect(shouldPreserveCache({ fresh: [{}], existing: [] })).toBe(false);
  });
  it('false when both empty (nothing to preserve)', () => {
    expect(shouldPreserveCache({ fresh: [], existing: [] })).toBe(false);
  });
});

describe('caseInsensitiveKey', () => {
  it('lowercases string fields', () => {
    const key = caseInsensitiveKey<{ name: string }>('name');
    expect(key({ name: 'FoO/BaR' })).toBe('foo/bar');
  });
  it('returns "" for non-string values (skip signal)', () => {
    const key = caseInsensitiveKey<{ name: unknown }>('name');
    expect(key({ name: 42 })).toBe('');
    expect(key({ name: undefined })).toBe('');
    expect(key({ name: null })).toBe('');
  });
});
