// Unit tests for the cross-source-sweep pure logic: rollup grouping/trimming,
// the 7-day window cutoff, distinctive-name gating (drives which HN/Reddit
// queries fire), and owner/name parsing. The network adapters are integration-
// only (live HTTP) and not exercised here.

import { describe, expect, it } from 'vitest';
import {
  buildRollupRepos,
  dedupeMentions,
  isDistinctiveName,
  mergeRollupRepos,
  searchTwitterApify,
  toRepoInput,
  type Mention,
} from '../index.js';

function mention(over: Partial<Mention> = {}): Mention {
  return {
    source: 'hackernews',
    fullName: 'owner/repo',
    url: 'https://news.ycombinator.com/item?id=1',
    title: 't',
    text: '',
    author: null,
    engagement: { score: 0 },
    observedAt: new Date().toISOString(),
    ...over,
  };
}

describe('buildRollupRepos', () => {
  it('groups by repo + source, counts, and trims each bucket to top-5 by score', () => {
    const mentions: Mention[] = Array.from({ length: 7 }, (_, i) =>
      mention({ url: `https://x/${i}`, engagement: { score: i } }),
    );
    const repos = buildRollupRepos(mentions);
    const repo = repos['owner/repo'];
    expect(repo?.totalMentions7d).toBe(7);
    const hn = repo?.perSource.hackernews;
    expect(hn?.count7d).toBe(7);
    expect(hn?.countLifetime).toBe(7);
    expect(hn?.top).toHaveLength(5); // trimmed
    expect(hn?.top[0]?.engagement.score).toBe(6); // highest score first
    expect(hn?.top[4]?.engagement.score).toBe(2);
  });

  it('keys multiple repos + sources independently', () => {
    const repos = buildRollupRepos([
      mention({ fullName: 'a/one', source: 'hackernews' }),
      mention({ fullName: 'a/one', source: 'devto' }),
      mention({ fullName: 'b/two', source: 'reddit' }),
    ]);
    expect(Object.keys(repos).sort()).toEqual(['a/one', 'b/two']);
    expect(Object.keys(repos['a/one']?.perSource ?? {}).sort()).toEqual(['devto', 'hackernews']);
    expect(repos['b/two']?.perSource.reddit?.count7d).toBe(1);
  });

  it('drops mentions older than the 7d window', () => {
    const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const repos = buildRollupRepos([
      mention({ observedAt: old }),
      mention({ url: 'https://x/fresh' }),
    ]);
    expect(repos['owner/repo']?.totalMentions7d).toBe(1);
  });
});

describe('mergeRollupRepos', () => {
  it('never drops a source not re-found this run; counts take the max', () => {
    const existing = buildRollupRepos([
      mention({ fullName: 'a/b', source: 'devto', url: 'https://d/1' }),
      mention({ fullName: 'a/b', source: 'devto', url: 'https://d/2' }),
      mention({ fullName: 'a/b', source: 'hackernews', url: 'https://h/1' }),
    ]);
    // Fresh run only re-found hackernews (1 item) for a/b — devto absent.
    const fresh = buildRollupRepos([
      mention({ fullName: 'a/b', source: 'hackernews', url: 'https://h/1' }),
    ]);
    const merged = mergeRollupRepos(existing, fresh);
    expect(merged['a/b']?.perSource.devto?.countLifetime).toBe(2); // retained, not dropped
    expect(merged['a/b']?.perSource.hackernews?.countLifetime).toBe(1);
  });

  it('keeps a repo absent from the fresh run entirely', () => {
    const existing = buildRollupRepos([mention({ fullName: 'old/repo', url: 'https://x/1' })]);
    const fresh = buildRollupRepos([mention({ fullName: 'new/repo', url: 'https://x/2' })]);
    const merged = mergeRollupRepos(existing, fresh);
    expect(Object.keys(merged).sort()).toEqual(['new/repo', 'old/repo']);
  });

  it('unions top mentions deduped by url, best-5 by score', () => {
    const existing = buildRollupRepos([
      mention({ fullName: 'a/b', url: 'https://x/old', engagement: { score: 1 } }),
    ]);
    const fresh = buildRollupRepos([
      mention({ fullName: 'a/b', url: 'https://x/new', engagement: { score: 9 } }),
      mention({ fullName: 'a/b', url: 'https://x/old', engagement: { score: 1 } }), // dup url
    ]);
    const merged = mergeRollupRepos(existing, fresh);
    const top = merged['a/b']?.perSource.hackernews?.top ?? [];
    expect(top).toHaveLength(2); // deduped
    expect(top[0]?.url).toBe('https://x/new'); // highest score first
  });
});

describe('dedupeMentions', () => {
  it('collapses same repo + source + url; keeps distinct urls and distinct sources', () => {
    const out = dedupeMentions([
      mention({ source: 'hackernews', url: 'https://x/1' }), // live
      mention({ source: 'hackernews', url: 'https://x/1' }), // fold-in dup → dropped
      mention({ source: 'hackernews', url: 'https://x/2' }), // distinct url → kept
      mention({ source: 'devto', url: 'https://x/1' }), // distinct source → kept
    ]);
    expect(out).toHaveLength(3);
  });

  it('is case-insensitive on fullName', () => {
    const out = dedupeMentions([
      mention({ fullName: 'Owner/Repo', url: 'https://x/1' }),
      mention({ fullName: 'owner/repo', url: 'https://x/1' }),
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('isDistinctiveName', () => {
  it('accepts distinctive names', () => {
    expect(isDistinctiveName('langgraph')).toBe(true);
    expect(isDistinctiveName('firecrawl')).toBe(true);
  });
  it('rejects generic + short names', () => {
    expect(isDistinctiveName('skills')).toBe(false);
    expect(isDistinctiveName('cli')).toBe(false);
    expect(isDistinctiveName('api')).toBe(false);
    expect(isDistinctiveName('ab')).toBe(false);
  });
});

describe('searchTwitterApify', () => {
  it('is gated off (no network) when no Apify token is present', async () => {
    const repo = toRepoInput('vercel/next.js');
    await expect(searchTwitterApify(repo ? [repo] : [], undefined)).resolves.toEqual([]);
    await expect(searchTwitterApify(repo ? [repo] : [], '')).resolves.toEqual([]);
  });
});

describe('toRepoInput', () => {
  it('parses owner/name', () => {
    expect(toRepoInput('vercel/next.js')).toEqual({
      fullName: 'vercel/next.js',
      owner: 'vercel',
      name: 'next.js',
    });
  });
  it('rejects malformed input', () => {
    expect(toRepoInput('noslash')).toBeNull();
    expect(toRepoInput('')).toBeNull();
    expect(toRepoInput(null)).toBeNull();
    expect(toRepoInput(123)).toBeNull();
  });
});
