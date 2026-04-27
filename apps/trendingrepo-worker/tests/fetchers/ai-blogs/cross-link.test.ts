import { describe, expect, it } from 'vitest';
import { extractCrossLinks } from '../../../src/fetchers/ai-blogs/cross-link.js';

describe('extractCrossLinks', () => {
  it('pulls a single arxiv id from text containing a URL', () => {
    const result = extractCrossLinks('See https://arxiv.org/abs/2604.55512 for benchmarks.');
    expect(result.arxivIds).toEqual(['2604.55512']);
  });

  it('pulls multiple distinct arxiv ids in source order', () => {
    const result = extractCrossLinks('arxiv:2604.11111 and https://arxiv.org/pdf/2604.22222v3.pdf');
    expect(result.arxivIds).toEqual(['2604.11111', '2604.22222']);
  });

  it('returns empty array for null/empty input', () => {
    expect(extractCrossLinks(null).arxivIds).toEqual([]);
    expect(extractCrossLinks('').arxivIds).toEqual([]);
    expect(extractCrossLinks(undefined).arxivIds).toEqual([]);
  });
});
