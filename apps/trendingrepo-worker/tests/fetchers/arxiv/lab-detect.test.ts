import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArxivAtom } from '../../../src/fetchers/arxiv/atom-parser.js';
import { detectLab } from '../../../src/fetchers/arxiv/lab-detect.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const xml = readFileSync(join(__dirname, 'fixtures', 'arxiv-cs-ai-page1.xml'), 'utf8');

describe('detectLab', () => {
  const papers = parseArxivAtom(xml).papers;

  it('matches OpenAI on entry 1', () => {
    const m = detectLab(papers[0]!);
    expect(m).not.toBeNull();
    expect(m!.labId).toBe('openai');
    expect(m!.lab.boost).toBe(1.15);
  });

  it('matches DeepMind on entry 2', () => {
    const m = detectLab(papers[1]!);
    expect(m).not.toBeNull();
    expect(m!.labId).toBe('deepmind');
  });

  it('returns null for unaffiliated paper', () => {
    expect(detectLab(papers[2]!)).toBeNull();
  });
});
