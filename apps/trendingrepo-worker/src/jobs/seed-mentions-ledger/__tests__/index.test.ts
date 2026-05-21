// Unit tests for the seed-mentions-ledger one-shot job.
//
// Three contracts under test:
//   1. parseJsonlLine — skips non-ledger sources (tavily/twitter), malformed
//      JSON, missing fields; extracts (repo, source, url) for the 5 known.
//   2. projectFromRollupData — walks repos[].perSource[src].top[] and emits
//      one work item per (repo, source) with URL-as-stable-ID.
//   3. mergeWorkItems — unions IDs across passes so applyLedger sees one
//      SADD per (repo, source) regardless of how many input passes
//      mentioned the same repo.
//
// We do NOT exercise runSeedMentionsLedger end-to-end here — that would
// require mocking readDataStore + fs reads. The two pure projectors plus
// merge cover the seed-specific logic; applyLedger itself is already
// covered by the Phase A fetcher test.

import { describe, it, expect } from 'vitest';

import {
  parseJsonlLine,
  projectFromRollupData,
  mergeWorkItems,
  recordEvent,
  accumulatorToItems,
  type IdAccumulator,
} from '../index.js';

// --------------------------------------------------------------------------
// parseJsonlLine — covers each LEDGER_SOURCES branch + skip cases.
// --------------------------------------------------------------------------

describe('parseJsonlLine', () => {
  it('parses a hackernews JSONL event', () => {
    const line = JSON.stringify({
      source: 'hackernews',
      fullName: 'modem-dev/hunk',
      url: 'https://github.com/modem-dev/hunk',
      observedAt: '2026-05-07T00:24:05.000Z',
    });
    expect(parseJsonlLine(line)).toEqual({
      repo: 'modem-dev/hunk',
      source: 'hackernews',
      id: 'https://github.com/modem-dev/hunk',
    });
  });

  it('parses a reddit JSONL event', () => {
    const line = JSON.stringify({
      source: 'reddit',
      fullName: 'mattpocock/skills',
      url: 'https://www.reddit.com/r/ClaudeWorkflows/comments/abc/foo/',
    });
    expect(parseJsonlLine(line)).toEqual({
      repo: 'mattpocock/skills',
      source: 'reddit',
      id: 'https://www.reddit.com/r/ClaudeWorkflows/comments/abc/foo/',
    });
  });

  it('parses bluesky / devto / lobsters JSONL events', () => {
    expect(
      parseJsonlLine(
        JSON.stringify({
          source: 'bluesky',
          fullName: 'foo/bar',
          url: 'https://bsky.app/profile/x/post/3m1',
        }),
      ),
    ).toEqual({ repo: 'foo/bar', source: 'bluesky', id: 'https://bsky.app/profile/x/post/3m1' });

    expect(
      parseJsonlLine(
        JSON.stringify({
          source: 'devto',
          fullName: 'foo/bar',
          url: 'https://dev.to/x/y-abc123',
        }),
      ),
    ).toEqual({ repo: 'foo/bar', source: 'devto', id: 'https://dev.to/x/y-abc123' });

    expect(
      parseJsonlLine(
        JSON.stringify({
          source: 'lobsters',
          fullName: 'foo/bar',
          url: 'https://lobste.rs/s/aaaaaa/title',
        }),
      ),
    ).toEqual({
      repo: 'foo/bar',
      source: 'lobsters',
      id: 'https://lobste.rs/s/aaaaaa/title',
    });
  });

  it('returns null for non-ledger sources (tavily, twitter)', () => {
    const tavily = JSON.stringify({
      source: 'tavily',
      fullName: 'foo/bar',
      url: 'https://x.example/y',
    });
    expect(parseJsonlLine(tavily)).toBeNull();

    const twitter = JSON.stringify({
      source: 'twitter',
      fullName: 'foo/bar',
      url: 'https://x.com/y/status/123',
    });
    expect(parseJsonlLine(twitter)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseJsonlLine('{ not valid }')).toBeNull();
    expect(parseJsonlLine('')).toBeNull();
    expect(parseJsonlLine('   ')).toBeNull();
  });

  it('returns null when fullName / url are missing or empty', () => {
    expect(
      parseJsonlLine(JSON.stringify({ source: 'hackernews', url: 'https://x' })),
    ).toBeNull();
    expect(
      parseJsonlLine(JSON.stringify({ source: 'hackernews', fullName: 'foo/bar' })),
    ).toBeNull();
    expect(
      parseJsonlLine(JSON.stringify({ source: 'hackernews', fullName: 'foo/bar', url: '' })),
    ).toBeNull();
    expect(
      parseJsonlLine(
        JSON.stringify({ source: 'hackernews', fullName: 'no-slash', url: 'https://x' }),
      ),
    ).toBeNull();
  });
});

// --------------------------------------------------------------------------
// projectFromRollupData — walks the 7d rollup file into work items.
// --------------------------------------------------------------------------

