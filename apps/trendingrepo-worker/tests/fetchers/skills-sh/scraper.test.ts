import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import type { HttpClient } from '../../../src/lib/types.js';
import { chooseViewsForHour, mergeRowsAcrossViews, scrapeSkillsSh } from '../../../src/fetchers/skills-sh/scraper.js';
import type { SkillRow, SkillView } from '../../../src/fetchers/skills-sh/types.js';

function silentLogger(): Logger {
  const noop = () => undefined;
  return { info: noop, warn: noop, debug: noop, error: noop, trace: noop, fatal: noop, child: () => silentLogger() } as unknown as Logger;
}

function row(view: SkillView, owner: string, repo: string, skill: string, agents: string[]): SkillRow {
  return { rank: 1, skill_name: skill, owner, repo, source_id: `${owner}/${repo}/${skill}`, url: `https://skills.sh/${owner}/${repo}/${skill}`, github_url: `https://github.com/${owner}/${repo}/tree/main/${skill}`, installs: null, agents, view, fetchedAt: '2026-04-26T00:00:00Z' };
}

const html = `<a href="/vercel-labs/skills/find-skills" class="grid-cols-16"><img src="/agents/claude-code.svg"><span class="font-mono">1.2K</span></a>`;

describe('chooseViewsForHour', () => {
  it('selects the expected views', () => {
    expect(chooseViewsForHour(4)).toEqual(['all-time', 'trending', 'hot']);
    expect(chooseViewsForHour(2)).toEqual(['trending', 'hot']);
    expect(chooseViewsForHour(0)).toEqual(['hot']);
  });
});

describe('mergeRowsAcrossViews', () => {
  it('deduplicates and unions agents', () => {
    const merged = mergeRowsAcrossViews({ 'all-time': [row('all-time', 'a', 'b', 'c', ['claude-code'])], trending: [row('trending', 'a', 'b', 'c', ['cursor'])] });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.agents.sort()).toEqual(['claude-code', 'cursor']);
  });
});

describe('scrapeSkillsSh native HTTP path', () => {
  it('uses only the bounded HTTP client and parses SSR HTML', async () => {
    const http = { json: vi.fn(), text: vi.fn(async () => ({ data: html, cached: false })) } as unknown as HttpClient;
    const result = await scrapeSkillsSh({ http, log: silentLogger(), fetchedAt: '2026-04-26T00:00:00Z' }, { views: ['all-time'] });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.source_id).toBe('vercel-labs/skills/find-skills');
    expect(http.text).toHaveBeenCalledWith('https://skills.sh/', expect.objectContaining({ timeoutMs: 30_000, maxRetries: 1 }));
    expect(http.json).not.toHaveBeenCalled();
  });
});
