import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArxivAtom } from '../../../src/fetchers/arxiv/atom-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseArxivAtom', () => {
  it('parses opensearch counts and entry list', () => {
    const result = parseArxivAtom(fixture('arxiv-cs-ai-page1.xml'));
    expect(result.totalResults).toBe(427);
    expect(result.papers).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it('canonicalizes ids, strips title whitespace, resolves URLs', () => {
    const result = parseArxivAtom(fixture('arxiv-cs-ai-page1.xml'));
    const first = result.papers[0]!;
    expect(first.id).toBe('2604.12345');
    expect(first.title).toBe('Scaling Mixture-of-Experts with Curriculum Learning for Multi-Agent Reasoning');
    expect(first.absUrl).toBe('https://arxiv.org/abs/2604.12345');
    expect(first.pdfUrl).toBe('https://arxiv.org/pdf/2604.12345.pdf');
  });

  it('extracts authors, affiliations, categories, namespaced fields', () => {
    const result = parseArxivAtom(fixture('arxiv-cs-ai-page1.xml'));
    const first = result.papers[0]!;
    expect(first.authors).toEqual(['Alice Researcher', 'Bob Coauthor']);
    expect(first.firstAuthor).toBe('Alice Researcher');
    expect(first.affiliations).toEqual(['OpenAI']);
    expect(first.primaryCategory).toBe('cs.AI');
    expect(first.categories).toEqual(['cs.AI', 'cs.LG', 'cs.MA']);
    expect(first.doi).toBe('10.48550/arXiv.2604.12345');
    expect(first.comment).toContain('12 pages');
  });

  it('handles entries without arxiv-affiliation', () => {
    const result = parseArxivAtom(fixture('arxiv-cs-ai-page1.xml'));
    const third = result.papers[2]!;
    expect(third.id).toBe('2604.55555');
    expect(third.affiliations).toEqual([]);
    expect(third.firstAuthor).toBe('Dave Solo');
  });

  it('handles an empty feed', () => {
    const result = parseArxivAtom(fixture('arxiv-empty.xml'));
    expect(result.papers).toHaveLength(0);
  });

  it('returns soft errors for malformed input', () => {
    const result = parseArxivAtom('<not a real atom feed>');
    expect(result.papers).toHaveLength(0);
  });
});
