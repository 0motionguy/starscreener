// Unit tests for the mentions-ledger fetcher.
//
// Three contracts under test (per the Phase-A spec):
//   1. SADD-ing the same IDs twice returns 0 the second time (idempotent).
//   2. HINCRBY only fires by the count of NEWLY added members (lockstep
//      with SCARD without a separate read).
//   3. Leaderboard ZADD score reflects total recomputed from the index hash.
//
// We exercise the pure projector (projectSnapshots) and the apply pass
// (applyLedger) against an in-memory RedisOps stub so the test runs with
// zero infrastructure and zero env. Same pattern as
// consensus-trending/__tests__/scoring.test.ts.

import { describe, it, expect } from 'vitest';

import {
  applyLedger,
  extractIds,
  mergeLedgerSnapshot,
  projectSnapshots,
  type LedgerSource,
  type LedgerWorkItem,
  type RedisOps,
  type UpstreamSnapshots,
} from '../index.js';

// --------------------------------------------------------------------------
// In-memory RedisOps — tracks set membership in JS Sets, hash fields in a
// nested Map, and zset scores in a flat Map. Mirrors Redis semantics enough
// to assert idempotency + delta-only HINCRBY + ZADD score.
// --------------------------------------------------------------------------

function makeMemRedis(): {
  ops: RedisOps;
  sets: Map<string, Set<string>>;
  hashes: Map<string, Map<string, number>>;
  zset: Map<string, number>;
} {
  const sets = new Map<string, Set<string>>();
  const hashes = new Map<string, Map<string, number>>();
  const zset = new Map<string, number>();

  const ops: RedisOps = {
    async sadd(key, members) {
      let set = sets.get(key);
      if (!set) {
        set = new Set();
        sets.set(key, set);
      }
      let added = 0;
      for (const m of members) {
        if (!set.has(m)) {
          set.add(m);
          added += 1;
        }
      }
      return added;
    },
    async hincrby(key, field, delta) {
      let hash = hashes.get(key);
      if (!hash) {
        hash = new Map();
        hashes.set(key, hash);
      }
      const current = hash.get(field) ?? 0;
      const next = current + delta;
      hash.set(field, next);
      return next;
    },
    async hgetall(key) {
      const hash = hashes.get(key);
      if (!hash) return {};
      const out: Record<string, string> = {};
      for (const [k, v] of hash) out[k] = String(v);
      return out;
    },
    async zadd(key, score, member) {
      zset.set(`${key}::${member}`, score);
    },
  };

  return { ops, sets, hashes, zset };
}

// --------------------------------------------------------------------------
// Fixtures — minimal slices of the 5 snapshot shapes the fetcher reads.
// --------------------------------------------------------------------------

const snapshots: UpstreamSnapshots = {
  hackernews: {
    mentions: {
      'vercel/next.js': {
        stories: [{ id: 100 }, { id: 101 }, { id: 102 }],
      },
      'sveltejs/svelte': {
        stories: [{ id: 200 }],
      },
    },
  },
  reddit: {
    mentions: {
      'vercel/next.js': {
        posts: [{ id: 'r1' }, { id: 'r2' }],
      },
    },
  },
  bluesky: {
    mentions: {
      'vercel/next.js': {
        posts: [{ uri: 'at://did:plc:x/post/abc' }],
      },
    },
  },
  devto: {
    mentions: {
      'sveltejs/svelte': {
        articles: [{ id: 999 }, { id: 1000 }],
      },
    },
  },
  lobsters: {
    mentions: {
      'vercel/next.js': {
        stories: [{ shortId: 'aaaaaa' }, { shortId: 'bbbbbb' }],
      },
    },
  },
};

// --------------------------------------------------------------------------
// extractIds — per-source coverage. Confirms the bucket-shape contract.
// --------------------------------------------------------------------------

