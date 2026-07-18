import { describe, expect, it } from 'vitest';
import { buildRegistry, type RegistryPayload, type RegistrySources } from '../index.js';

const T0 = '2026-05-01T00:00:00.000Z';
const T1 = '2026-05-27T00:00:00.000Z';

function trending(rows: Array<{ repo_name: string; stars?: string; primary_language?: string }>): RegistrySources['trending'] {
  return { buckets: { past_24_hours: { All: rows } } };
}
const EMPTY: RegistrySources = { trending: null, metadata: null, consensus: null, recent: null };

describe('buildRegistry', () => {
  it('accumulates: a repo seen before but ABSENT from current trending is retained', () => {
    const existing: RegistryPayload = {
      version: 1, writtenAt: T0, count: 1,
      repos: {
        'old/dropped': {
          fullName: 'old/dropped', repoId: '1', language: 'Go', description: 'd',
          stars: 500, forks: 5, totalScore: 9, firstSeenAt: T0, lastSeenAt: T0, lastSource: 'trending',
        },
      },
    };
    const out = buildRegistry(existing, { ...EMPTY, trending: trending([{ repo_name: 'new/repo', stars: '100' }]) }, T1);
    expect(Object.keys(out.repos).sort()).toEqual(['new/repo', 'old/dropped']);
    expect(out.count).toBe(2);
    expect(out.repos['old/dropped']?.stars).toBe(500); // retained, untouched
  });

  it('dedupes case-insensitively + preserves firstSeenAt, refreshes lastSeenAt', () => {
    const existing: RegistryPayload = {
      version: 1, writtenAt: T0, count: 1,
      repos: { 'a/b': { fullName: 'A/B', repoId: null, language: null, description: '', stars: 1, forks: 0, totalScore: null, firstSeenAt: T0, lastSeenAt: T0, lastSource: 'trending' } },
    };
    const out = buildRegistry(existing, { ...EMPTY, trending: trending([{ repo_name: 'a/b', stars: '50' }]) }, T1);
    expect(Object.keys(out.repos)).toEqual(['a/b']);
    expect(out.repos['a/b']?.firstSeenAt).toBe(T0);
    expect(out.repos['a/b']?.lastSeenAt).toBe(T1);
    expect(out.repos['a/b']?.stars).toBe(50);
  });

  it('fill-only sources register new names but do NOT clobber trending stats', () => {
    const out = buildRegistry(
      null,
      {
        trending: trending([{ repo_name: 'x/trend', stars: '999', primary_language: 'Rust' }]),
        metadata: { items: [{ fullName: 'x/trend', stars: 1 }, { fullName: 'y/meta-only' }] },
        consensus: { items: [{ fullName: 'z/consensus' }] },
        recent: null,
      },
      T1,
    );
    expect(Object.keys(out.repos).sort()).toEqual(['x/trend', 'y/meta-only', 'z/consensus']);
    expect(out.repos['x/trend']?.stars).toBe(999); // trending stat, not clobbered by metadata's 1
    expect(out.repos['x/trend']?.language).toBe('Rust');
    expect(out.repos['y/meta-only']?.lastSource).toBe('repo-metadata');
  });

  it('caps by lastSeenAt desc — least-recently-seen evicted', () => {
    const existing: RegistryPayload = {
      version: 1, writtenAt: T0, count: 2,
      repos: {
        'stale/one': { fullName: 'stale/one', repoId: null, language: null, description: '', stars: 1, forks: 0, totalScore: null, firstSeenAt: T0, lastSeenAt: '2026-04-01T00:00:00.000Z', lastSource: 'trending' },
        'stale/two': { fullName: 'stale/two', repoId: null, language: null, description: '', stars: 1, forks: 0, totalScore: null, firstSeenAt: T0, lastSeenAt: '2026-04-02T00:00:00.000Z', lastSource: 'trending' },
      },
    };
    const out = buildRegistry(existing, { ...EMPTY, trending: trending([{ repo_name: 'fresh/repo', stars: '1' }]) }, T1, 2);
    expect(out.count).toBe(2);
    expect(out.repos['fresh/repo']).toBeDefined(); // just-seen, survives
    expect(out.repos['stale/one']).toBeUndefined(); // oldest lastSeenAt, evicted
    expect(out.repos['stale/two']).toBeDefined();
  });

  it('retains up to 3000 repos by default', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({
      repo_name: `owner/repo-${i}`,
      stars: String(i),
    }));
    const out = buildRegistry(
      null,
      { ...EMPTY, trending: trending(rows) },
      T1,
    );
    expect(out.count).toBe(2001);
  });

  it('ignores malformed names (no slash)', () => {
    const out = buildRegistry(null, { ...EMPTY, trending: trending([{ repo_name: 'noslash', stars: '1' }, { repo_name: 'ok/repo', stars: '1' }]) }, T1);
    expect(Object.keys(out.repos)).toEqual(['ok/repo']);
  });
});
