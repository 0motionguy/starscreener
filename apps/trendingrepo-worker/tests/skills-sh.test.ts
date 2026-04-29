// Integration coverage for the skills.sh fetcher against captured upstream
// responses. Two fixtures, two paths:
//
//   tests/fixtures/skills-sh-response.html  — real GET https://skills.sh/
//                                              capture (272 KB, 2026-04-29).
//                                              Exercises the direct-http +
//                                              cheerio/regex parse path that
//                                              runs on Railway when
//                                              FIRECRAWL_API_KEY is unset.
//
//   tests/fixtures/skills-sh-response.json  — synthetic shape mirroring what
//                                              Firecrawl's formats:['json']
//                                              extract returns. Exercises the
//                                              parseFromExtract path that
//                                              runs when Firecrawl is enabled.
//
// These tests guard against the regression that left /skills showing
// "0 SKLSH": pre-fix the fetcher had requiresFirecrawl=true, so the runner
// short-circuited to 0 items on Railway and the page rendered with no rows
// even though skills.sh upstream was healthy. The fix added a direct-http
// fallback so the fetcher works without a Firecrawl key.
//
// Both tests assert the rows carry the fields the /skills page consumer
// (coerceSkillsShItem in src/lib/ecosystem-leaderboards.ts) reads:
// owner, repo, skill_name, source_id, url, github_url, installs, agents.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Logger } from 'pino';
import { scrapeSkillsSh } from '../src/fetchers/skills-sh/scraper.js';
import { parseFromExtract, parseFromHtml, filterToKnownAgents } from '../src/fetchers/skills-sh/parser.js';
import type {
  FirecrawlLike,
  ScrapeJsonResult,
  ScrapeHtmlResult,
} from '../src/fetchers/skills-sh/client.js';
import type { HttpClient } from '../src/lib/types.js';

const HTML_FIXTURE = resolve(__dirname, 'fixtures/skills-sh-response.html');
const JSON_FIXTURE = resolve(__dirname, 'fixtures/skills-sh-response.json');

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

function loadHtmlFixture(): string {
  return readFileSync(HTML_FIXTURE, 'utf8');
}

function loadJsonFixture(): unknown {
  const parsed = JSON.parse(readFileSync(JSON_FIXTURE, 'utf8')) as Record<string, unknown>;
  // Strip the documentation field so it doesn't leak into shape assertions.
  // The fixture-as-JSON shape feeds parseFromExtract, which only looks at
  // `skills`. _comment is intentionally ignored.
  delete parsed._comment;
  return parsed;
}

describe('skills-sh parser (direct HTML path)', () => {
  it('parseFromHtml extracts >= 1 row from the captured skills.sh response', () => {
    const html = loadHtmlFixture();
    const rows = parseFromHtml({
      html,
      view: 'all-time',
      fetchedAt: '2026-04-29T00:00:00Z',
    });
    expect(rows.length).toBeGreaterThan(0);
    // The live capture had 189 rows. Assert generously to absorb upstream
    // pagination growth/shrinkage without making the test brittle.
    expect(rows.length).toBeGreaterThanOrEqual(50);
  });

  it('every parsed row exposes the fields the /skills page consumer reads', () => {
    const html = loadHtmlFixture();
    const rows = parseFromHtml({
      html,
      view: 'all-time',
      fetchedAt: '2026-04-29T00:00:00Z',
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.skill_name).toBe('string');
      expect(row.skill_name.length).toBeGreaterThan(0);
      expect(typeof row.owner).toBe('string');
      expect(typeof row.repo).toBe('string');
      expect(row.source_id).toBe(`${row.owner}/${row.repo}/${row.skill_name}`);
      expect(row.url.startsWith('https://skills.sh/')).toBe(true);
      expect(row.github_url.startsWith('https://github.com/')).toBe(true);
      expect(row.view).toBe('all-time');
      expect(Array.isArray(row.agents)).toBe(true);
    }
  });

  it('captures install counts from the leaderboard rows', () => {
    const html = loadHtmlFixture();
    const rows = parseFromHtml({
      html,
      view: 'all-time',
      fetchedAt: '2026-04-29T00:00:00Z',
    });
    const withInstalls = rows.filter((r) => typeof r.installs === 'number' && (r.installs ?? 0) > 0);
    // Most rows on skills.sh have a visible install count. Allow some
    // long-tail rows to render without one (e.g. brand-new skills).
    expect(withInstalls.length).toBeGreaterThanOrEqual(Math.floor(rows.length * 0.5));
  });
});