describe('projectFromRollupData', () => {
  it('emits one work item per (repo, source) from the rollup', () => {
    const items = projectFromRollupData({
      repos: {
        'modem-dev/hunk': {
          perSource: {
            bluesky: {
              top: [
                { url: 'https://bsky.app/x/post/1' },
                { url: 'https://bsky.app/x/post/2' },
              ],
            },
          },
        },
        'addyosmani/agent-skills': {
          perSource: {
            hackernews: {
              top: [
                { url: 'https://github.com/contentful/skill-kit' },
                { url: 'https://research.example/foo' },
              ],
            },
            bluesky: {
              top: [{ url: 'https://bsky.app/a/post/x' }],
            },
          },
        },
      },
    });

    expect(items).toHaveLength(3);
    const byKey = items.reduce<Record<string, number>>((acc, it) => {
      acc[`${it.repo}::${it.source}`] = it.ids.length;
      return acc;
    }, {});
    expect(byKey).toEqual({
      'modem-dev/hunk::bluesky': 2,
      'addyosmani/agent-skills::hackernews': 2,
      'addyosmani/agent-skills::bluesky': 1,
    });
  });

  it('skips non-ledger sources nested inside the rollup', () => {
    const items = projectFromRollupData({
      repos: {
        'foo/bar': {
          perSource: {
            twitter: { top: [{ url: 'https://x.com/y' }] },
            tavily: { top: [{ url: 'https://tavily.com/y' }] },
            bluesky: { top: [{ url: 'https://bsky.app/y' }] },
          },
        },
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.source).toBe('bluesky');
  });

  it('dedupes the same URL appearing twice in a single source.top list', () => {
    const items = projectFromRollupData({
      repos: {
        'foo/bar': {
          perSource: {
            bluesky: {
              top: [{ url: 'https://bsky.app/x' }, { url: 'https://bsky.app/x' }],
            },
          },
        },
      },
    });
    expect(items[0]?.ids).toEqual(['https://bsky.app/x']);
  });

  it('tolerates null/missing/empty structure without throwing', () => {
    expect(projectFromRollupData(null)).toEqual([]);
    expect(projectFromRollupData({})).toEqual([]);
    expect(projectFromRollupData({ repos: {} })).toEqual([]);
    expect(
      projectFromRollupData({
        repos: { 'foo/bar': { perSource: { bluesky: { top: [] } } } },
      }),
    ).toEqual([]);
  });

  it('skips entries without a "/" in the repo key', () => {
    const items = projectFromRollupData({
      repos: {
        'not-a-repo': {
          perSource: { bluesky: { top: [{ url: 'https://bsky.app/x' }] } },
        },
      },
    });
    expect(items).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// mergeWorkItems + recordEvent + accumulatorToItems — fan-in helpers.
// --------------------------------------------------------------------------

describe('mergeWorkItems', () => {
  it('unions IDs across input passes for the same (repo, source)', () => {
    const merged = mergeWorkItems(
      [{ repo: 'foo/bar', source: 'hackernews', ids: ['url-1', 'url-2'] }],
      [{ repo: 'foo/bar', source: 'hackernews', ids: ['url-2', 'url-3'] }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.ids.sort()).toEqual(['url-1', 'url-2', 'url-3']);
  });

  it('keeps work items for distinct sources separate', () => {
    const merged = mergeWorkItems(
      [{ repo: 'foo/bar', source: 'hackernews', ids: ['hn-1'] }],
      [{ repo: 'foo/bar', source: 'bluesky', ids: ['bsky-1'] }],
    );
    expect(merged).toHaveLength(2);
    const bySource = Object.fromEntries(merged.map((m) => [m.source, m.ids]));
    expect(bySource).toEqual({ hackernews: ['hn-1'], bluesky: ['bsky-1'] });
  });

  it('returns an empty list when given no input', () => {
    expect(mergeWorkItems()).toEqual([]);
    expect(mergeWorkItems([], [])).toEqual([]);
  });
});

describe('recordEvent + accumulatorToItems', () => {
  it('round-trips a known set of (repo, source, id) tuples', () => {
    const acc: IdAccumulator = new Map();
    recordEvent(acc, 'foo/bar', 'hackernews', 'a');
    recordEvent(acc, 'foo/bar', 'hackernews', 'b');
    recordEvent(acc, 'foo/bar', 'hackernews', 'a'); // dedupe
    recordEvent(acc, 'foo/bar', 'bluesky', 'c');
    recordEvent(acc, 'x/y', 'devto', 'd');

    const items = accumulatorToItems(acc);
    expect(items).toHaveLength(3);
    const byKey = Object.fromEntries(
      items.map((it) => [`${it.repo}::${it.source}`, it.ids.sort()]),
    );
    expect(byKey).toEqual({
      'foo/bar::hackernews': ['a', 'b'],
      'foo/bar::bluesky': ['c'],
      'x/y::devto': ['d'],
    });
  });
});
