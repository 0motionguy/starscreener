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
  resolveNitterChain,
  shouldRetryAfterCamofoxError,
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

// --------------------------------------------------------------------------
// H6 — resolveNitterChain. The fallback chain is the resilience hatch for
// when the head instance dies mid-run. Tests cover the env precedence and
// the defensive shape sanitisation (trailing slashes, empty entries, dups).
// --------------------------------------------------------------------------

describe('resolveNitterChain', () => {
  it('uses TWITTER_NITTER_CHAIN comma-separated value when present', () => {
    const chain = resolveNitterChain({
      chainEnv: 'https://nitter.a.test, https://nitter.b.test ,https://nitter.c.test/',
      useCamofox: true,
    });
    expect(chain).toEqual([
      'https://nitter.a.test',
      'https://nitter.b.test',
      'https://nitter.c.test',
    ]);
  });

  it('falls back to TWITTER_NITTER_INSTANCE (single) when chain env is empty', () => {
    const chain = resolveNitterChain({
      singleEnv: 'https://nitter.legacy.test/',
      useCamofox: true,
    });
    // Single env head + default chain tail, dedup'd by URL.
    expect(chain[0]).toBe('https://nitter.legacy.test');
    expect(chain.length).toBeGreaterThan(1);
  });

  it('falls back to camofox default chain when both env vars are unset', () => {
    const chain = resolveNitterChain({ useCamofox: true });
    expect(chain[0]).toBe('https://nitter.privacyredirect.com');
    expect(chain.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to direct-fetch default chain when useCamofox is false', () => {
    const chain = resolveNitterChain({ useCamofox: false });
    expect(chain[0]).toBe('https://nt.vern.cc');
  });

  it('dedupes URLs across env + defaults preserving first-seen order', () => {
    const chain = resolveNitterChain({
      singleEnv: 'https://nitter.privacyredirect.com',
      useCamofox: true,
    });
    // Should appear exactly once even though it's also in the default chain.
    const matches = chain.filter((u) => u === 'https://nitter.privacyredirect.com');
    expect(matches).toHaveLength(1);
  });

  it('handles whitespace and trailing slashes in env values', () => {
    const chain = resolveNitterChain({
      chainEnv: '  https://x.test/  ,,https://y.test/// ',
      useCamofox: true,
    });
    expect(chain).toEqual(['https://x.test', 'https://y.test']);
  });
});

// --------------------------------------------------------------------------
// H5 — shouldRetryAfterCamofoxError. The retry hatch should fire ONLY for
// transient camofox surface errors (navigate/evaluate 5xx). 4xx, timeouts,
// parse errors are durable — retrying would burn a tab without value.
// --------------------------------------------------------------------------

describe('shouldRetryAfterCamofoxError', () => {
  it('returns true for camofox navigate 500/502/503/504', () => {
    expect(shouldRetryAfterCamofoxError('camofox navigate 500 Internal Server Error for https://x')).toBe(true);
    expect(shouldRetryAfterCamofoxError('camofox navigate 502 Bad Gateway for https://x')).toBe(true);
    expect(shouldRetryAfterCamofoxError('camofox navigate 503 Service Unavailable for https://x')).toBe(true);
    expect(shouldRetryAfterCamofoxError('camofox navigate 504 Gateway Timeout for https://x')).toBe(true);
  });

  it('returns true for camofox evaluate 5xx', () => {
    expect(shouldRetryAfterCamofoxError('camofox evaluate 500 Internal Server Error')).toBe(true);
    expect(shouldRetryAfterCamofoxError('camofox evaluate 599 Network Connect Timeout Error')).toBe(true);
  });

  it('returns false for 4xx (durable client errors)', () => {
    expect(shouldRetryAfterCamofoxError('camofox navigate 403 Forbidden for https://x')).toBe(false);
    expect(shouldRetryAfterCamofoxError('camofox navigate 404 Not Found for https://x')).toBe(false);
    expect(shouldRetryAfterCamofoxError('camofox evaluate 401 Unauthorized')).toBe(false);
  });

  it('returns false for timeouts / aborted requests', () => {
    expect(shouldRetryAfterCamofoxError('The operation was aborted')).toBe(false);
    expect(shouldRetryAfterCamofoxError('fetch failed')).toBe(false);
  });

  it('returns false for unrelated nitter parse errors', () => {
    expect(shouldRetryAfterCamofoxError('nitter 502 Bad Gateway for https://x')).toBe(false);
    expect(shouldRetryAfterCamofoxError('camofox evaluate error: no result')).toBe(false);
  });
});
