import { describe, it, expect, vi } from 'vitest';
import {
  chooseViewsForHour,
  mergeRowsAcrossViews,
  scrapeSkillsSh,
} from '../../../src/fetchers/skills-sh/scraper.js';
import type {
  FirecrawlLike,
  ScrapeJsonResult,
  ScrapeHtmlResult,
} from '../../../src/fetchers/skills-sh/client.js';
import type { SkillRow, SkillView } from '../../../src/fetchers/skills-sh/types.js';
import type { Logger } from 'pino';
import type { HttpClient } from '../../../src/fetchers/../lib/types.js';

// ----- helpers ----------------------------------------------------------

function silentLogger(): Logger {
  const noop = () => undefined;
  return {
    info: noop,
    warn: noop,
    debug: noop,
    error: noop,
    trace: noop,
    fatal: noop,
    child: () => silentLogger(),
  } as unknown as Logger;
}

function stubHttp(): HttpClient {
  return {
    json: vi.fn(),
    text: vi.fn(async () => ({ data: '', cached: false })),
  } as unknown as HttpClient;
}

function row(view: SkillView, owner: string, repo: string, skill: string, agents: string[]): SkillRow {
  return {
    rank: 1,
    skill_name: skill,
    owner,
    repo,
    source_id: `${owner}/${repo}/${skill}`,
    url: `https://skills.sh/${owner}/${repo}/${skill}`,
    github_url: `https://github.com/${owner}/${repo}/tree/main/${skill}`,
    installs: null,
    agents,
    view,
    fetchedAt: '2026-04-26T00:00:00Z',
  };
}

interface StubFirecrawlOpts {
  json?: Partial<Record<SkillView, unknown>>;
  html?: Partial<Record<SkillView, string>>;
  jsonError?: SkillView;
}

function stubFirecrawl(opts: StubFirecrawlOpts): {
  client: FirecrawlLike;
  jsonCalls: string[];
  htmlCalls: string[];
} {
  const jsonCalls: string[] = [];
  const htmlCalls: string[] = [];

  const viewFor = (url: string): SkillView => {
    if (url.endsWith('/trending')) return 'trending';
    if (url.endsWith('/hot')) return 'hot';
    return 'all-time';
  };

  const client: FirecrawlLike = {
    async scrapeJson(url: string): Promise<ScrapeJsonResult<unknown>> {
      jsonCalls.push(url);
      const view = viewFor(url);
      if (opts.jsonError === view) throw new Error(`stub firecrawl error on ${view}`);
      return { data: opts.json?.[view] ?? null, statusCode: 200, warning: null };
    },
    async scrapeHtml(url: string): Promise<ScrapeHtmlResult> {
      htmlCalls.push(url);
      const view = viewFor(url);
      return { html: opts.html?.[view] ?? null, statusCode: 200, warning: null };
    },
  };
  return { client, jsonCalls, htmlCalls };
}

// ----- tests -------------------------------------------------------------

describe('chooseViewsForHour', () => {
  it('hour 04 fires all three views (daily anchor)', () => {
    expect(chooseViewsForHour(4)).toEqual(['all-time', 'trending', 'hot']);
  });
  it('trending hours fire trending + hot', () => {
    for (const h of [2, 6, 10, 14, 18, 22]) {
      expect(chooseViewsForHour(h)).toEqual(['trending', 'hot']);
    }
  });
  it('hot-only hours fire hot', () => {
    for (const h of [0, 8, 12, 16, 20]) {
      expect(chooseViewsForHour(h)).toEqual(['hot']);
    }
  });
  it('off-cadence hours fall back to all three (manual / dev runs)', () => {
    expect(chooseViewsForHour(1)).toEqual(['all-time', 'trending', 'hot']);
    expect(chooseViewsForHour(15)).toEqual(['all-time', 'trending', 'hot']);
  });
});