describe('extractIds', () => {
  it('extracts HN story numeric ids as strings', () => {
    const ids = extractIds('hackernews', { stories: [{ id: 1 }, { id: 2 }] });
    expect(ids).toEqual(['1', '2']);
  });

  it('extracts Reddit post string ids', () => {
    const ids = extractIds('reddit', { posts: [{ id: 'abc' }, { id: 'def' }] });
    expect(ids).toEqual(['abc', 'def']);
  });

  it('extracts Bluesky post AT-URIs', () => {
    const ids = extractIds('bluesky', { posts: [{ uri: 'at://x' }, { uri: 'at://y' }] });
    expect(ids).toEqual(['at://x', 'at://y']);
  });

  it('extracts Dev.to article numeric ids as strings', () => {
    const ids = extractIds('devto', { articles: [{ id: 42 }] });
    expect(ids).toEqual(['42']);
  });

  it('extracts Lobsters shortIds', () => {
    const ids = extractIds('lobsters', { stories: [{ shortId: 'xyz' }] });
    expect(ids).toEqual(['xyz']);
  });

  it('skips missing/empty ids and tolerates malformed buckets', () => {
    expect(extractIds('hackernews', null)).toEqual([]);
    expect(extractIds('hackernews', { stories: [{ id: null }, { id: '' }, { id: 7 }] })).toEqual(['7']);
    expect(extractIds('reddit', {})).toEqual([]);
  });

  it('returns [] for unknown sources without throwing', () => {
    // ts-expect to ensure this stays a compile-time guarded path
    const ids = extractIds('lobsters', { stories: [] });
    expect(ids).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// projectSnapshots — flatten the per-source mentions map into work items.
// --------------------------------------------------------------------------

describe('projectSnapshots', () => {
  it('produces one work item per (repo, source) bucket', () => {
    const items = projectSnapshots(snapshots);
    // 5 sources contribute: hn(2 repos) + reddit(1) + bluesky(1) + devto(1) + lobsters(1)
    expect(items).toHaveLength(6);
    const bySource = items.reduce<Record<string, number>>((acc, it) => {
      acc[it.source] = (acc[it.source] ?? 0) + 1;
      return acc;
    }, {});
    expect(bySource).toEqual({
      hackernews: 2,
      reddit: 1,
      bluesky: 1,
      devto: 1,
      lobsters: 1,
    });
  });

  it('skips entries without a `/` in the repo key (defensive)', () => {
    const items = projectSnapshots({
      hackernews: { mentions: { 'not-a-repo': { stories: [{ id: 1 }] } } },
    });
    expect(items).toEqual([]);
  });

  it('tolerates missing / null snapshots without throwing', () => {
    const items = projectSnapshots({});
    expect(items).toEqual([]);
    const items2 = projectSnapshots({
      hackernews: null,
      reddit: null,
      bluesky: null,
      devto: null,
      lobsters: null,
    });
    expect(items2).toEqual([]);
  });

  it('drops repo buckets where every id is unusable', () => {
    // Intentionally malformed shape — exercises the defensive null/empty
    // skip branch in extractIds. Cast through `unknown` because the shape
    // legitimately violates the snapshot type contract.
    const items = projectSnapshots({
      hackernews: {
        mentions: {
          'owner/repo': { stories: [{ id: null }, { id: '' }] },
        },
      },
    } as unknown as UpstreamSnapshots);
    expect(items).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// applyLedger — Phase-A spec contracts. The three asserts from the handover:
//   1. Re-running SADD with same IDs returns 0 the second time.
//   2. HINCRBY only increments by newly-added count.
//   3. Leaderboard ZADD updates score correctly.
// --------------------------------------------------------------------------

describe('applyLedger', () => {
  it('first run: SADD inserts every id and HINCRBY matches the inserted count', async () => {
    const { ops, sets, hashes } = makeMemRedis();
    const items = projectSnapshots(snapshots);

    const result = await applyLedger(ops, items);

    expect(result.reposTouched).toBe(2); // vercel/next.js + sveltejs/svelte
    // Vercel/next.js: 3 HN + 2 reddit + 1 bluesky + 2 lobsters = 8
    // Sveltejs/svelte: 1 HN + 2 devto = 3
    // Total = 11
    expect(result.newMentions).toBe(11);

    // Vercel/next.js: 3 HN + 2 reddit + 1 bluesky + 2 lobsters
    expect(sets.get('ss:mentions:v1:vercel/next.js:hackernews')?.size).toBe(3);
    expect(sets.get('ss:mentions:v1:vercel/next.js:reddit')?.size).toBe(2);
    expect(sets.get('ss:mentions:v1:vercel/next.js:bluesky')?.size).toBe(1);
    expect(sets.get('ss:mentions:v1:vercel/next.js:lobsters')?.size).toBe(2);

    // Sveltejs/svelte: 1 HN + 2 devto
    expect(sets.get('ss:mentions:v1:sveltejs/svelte:hackernews')?.size).toBe(1);
    expect(sets.get('ss:mentions:v1:sveltejs/svelte:devto')?.size).toBe(2);

    // Index hash exactly mirrors set cardinality after a single run.
    const vercelIdx = hashes.get('ss:mentions:v1:vercel/next.js:_index');
    expect(vercelIdx?.get('hackernews')).toBe(3);
    expect(vercelIdx?.get('reddit')).toBe(2);
    expect(vercelIdx?.get('bluesky')).toBe(1);
    expect(vercelIdx?.get('lobsters')).toBe(2);

    const svelteIdx = hashes.get('ss:mentions:v1:sveltejs/svelte:_index');
    expect(svelteIdx?.get('hackernews')).toBe(1);
    expect(svelteIdx?.get('devto')).toBe(2);
  });

  it('second run with identical input is a no-op: SADD returns 0, HINCRBY does not fire', async () => {
    const { ops, sets, hashes } = makeMemRedis();
    const items = projectSnapshots(snapshots);

    await applyLedger(ops, items);
    const result = await applyLedger(ops, items);

    expect(result.newMentions).toBe(0); // SADD returned 0 for every id; HINCRBY was skipped

    // Set sizes unchanged on the second run.
    expect(sets.get('ss:mentions:v1:vercel/next.js:hackernews')?.size).toBe(3);
    expect(sets.get('ss:mentions:v1:vercel/next.js:reddit')?.size).toBe(2);

    // Index hash unchanged — HINCRBY skipped, so values are still the first-run totals.
    const vercelIdx = hashes.get('ss:mentions:v1:vercel/next.js:_index');
    expect(vercelIdx?.get('hackernews')).toBe(3);
    expect(vercelIdx?.get('reddit')).toBe(2);
    expect(vercelIdx?.get('bluesky')).toBe(1);
    expect(vercelIdx?.get('lobsters')).toBe(2);
  });

  it('partial re-add: HINCRBY fires only for the new members', async () => {
    const { ops, hashes } = makeMemRedis();

    // First run — seeds the HN set for vercel with ids 100, 101, 102.
    await applyLedger(ops, [
      { repo: 'vercel/next.js', source: 'hackernews', ids: ['100', '101', '102'] },
    ]);
    expect(hashes.get('ss:mentions:v1:vercel/next.js:_index')?.get('hackernews')).toBe(3);

    // Second run — 102 (overlap) + 103, 104 (new). Only 2 should be counted.
    const result = await applyLedger(ops, [
      { repo: 'vercel/next.js', source: 'hackernews', ids: ['102', '103', '104'] },
    ]);

    expect(result.newMentions).toBe(2);
    expect(hashes.get('ss:mentions:v1:vercel/next.js:_index')?.get('hackernews')).toBe(5);
  });

  it('leaderboard ZADD score equals total across all sources for the repo', async () => {
    const { ops, zset } = makeMemRedis();
    const items = projectSnapshots(snapshots);

    await applyLedger(ops, items);

    // Vercel/next.js: 3+2+1+2 = 8 mentions across sources.
    // Sveltejs/svelte: 1+2 = 3 mentions.
    expect(zset.get('ss:mentions:leaderboard:v1::vercel/next.js')).toBe(8);
    expect(zset.get('ss:mentions:leaderboard:v1::sveltejs/svelte')).toBe(3);
  });

  it('leaderboard updates with the new total after a partial follow-up run', async () => {
    const { ops, zset } = makeMemRedis();

    // First run: vercel has 3 HN mentions only.
    await applyLedger(ops, [
      { repo: 'vercel/next.js', source: 'hackernews', ids: ['100', '101', '102'] },
    ]);
    expect(zset.get('ss:mentions:leaderboard:v1::vercel/next.js')).toBe(3);

    // Second run: same 3 HN ids (no-op) + 2 new reddit ids.
    await applyLedger(ops, [
      { repo: 'vercel/next.js', source: 'hackernews', ids: ['100', '101', '102'] },
      { repo: 'vercel/next.js', source: 'reddit', ids: ['r1', 'r2'] },
    ]);

    // Leaderboard score must reflect the recomputed total — 3 HN + 2 reddit = 5.
    expect(zset.get('ss:mentions:leaderboard:v1::vercel/next.js')).toBe(5);
  });

  it('handles empty work-item list without touching Redis', async () => {
    const { ops, sets, hashes, zset } = makeMemRedis();
    const result = await applyLedger(ops, []);
    expect(result).toEqual({ reposTouched: 0, newMentions: 0, leaderboardSize: 0, entries: [] });
    expect(sets.size).toBe(0);
    expect(hashes.size).toBe(0);
    expect(zset.size).toBe(0);
  });

  it('uses the operator-confirmed key namespace (ss:mentions:v1)', async () => {
    // Sentinel: if anyone renames the prefix this test screams.
    const { ops, sets } = makeMemRedis();
    const items: LedgerWorkItem[] = [
      { repo: 'a/b', source: 'hackernews' as LedgerSource, ids: ['1'] },
    ];
    await applyLedger(ops, items);
    expect(sets.has('ss:mentions:v1:a/b:hackernews')).toBe(true);
  });

  it('returns flattened entries (perSource + total) for the snapshot', async () => {
    const { ops } = makeMemRedis();
    const result = await applyLedger(ops, projectSnapshots(snapshots));
    const vercel = result.entries.find((e) => e.fullName === 'vercel/next.js');
    expect(vercel?.total).toBe(8);
    expect(vercel?.perSource).toEqual({ hackernews: 3, reddit: 2, bluesky: 1, lobsters: 2 });
    expect(vercel?.sources[0]).toBe('hackernews'); // sorted desc by count
  });
});

describe('mergeLedgerSnapshot', () => {
  const entry = (fullName: string, total: number) => ({
    fullName,
    perSource: { hackernews: total } as Record<string, number>,
    total,
    sources: ['hackernews'],
  });

  it('accumulates: untouched repos retained, touched repos overwritten', () => {
    const existing = { entries: [entry('old/repo', 5), entry('shared/repo', 2)], writtenAt: 't0' };
    const out = mergeLedgerSnapshot(existing, [entry('shared/repo', 9), entry('new/repo', 1)], 't1');
    const byName = Object.fromEntries(out.entries.map((e) => [e.fullName, e.total]));
    expect(byName).toEqual({ 'old/repo': 5, 'shared/repo': 9, 'new/repo': 1 });
    expect(out.writtenAt).toBe('t1');
  });

  it('handles a null existing snapshot (first run)', () => {
    const out = mergeLedgerSnapshot(null, [entry('a/b', 3)], 't1');
    expect(out.entries).toHaveLength(1);
  });
});
