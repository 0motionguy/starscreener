import { describe, expect, it } from 'vitest';
import {
  arxivAbsUrl, arxivPdfUrl, arxivSlug,
  canonicalizeArxivAtomId, extractArxivIds,
} from '../../../src/lib/util/arxiv-ids.js';

describe('extractArxivIds', () => {
  it('extracts new-format ids from abs/pdf/html URLs', () => {
    expect(extractArxivIds('https://arxiv.org/abs/2511.12345')).toEqual(['2511.12345']);
    expect(extractArxivIds('http://arxiv.org/pdf/2511.12345v3.pdf')).toEqual(['2511.12345']);
    expect(extractArxivIds('https://arxiv.org/html/2511.12345v1')).toEqual(['2511.12345']);
  });

  it('extracts old-format ids and preserves archive case', () => {
    expect(extractArxivIds('https://arxiv.org/abs/cs.AI/0301001')).toEqual(['cs.AI/0301001']);
    expect(extractArxivIds('cs.AI/0301001')).toEqual(['cs.AI/0301001']);
  });

  it('handles arxiv: prefix and DOI form', () => {
    expect(extractArxivIds('arXiv:2511.12345v2')).toEqual(['2511.12345']);
    expect(extractArxivIds('arxiv: 2511.12345')).toEqual(['2511.12345']);
    expect(extractArxivIds('10.48550/arXiv.2511.12345')).toEqual(['2511.12345']);
  });

  it('extracts standalone new-format ids in plain text', () => {
    expect(extractArxivIds('see paper 2511.12345 for details')).toEqual(['2511.12345']);
  });

  it('does not match unrelated decimal numbers', () => {
    expect(extractArxivIds('version 2.4.123')).toEqual([]);
    expect(extractArxivIds('phone 555.1234.5678')).toEqual([]);
  });

  it('dedupes across patterns', () => {
    const text = 'See arXiv:2511.12345 also https://arxiv.org/pdf/2511.12345v2.pdf';
    expect(extractArxivIds(text)).toEqual(['2511.12345']);
  });

  it('preserves source order', () => {
    const text = 'arxiv:2511.11111 and https://arxiv.org/abs/2511.22222 and 2511.33333';
    expect(extractArxivIds(text)).toEqual(['2511.11111', '2511.22222', '2511.33333']);
  });

  it('returns empty array for null/undefined/empty input', () => {
    expect(extractArxivIds('')).toEqual([]);
    expect(extractArxivIds(null as unknown as string)).toEqual([]);
    expect(extractArxivIds(undefined as unknown as string)).toEqual([]);
  });
});

describe('canonicalizeArxivAtomId', () => {
  it('canonicalizes the Atom <id> URL form', () => {
    expect(canonicalizeArxivAtomId('http://arxiv.org/abs/2511.12345v1')).toBe('2511.12345');
    expect(canonicalizeArxivAtomId('https://arxiv.org/abs/2511.12345')).toBe('2511.12345');
  });

  it('returns null for non-arxiv URLs', () => {
    expect(canonicalizeArxivAtomId('https://example.com/foo')).toBeNull();
  });
});

describe('URL builders', () => {
  it('builds canonical abs/pdf URLs and slug', () => {
    expect(arxivAbsUrl('2511.12345')).toBe('https://arxiv.org/abs/2511.12345');
    expect(arxivPdfUrl('2511.12345')).toBe('https://arxiv.org/pdf/2511.12345.pdf');
    expect(arxivSlug('2511.12345')).toBe('arxiv-2511-12345');
    expect(arxivSlug('cs.AI/0301001')).toBe('arxiv-cs-AI-0301001');
  });
});