describe('skills-sh parser (Firecrawl JSON-extract path)', () => {
  it('parseFromExtract returns >= 1 item from the JSON fixture', () => {
    const fixture = loadJsonFixture() as { skills: unknown[] };
    const rows = parseFromExtract({
      extracted: fixture,
      view: 'all-time',
      fetchedAt: '2026-04-29T00:00:00Z',
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBe(fixture.skills.length);
  });

  it('preserves required consumer fields and parses install K/M suffixes', () => {
    const fixture = loadJsonFixture();
    const rows = filterToKnownAgents(
      parseFromExtract({
        extracted: fixture as { skills: unknown[] },
        view: 'all-time',
        fetchedAt: '2026-04-29T00:00:00Z',
      }),
    );
    expect(rows.length).toBeGreaterThan(0);
    const findSkills = rows.find((r) => r.skill_name === 'find-skills');
    expect(findSkills).toBeDefined();
    expect(findSkills?.installs).toBe(1_200_000);
    expect(findSkills?.source_id).toBe('vercel-labs/skills/find-skills');
    expect(findSkills?.github_url).toBe('https://github.com/vercel-labs/skills/tree/main/find-skills');
    expect(findSkills?.agents).toEqual(expect.arrayContaining(['claude-code']));
  });
});

describe('skills-sh end-to-end without Firecrawl (regression: 0-rows-on-Railway)', () => {
  it('scrapeSkillsSh produces rows when firecrawl=null by hitting ctx.http directly', async () => {
    const html = loadHtmlFixture();
    // Stub HttpClient that always returns the captured HTML. This simulates
    // the Railway production path where FIRECRAWL_API_KEY is unset and the
    // fetcher falls back to a direct fetch via ctx.http.text().
    const httpStub: HttpClient = {
      json: vi.fn(),
      text: vi.fn(async () => ({ data: html, cached: false })),
    } as unknown as HttpClient;

    const result = await scrapeSkillsSh(
      {
        firecrawl: null,
        http: httpStub,
        log: silentLogger(),
        fetchedAt: '2026-04-29T00:00:00Z',
      },
      { views: ['all-time'] },
    );

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.perView['all-time']).toBe(result.rows.length);
    expect(httpStub.text).toHaveBeenCalledWith(
      'https://skills.sh/',
      expect.objectContaining({ useEtagCache: false }),
    );
    // Must NOT regress to 0 even when no agents come through (live HTML has
    // agent icons rendered outside the row anchor on some layouts).
    for (const row of result.rows.slice(0, 5)) {
      expect(row.skill_name.length).toBeGreaterThan(0);
      expect(row.source_id).toContain('/');
    }
  });

  it('returns 0 rows gracefully (not a throw) when ctx.http rejects', async () => {
    const httpStub: HttpClient = {
      json: vi.fn(),
      text: vi.fn(async () => {
        throw new Error('network down');
      }),
    } as unknown as HttpClient;

    const result = await scrapeSkillsSh(
      {
        firecrawl: null,
        http: httpStub,
        log: silentLogger(),
        fetchedAt: '2026-04-29T00:00:00Z',
      },
      { views: ['all-time'] },
    );
    expect(result.rows).toHaveLength(0);
    expect(result.perView['all-time']).toBe(0);
  });
});

describe('skills-sh fallback when Firecrawl returns nothing', () => {
  it('falls through from empty Firecrawl HTML to direct ctx.http fetch', async () => {
    const html = loadHtmlFixture();

    const firecrawlStub: FirecrawlLike = {
      async scrapeJson<T>(): Promise<ScrapeJsonResult<T>> {
        return { data: null, statusCode: 200, warning: null };
      },
      async scrapeHtml(): Promise<ScrapeHtmlResult> {
        // Simulate Firecrawl returning empty HTML — common when the LLM
        // tier of Firecrawl bills the call but the underlying browser
        // didn't get past a CDN challenge.
        return { html: null, statusCode: 200, warning: null };
      },
    };
    const httpStub: HttpClient = {
      json: vi.fn(),
      text: vi.fn(async () => ({ data: html, cached: false })),
    } as unknown as HttpClient;

    const result = await scrapeSkillsSh(
      {
        firecrawl: firecrawlStub,
        http: httpStub,
        log: silentLogger(),
        fetchedAt: '2026-04-29T00:00:00Z',
      },
      { views: ['all-time'] },
    );
    // direct-http rescue path should populate rows from the HTML fixture.
    expect(result.rows.length).toBeGreaterThan(0);
    expect(httpStub.text).toHaveBeenCalled();
  });
});
