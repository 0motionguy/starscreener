import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArxivAtom } from '../../../src/fetchers/arxiv/atom-parser.js';
import { extractTags } from '../../../src/fetchers/arxiv/tag-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const xml = readFileSync(join(__dirname, 'fixtures', 'arxiv-cs-ai-page1.xml'), 'utf8');

describe('extractTags', () => {
  const papers = parseArxivAtom(xml).papers;

  it('maps arxiv categories to tag slugs', () => {
    const tags = extractTags(papers[0]!);
    expect(tags).toContain('tag:ai');
    expect(tags).toContain('tag:ml');
    expect(tags).toContain('tag:multi-agent');
  });

  it('detects model + technique mentions', () => {
    const tags = extractTags(papers[0]!);
    expect(tags).toContain('arch:moe');
    expect(tags).toContain('tech:rlhf');
    expect(tags).toContain('tech:cot');
    expect(tags).toContain('tech:agentic');
    expect(tags).toContain('tech:tool-use');
  });

  it('detects diffusion + VLM + Gemini on entry 2', () => {
    const tags = extractTags(papers[1]!);
    expect(tags).toContain('tech:diffusion');
    expect(tags).toContain('modality:vlm');
    expect(tags).toContain('model:gemini');
    expect(tags).toContain('eval:benchmark');
  });
});