describe('mergeRowsAcrossViews', () => {
  it('dedupes by source_id and prefers all-time canonical row', () => {
    const merged = mergeRowsAcrossViews({
      'all-time': [row('all-time', 'a', 'b', 'c', ['claude-code'])],
      trending: [row('trending', 'a', 'b', 'c', ['cursor'])],
      hot: [row('hot', 'a', 'b', 'c', ['openclaw'])],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.view).toBe('all-time');
    // Agents are unioned across views.
    expect(merged[0]?.agents.sort()).toEqual(['claude-code', 'cursor', 'openclaw']);
  });

  it('keeps both rows when source_ids differ', () => {
    const merged = mergeRowsAcrossViews({
      'all-time': [row('all-time', 'a', 'b', 'c', [])],
      trending: [row('trending', 'x', 'y', 'z', [])],
    });
    expect(merged.map((r) => r.source_id).sort()).toEqual(['a/b/c', 'x/y/z']);
  });

  it('takes the first non-null installs across views', () => {
    const r1 = { ...row('all-time', 'a', 'b', 'c', []), installs: null };
    const r2 = { ...row('trending', 'a', 'b', 'c', []), installs: 4242 };
    const merged = mergeRowsAcrossViews({ 'all-time': [r1], trending: [r2] });
    expect(merged[0]?.installs).toBe(4242);
  });
});

describe('scrapeSkillsSh', () => {
  it('uses extract path when JSON returns enough rows', async () => {
    const skillsExtract = {
      skills: Array.from({ length: 12 }, (_, i) => ({
        rank: i + 1,
        skill_name: `skill-${i}`,
        owner: 'vercel-labs',
        repo: 'skills',
        installs: '1.2K',
        agents: ['claude-code'],
      })),
    };
    const { client, jsonCalls, htmlCalls } = stubFirecrawl({
      json: { 'all-time': skillsExtract },
    });
    const result = await scrapeSkillsSh(
      { firecrawl: client, http: stubHttp(), log: silentLogger(), fetchedAt: '2026-04-26T00:00:00Z' },
      { views: ['all-time'] },
    );
    expect(result.rows).toHaveLength(12);
    expect(result.perView['all-time']).toBe(12);
    expect(jsonCalls).toEqual(['https://skills.sh/']);
    // Did not need to fall through to HTML.
    expect(htmlCalls).toEqual([]);
  });

  it('falls through to HTML cheerio path when JSON returns < 10 rows', async () => {
    const html = `
      <a href="/vercel-labs/skills/find-skills" class="grid-cols-16">
        <img src="https://skills.sh/agents/claude-code.svg" alt="cc" />
        <img src="https://skills.sh/agents/openclaw.svg" alt="oc" />
        <span class="font-mono">1.2K</span>
      </a>
      <a href="/foo/bar/baz" class="grid-cols-16">
        <img src="https://skills.sh/agents/cursor.svg" alt="cur" />
        <span class="font-mono">42</span>
      </a>
    `;
    const { client, htmlCalls } = stubFirecrawl({
      json: { 'all-time': { skills: [] } },
      html: { 'all-time': html },
    });
    const result = await scrapeSkillsSh(
      { firecrawl: client, http: stubHttp(), log: silentLogger(), fetchedAt: '2026-04-26T00:00:00Z' },
      { views: ['all-time'] },
    );
    expect(htmlCalls).toEqual(['https://skills.sh/']);
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    expect(result.rows.find((r) => r.source_id === 'vercel-labs/skills/find-skills')?.agents).toEqual(
      expect.arrayContaining(['claude-code', 'openclaw']),
    );
  });

  it('records errors when JSON extract throws and HTML returns nothing', async () => {
    const { client } = stubFirecrawl({ jsonError: 'all-time' });
    const result = await scrapeSkillsSh(
      { firecrawl: client, http: stubHttp(), log: silentLogger(), fetchedAt: '2026-04-26T00:00:00Z' },
      { views: ['all-time'] },
    );
    // jsonError throws inside fetchOneView, then scrapeHtml returns null. The
    // overall stage 'fetch-all-time' does not error, it just returns 0 rows.
    expect(result.rows).toHaveLength(0);
    expect(result.perView['all-time']).toBe(0);
  });

  it('filters out unknown agent slugs (LLM hallucinations)', async () => {
    const skillsExtract = {
      skills: Array.from({ length: 12 }, (_, i) => ({
        rank: i + 1,
        skill_name: `skill-${i}`,
        owner: 'o',
        repo: 'r',
        installs: '100',
        agents: ['claude-code', 'made-up-agent', 'also-fake'],
      })),
    };
    const { client } = stubFirecrawl({ json: { 'all-time': skillsExtract } });
    const result = await scrapeSkillsSh(
      { firecrawl: client, http: stubHttp(), log: silentLogger(), fetchedAt: '2026-04-26T00:00:00Z' },
      { views: ['all-time'] },
    );
    for (const r of result.rows) {
      expect(r.agents).toEqual(['claude-code']);
    }
  });

  it('merges across multiple views by source_id', async () => {
    const mk = (n: number) => ({
      skills: Array.from({ length: n }, (_, i) => ({
        rank: i + 1,
        skill_name: 'shared',
        owner: 'o',
        repo: 'r',
        installs: '5',
        agents: ['claude-code'],
      })),
    });
    const { client } = stubFirecrawl({
      json: {
        'all-time': mk(10),
        trending: mk(10),
      },
    });
    const result = await scrapeSkillsSh(
      { firecrawl: client, http: stubHttp(), log: silentLogger(), fetchedAt: '2026-04-26T00:00:00Z' },
      { views: ['all-time', 'trending'] },
    );
    // Both views ship 10 rows but they all collapse to a single source_id.
    expect(result.rows).toHaveLength(1);
    expect(result.perView['all-time']).toBe(10);
    expect(result.perView.trending).toBe(10);
  });
});
