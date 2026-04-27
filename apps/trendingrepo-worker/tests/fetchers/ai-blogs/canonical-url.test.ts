import { describe, expect, it } from 'vitest';
import { canonicalUrl } from '../../../src/lib/feeds/canonical-url.js';

describe('canonicalUrl', () => {
  it('drops utm_* and ref tracking params', () => {
    expect(canonicalUrl('https://openai.com/news/gpt-5?utm_source=email&utm_medium=share&ref=tw'))
      .toBe('https://openai.com/news/gpt-5');
  });

  it('drops common ad-network ids', () => {
    expect(canonicalUrl('https://x.ai/news/post?gclid=abc&mc_cid=def&fbclid=g'))
      .toBe('https://x.ai/news/post');
  });

  it('preserves non-tracking params and sorts them', () => {
    expect(canonicalUrl('https://stability.ai/news?format=rss&page=2'))
      .toBe('https://stability.ai/news?format=rss&page=2');
    expect(canonicalUrl('https://stability.ai/news?page=2&format=rss'))
      .toBe('https://stability.ai/news?format=rss&page=2');
  });

  it('strips fragment', () => {
    expect(canonicalUrl('https://anthropic.com/news/post#section-2'))
      .toBe('https://anthropic.com/news/post');
  });

  it('lowercases host but preserves path case', () => {
    expect(canonicalUrl('https://HuggingFace.CO/blog/Title-With-Caps'))
      .toBe('https://huggingface.co/blog/Title-With-Caps');
  });

  it('strips trailing slash on non-root paths', () => {
    expect(canonicalUrl('https://research.google/blog/post-name/'))
      .toBe('https://research.google/blog/post-name');
    expect(canonicalUrl('https://research.google/'))
      .toBe('https://research.google/');
  });

  it('returns null for invalid or non-http URLs', () => {
    expect(canonicalUrl('')).toBeNull();
    expect(canonicalUrl('not a url')).toBeNull();
    expect(canonicalUrl('ftp://example.com/file')).toBeNull();
  });

  it('drops default ports', () => {
    expect(canonicalUrl('https://example.com:443/post'))
      .toBe('https://example.com/post');
    expect(canonicalUrl('http://example.com:80/post'))
      .toBe('http://example.com/post');
  });
});
