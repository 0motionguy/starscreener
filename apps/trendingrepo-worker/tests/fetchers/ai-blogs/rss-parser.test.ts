import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFeed } from '../../../src/lib/feeds/rss-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (n: string): string => readFileSync(join(__dirname, 'fixtures', n), 'utf8');

describe('parseFeed (RSS 2.0)', () => {
  const result = parseFeed(fixture('openai-news-rss.xml'));

  it('detects RSS 2.0 dialect', () => {
    expect(result.format).toBe('rss');
  });

  it('extracts items with canonicalized URLs', () => {
    expect(result.posts).toHaveLength(3);
    expect(result.posts[0]!.url).toBe('https://openai.com/news/gpt-5-5-launch');
    expect(result.posts[0]!.title).toBe('Introducing GPT-5.5: improved reasoning across domains');
  });

  it('parses RFC 822 dates', () => {
    expect(result.posts[0]!.publishedAt).toBe('2026-04-27T14:00:00.000Z');
  });

  it('strips HTML and CDATA from description', () => {
    expect(result.posts[0]!.summary).toContain("Today we're releasing GPT-5.5");
    expect(result.posts[0]!.summary).not.toContain('<p>');
    expect(result.posts[0]!.summary).not.toContain('CDATA');
  });

  it('uses dc:creator when author is absent', () => {
    expect(result.posts[0]!.author).toBe('OpenAI Research');
  });
});

describe('parseFeed (Atom)', () => {
  const result = parseFeed(fixture('hf-blog-atom.xml'));

  it('detects Atom dialect', () => {
    expect(result.format).toBe('atom');
  });

  it('uses link[rel=alternate]', () => {
    expect(result.posts[0]!.url).toBe('https://huggingface.co/blog/leaderboard-v3');
  });

  it('parses Atom updated timestamp', () => {
    expect(result.posts[0]!.publishedAt).toBe('2026-04-26T17:30:00.000Z');
  });

  it('reads author/name', () => {
    expect(result.posts[0]!.author).toBe('HF Team');
  });

  it('preserves arxiv URLs in summary for cross-link', () => {
    expect(result.posts[0]!.summary).toContain('arxiv.org/pdf/2604.99912');
  });
});

describe('parseFeed (errors)', () => {
  it('returns unknown for non-RSS input', () => {
    const result = parseFeed('<html><body>not a feed</body></html>');
    expect(result.format).toBe('unknown');
    expect(result.posts).toHaveLength(0);
  });

  it('handles empty input', () => {
    const result = parseFeed('');
    expect(result.format).toBe('unknown');
    expect(result.errors[0]?.reason).toBe('empty-input');
  });
});
