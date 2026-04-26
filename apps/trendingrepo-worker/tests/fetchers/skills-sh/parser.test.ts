import { describe, it, expect } from 'vitest';
import {
  parseInstallCount,
  parseFromExtract,
  parseFromHtml,
  filterToKnownAgents,
  looksEmpty,
} from '../../../src/fetchers/skills-sh/parser.js';

describe('parseInstallCount', () => {
  it('handles common formats', () => {
    expect(parseInstallCount('1.2M')).toBe(1_200_000);
    expect(parseInstallCount('350.0K')).toBe(350_000);
    expect(parseInstallCount('2,540')).toBe(2540);
    expect(parseInstallCount('75')).toBe(75);
    expect(parseInstallCount('1B')).toBe(1_000_000_000);
    expect(parseInstallCount('  42 installs ')).toBe(42);
  });
  it('returns null on garbage', () => {
    expect(parseInstallCount('')).toBeNull();
    expect(parseInstallCount(null)).toBeNull();
    expect(parseInstallCount('about a million')).toBeNull();
  });
  it('passes through finite numbers', () => {
    expect(parseInstallCount(99)).toBe(99);
    expect(parseInstallCount(99.7)).toBe(100);
  });
});

describe('parseFromExtract', () => {
  it('normalises a clean extract response', () => {
    const rows = parseFromExtract({
      extracted: {
        skills: [
          {
            rank: 1,
            skill_name: 'find-skills',
            owner: 'vercel-labs',
            repo: 'skills',
            installs: '1.2M',
            agents: ['claude-code', 'openclaw'],
            url: 'https://skills.sh/vercel-labs/skills/find-skills',
          },
          {
            rank: 2,
            skill_name: 'auth-helper',
            owner: 'someone',
            repo: 'their-skills',
            installs: '320',
            agents: ['cursor'],
          },
        ],
      },
      view: 'all-time',
      fetchedAt: '2026-04-26T12:00:00Z',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.installs).toBe(1_200_000);
    expect(rows[0]?.agents).toEqual(['claude-code', 'openclaw']);
    expect(rows[0]?.source_id).toBe('vercel-labs/skills/find-skills');
    expect(rows[0]?.github_url).toBe('https://github.com/vercel-labs/skills/tree/main/find-skills');
    expect(rows[1]?.installs).toBe(320);
  });

  it('skips rows missing required fields', () => {
    const rows = parseFromExtract({
      extracted: {
        skills: [
          { rank: 1, skill_name: 'x', owner: '', repo: 'r', installs: '10', agents: [] },
          { rank: 2, skill_name: 'y', owner: 'o', repo: 'r', installs: '5', agents: [] },
        ],
      },
      view: 'all-time',
      fetchedAt: '2026-04-26T12:00:00Z',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.skill_name).toBe('y');
  });

  it('handles null/missing extract gracefully', () => {
    expect(parseFromExtract({ extracted: null, view: 'all-time', fetchedAt: 'x' })).toEqual([]);
    expect(parseFromExtract({ extracted: undefined, view: 'all-time', fetchedAt: 'x' })).toEqual([]);
    expect(parseFromExtract({ extracted: { skills: undefined }, view: 'all-time', fetchedAt: 'x' })).toEqual([]);
  });
});

describe('parseFromHtml fallback', () => {
  const html = `
    <a href="/vercel-labs/skills/find-skills" class="grid-cols-16">
      <img src="https://skills.sh/agents/claude-code.svg" alt="claude-code" />
      <img src="https://skills.sh/agents/openclaw.svg" alt="openclaw" />
    </a>
    <a href="/foo/bar/baz" class="grid-cols-16">
      <img src="https://skills.sh/agents/cursor.svg" alt="cursor" />
    </a>
  `;
  it('extracts skills + their nearby agent icons', () => {
    const rows = parseFromHtml({ html, view: 'all-time', fetchedAt: '2026-04-26T12:00:00Z' });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.source_id).toBe('vercel-labs/skills/find-skills');
    expect(rows[0]?.agents).toContain('claude-code');
    expect(rows[0]?.agents).toContain('openclaw');
    expect(rows[1]?.agents).toEqual(['cursor']);
  });
});

describe('filterToKnownAgents', () => {
  it('drops unknown slugs while preserving known ones', () => {
    const filtered = filterToKnownAgents([
      {
        rank: 1,
        skill_name: 's',
        owner: 'o',
        repo: 'r',
        source_id: 'o/r/s',
        url: 'https://skills.sh/o/r/s',
        github_url: 'https://github.com/o/r/tree/main/s',
        installs: 100,
        agents: ['claude-code', 'made-up', 'openclaw', 'also-fake'],
        view: 'all-time',
        fetchedAt: 'x',
      },
    ]);
    expect(filtered[0]?.agents).toEqual(['claude-code', 'openclaw']);
  });
});

describe('looksEmpty', () => {
  it('flags below threshold', () => {
    expect(looksEmpty([], 10)).toBe(true);
    expect(looksEmpty(new Array(5).fill({}), 10)).toBe(true);
  });
  it('passes above threshold', () => {
    expect(looksEmpty(new Array(20).fill({}), 10)).toBe(false);
  });
});
