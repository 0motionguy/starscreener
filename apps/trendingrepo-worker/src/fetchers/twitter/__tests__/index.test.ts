// Unit tests for the Nitter HTML parser. Drives a fixture HTML snippet
// shaped like a real `nt.vern.cc/search?f=tweets&q=...` response.
//
// We don't hit the network in the test; the fetcher's `run()` is exercised
// indirectly via parseNitterSearchHtml + buildNitterSearchUrl which are the
// only branchy bits worth covering at the unit layer.

import { describe, expect, it } from 'vitest';

import {
  buildNitterSearchUrl,
  parseNitterSearchHtml,
  type TwitterRepoSignalPost,
} from '../index.js';

// Minimal Nitter HTML — captures the two card shapes we care about:
//   1. Normal tweet with author, content, and a parseable timestamp.
//   2. Tweet with an unparseable date — we still take it, publishedAt=null.
// Anything else (retweets, replies) reuses the same `.timeline-item` shell.
const FIXTURE_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="timeline">
    <div class="timeline-item">
      <a class="tweet-link" href="/alice/status/1234567890123456789#m"></a>
      <div class="tweet-header">
        <a class="username">@alice</a>
        <span class="tweet-date">
          <a href="/alice/status/1234567890123456789#m" title="Apr 12, 2026 · 7:43 PM UTC">Apr 12</a>
        </span>
      </div>
      <div class="tweet-content">
        Just shipped a fix for github.com/vercel/next.js — huge thanks to maintainers.
      </div>
    </div>

    <div class="timeline-item">
      <a class="tweet-link" href="/bob/status/9876543210987654321#m"></a>
      <div class="tweet-header">
        <a class="username">@bob</a>
        <span class="tweet-date">
          <a href="/bob/status/9876543210987654321#m" title="not-a-real-date">recent</a>
        </span>
      </div>
      <div class="tweet-content">
        Loving the new release of github.com/vercel/next.js. Cache Components are 🔥
      </div>
    </div>

    <div class="timeline-item">
      <!-- Duplicate id — should NOT appear twice in the output. -->
      <a class="tweet-link" href="/alice/status/1234567890123456789#m"></a>
      <div class="tweet-header">
        <a class="username">@alice</a>
      </div>
      <div class="tweet-content">duplicate</div>
    </div>

    <div class="timeline-item">
      <!-- Missing tweet-link href — should be skipped. -->
      <a class="tweet-link"></a>
      <div class="tweet-content">orphan</div>
    </div>

    <div class="timeline-item">
      <!-- Missing content — should be skipped (we require both author + text). -->
      <a class="tweet-link" href="/charlie/status/1111#m"></a>
      <div class="tweet-header"><a class="username">@charlie</a></div>
      <div class="tweet-content"></div>
    </div>
  </div>
</body>
</html>
`;

describe('buildNitterSearchUrl', () => {
  it('builds a tweets-search URL with the github.com/<repo> query encoded', () => {
    const url = buildNitterSearchUrl('https://nt.vern.cc', 'vercel/next.js');
    expect(url).toBe(
      'https://nt.vern.cc/search?f=tweets&q=github.com%2Fvercel%2Fnext.js',
    );
  });

  it('strips trailing slashes from the instance', () => {
    const url = buildNitterSearchUrl('https://nt.vern.cc/', 'a/b');
    expect(url).toBe('https://nt.vern.cc/search?f=tweets&q=github.com%2Fa%2Fb');
  });
});

describe('parseNitterSearchHtml', () => {
  const fetchedAt = '2026-05-21T12:00:00.000Z';
  let posts: TwitterRepoSignalPost[];

  it('parses two unique tweets from the fixture', () => {
    posts = parseNitterSearchHtml(
      FIXTURE_HTML,
      'vercel/next.js',
      fetchedAt,
      'https://nt.vern.cc/search?f=tweets&q=github.com%2Fvercel%2Fnext.js',
    );
    expect(posts).toHaveLength(2);
  });

  it('extracts numeric tweet ids from /<user>/status/<id> links', () => {
    expect(posts[0]?.id).toBe('1234567890123456789');
    expect(posts[1]?.id).toBe('9876543210987654321');
  });

  it('sets author + authorUrl from the @-stripped username', () => {
    expect(posts[0]?.author).toBe('alice');
    expect(posts[0]?.authorUrl).toBe('https://twitter.com/alice');
    expect(posts[1]?.author).toBe('bob');
  });

  it('builds canonical twitter.com tweet URLs (Nitter is just the scraper)', () => {
    expect(posts[0]?.tweetUrl).toBe(
      'https://twitter.com/alice/status/1234567890123456789',
    );
  });

  it('attaches the repoFullName + query the caller supplied', () => {
    expect(posts[0]?.repoFullName).toBe('vercel/next.js');
    expect(posts[0]?.query).toContain('github.com%2Fvercel%2Fnext.js');
  });

  it('parses Nitter timestamps via the title attribute when present', () => {
    expect(posts[0]?.publishedAt).toBe(new Date('Apr 12, 2026 7:43 PM UTC').toISOString());
  });

  it('falls back to publishedAt=null when the date is unparseable', () => {
    expect(posts[1]?.publishedAt).toBeNull();
  });

  it('dedupes by tweet id within a single page', () => {
    // The fixture has the same 1234... id twice — only one should remain.
    const ids = posts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('skips items missing href or content', () => {
    // charlie's empty-content + the hrefless orphan should both be dropped.
    expect(posts.find((p) => p.author === 'charlie')).toBeUndefined();
  });

  it('returns an empty array for unparseable HTML rather than throwing', () => {
    const result = parseNitterSearchHtml('<html><body>nope</body></html>', 'a/b', fetchedAt, 'q');
    expect(result).toEqual([]);
  });
});
