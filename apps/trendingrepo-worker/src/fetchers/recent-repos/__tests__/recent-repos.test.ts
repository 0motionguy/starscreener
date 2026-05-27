import { describe, expect, it } from 'vitest';
import { mergeRecentRepos, type RecentRepoRow } from '../index.js';

function row(name: string, stars = 10, createdAt = '2026-05-01T00:00:00.000Z'): RecentRepoRow {
  const [owner = '', repoName = ''] = name.split('/');
  return {
    githubId: undefined,
    fullName: name,
    name: repoName,
    owner,
    ownerAvatarUrl: '',
    description: '',
    url: `https://github.com/${name}`,
    language: null,
    topics: [],
    stars,
    forks: 0,
    openIssues: 0,
    createdAt,
    updatedAt: createdAt,
    pushedAt: createdAt,
  };
}

describe('mergeRecentRepos', () => {
  it('preserves prior rows when fresh is empty (zero-write hazard fix — Wave 2A)', () => {
    const prior = [
      row('a/keep1', 50, '2026-04-15T00:00:00.000Z'),
      row('b/keep2', 25, '2026-04-10T00:00:00.000Z'),
    ];
    const merged = mergeRecentRepos(prior, [], 120);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.fullName).sort()).toEqual(['a/keep1', 'b/keep2']);
  });

  it('unions prior + fresh, fresh wins on collision', () => {
    const prior = [row('a/keep', 10), row('a/dup', 5)];
    const fresh = [row('a/dup', 99), row('b/new', 20)];
    const merged = mergeRecentRepos(prior, fresh, 120);
    expect(merged).toHaveLength(3);
    expect(merged.find((r) => r.fullName === 'a/dup')?.stars).toBe(99);
  });

  it('caps to max — newest-first (createdAt desc), tie-break by stars desc', () => {
    const fresh = [
      row('a/older', 100, '2026-04-01T00:00:00.000Z'),
      row('b/newer', 50, '2026-05-15T00:00:00.000Z'),
      row('c/middle', 75, '2026-05-01T00:00:00.000Z'),
    ];
    const merged = mergeRecentRepos([], fresh, 2);
    expect(merged.map((r) => r.fullName)).toEqual(['b/newer', 'c/middle']);
  });

  it('case-insensitive dedupe', () => {
    const prior = [row('A/B', 10)];
    const fresh = [row('a/b', 99)];
    const merged = mergeRecentRepos(prior, fresh, 120);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.stars).toBe(99);
  });

  it('skips rows with empty fullName (defensive)', () => {
    const merged = mergeRecentRepos([row('', 1)], [row('a/ok', 1)], 120);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.fullName).toBe('a/ok');
  });

  it('partial-failure union: 1 window succeeds, prior data preserved', () => {
    // Simulates GH search returning data for only 1 of 3 windows. With the
    // pre-Wave-2A behavior, partial-success would still narrow the cache to
    // only the fresh rows. With merge semantics, prior rows stay too.
    const prior = [
      row('a/from-yesterday', 50, '2026-04-20T00:00:00.000Z'),
      row('b/from-yesterday', 30, '2026-04-19T00:00:00.000Z'),
    ];
    const fresh = [row('c/new-today', 5, '2026-05-01T00:00:00.000Z')];
    const merged = mergeRecentRepos(prior, fresh, 120);
    expect(merged).toHaveLength(3);
    expect(merged.map((r) => r.fullName)).toEqual([
      'c/new-today',
      'a/from-yesterday',
      'b/from-yesterday',
    ]);
  });
});
