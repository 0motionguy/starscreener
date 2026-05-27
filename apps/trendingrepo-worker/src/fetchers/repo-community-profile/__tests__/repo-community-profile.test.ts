import { describe, expect, it } from 'vitest';
import { pickProfileCandidates } from '../index.js';

function entry(fullName: string, lastSeenAt: string) {
  return { fullName, lastSeenAt };
}

describe('pickProfileCandidates', () => {
  it('returns empty when registry is null', () => {
    expect(pickProfileCandidates(null, 25)).toEqual([]);
  });

  it('returns empty when registry has no repos', () => {
    expect(pickProfileCandidates({ repos: {} }, 25)).toEqual([]);
  });

  it('orders by lastSeenAt descending (most-recent first)', () => {
    const registry = {
      repos: {
        'old/a': entry('old/a', '2026-04-01T00:00:00.000Z'),
        'mid/b': entry('mid/b', '2026-05-15T00:00:00.000Z'),
        'new/c': entry('new/c', '2026-05-27T00:00:00.000Z'),
      },
    };
    expect(pickProfileCandidates(registry, 25)).toEqual(['new/c', 'mid/b', 'old/a']);
  });

  it('respects the limit', () => {
    const registry = {
      repos: {
        a: entry('a/one', '2026-05-27T10:00:00.000Z'),
        b: entry('b/two', '2026-05-27T09:00:00.000Z'),
        c: entry('c/three', '2026-05-27T08:00:00.000Z'),
        d: entry('d/four', '2026-05-27T07:00:00.000Z'),
      },
    };
    expect(pickProfileCandidates(registry, 2)).toEqual(['a/one', 'b/two']);
  });

  it('skips entries without a valid fullName', () => {
    const registry = {
      repos: {
        good: entry('owner/good', '2026-05-27T00:00:00.000Z'),
        bad1: entry('noslash', '2026-05-27T00:00:00.000Z'),
        bad2: { fullName: '', lastSeenAt: '2026-05-27T00:00:00.000Z' },
        bad3: null as unknown as { fullName: string; lastSeenAt: string },
      },
    };
    expect(pickProfileCandidates(registry, 25)).toEqual(['owner/good']);
  });

  it('skips entries without a lastSeenAt string', () => {
    const registry = {
      repos: {
        a: entry('owner/a', '2026-05-27T00:00:00.000Z'),
        b: { fullName: 'owner/b', lastSeenAt: undefined as unknown as string },
      },
    };
    expect(pickProfileCandidates(registry, 25)).toEqual(['owner/a']);
  });
});
