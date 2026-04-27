import { describe, it, expect } from 'vitest';
import { parseSkillMd } from '../../../src/fetchers/skills-sh/skill-md.js';

describe('parseSkillMd', () => {
  it('parses canonical Vercel Labs frontmatter', () => {
    const md = [
      '---',
      'description: "Find skills you have already authored on your machine"',
      'allowed-tools: ["Read", "Glob", "Grep"]',
      'version: "0.3.1"',
      'agents:',
      '  - claude-code',
      '  - openclaw',
      '  - cursor',
      '---',
      '',
      '# Find Skills',
      '',
      'Body content goes here.',
    ].join('\n');

    const out = parseSkillMd(md);
    expect(out.frontmatter).not.toBeNull();
    expect(out.frontmatter?.description).toBe('Find skills you have already authored on your machine');
    expect(out.frontmatter?.allowed_tools).toEqual(['Read', 'Glob', 'Grep']);
    expect(out.frontmatter?.version).toBe('0.3.1');
    expect(out.frontmatter?.agents).toEqual(['claude-code', 'openclaw', 'cursor']);
    expect(out.body).toContain('# Find Skills');
  });

  it('handles snake_case allowed_tools and comma-separated string', () => {
    const md = [
      '---',
      'allowed_tools: "Read, Write, Bash"',
      '---',
      '',
      'body',
    ].join('\n');

    const out = parseSkillMd(md);
    expect(out.frontmatter?.allowed_tools).toEqual(['Read', 'Write', 'Bash']);
  });

  it('captures hooks as a plain object', () => {
    const md = [
      '---',
      'hooks:',
      '  pre-run: "scripts/check-deps.sh"',
      '  post-run: "scripts/cleanup.sh"',
      '---',
      'body',
    ].join('\n');

    const out = parseSkillMd(md);
    expect(out.frontmatter?.hooks).toMatchObject({
      'pre-run': 'scripts/check-deps.sh',
      'post-run': 'scripts/cleanup.sh',
    });
  });

  it('preserves unknown frontmatter keys under .extra', () => {
    const md = [
      '---',
      'description: x',
      'tier: gold',
      'badges: ["new"]',
      '---',
      'body',
    ].join('\n');

    const out = parseSkillMd(md);
    expect(out.frontmatter?.extra).toMatchObject({ tier: 'gold', badges: ['new'] });
  });

  it('returns frontmatter:null when no fence is present', () => {
    const md = '# Just a title\n\nNo frontmatter here.';
    const out = parseSkillMd(md);
    expect(out.frontmatter).toBeNull();
    expect(out.body).toBe(md);
    expect(out.raw).toBe(md);
  });

  it('returns frontmatter:null on malformed YAML rather than throwing', () => {
    const md = ['---', 'description: "unclosed string', '---', 'body'].join('\n');
    const out = parseSkillMd(md);
    expect(out.frontmatter).toBeNull();
    expect(out.body).toBe('body');
  });

  it('coerces a numeric version to string', () => {
    const md = ['---', 'version: 2', '---', 'body'].join('\n');
    const out = parseSkillMd(md);
    expect(out.frontmatter?.version).toBe('2');
  });

  it('drops malformed string-list entries silently', () => {
    const md = [
      '---',
      'agents:',
      '  - claude-code',
      '  - ""',
      '  - openclaw',
      '---',
      'body',
    ].join('\n');
    const out = parseSkillMd(md);
    expect(out.frontmatter?.agents).toEqual(['claude-code', 'openclaw']);
  });

  it('strips a UTF-8 BOM at the start of the file', () => {
    const md = '﻿---\nversion: "1.0"\n---\nbody';
    const out = parseSkillMd(md);
    expect(out.frontmatter?.version).toBe('1.0');
  });

  it('handles CRLF line endings', () => {
    const md = ['---', 'version: "0.1"', '---', 'body'].join('\r\n');
    const out = parseSkillMd(md);
    expect(out.frontmatter?.version).toBe('0.1');
    expect(out.body).toBe('body');
  });
});
