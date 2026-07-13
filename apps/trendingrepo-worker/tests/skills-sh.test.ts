import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import type { HttpClient } from '../src/lib/types.js';
import { parseFromHtml } from '../src/fetchers/skills-sh/parser.js';
import { scrapeSkillsSh } from '../src/fetchers/skills-sh/scraper.js';

const HTML_FIXTURE = resolve(__dirname, 'fixtures/skills-sh-response.html');
const loadHtml = () => readFileSync(HTML_FIXTURE, 'utf8');
function silentLogger(): Logger {
  const noop = () => undefined;
  return { info: noop, warn: noop, debug: noop, error: noop, trace: noop, fatal: noop, child: () => silentLogger() } as unknown as Logger;
}

describe('skills.sh native SSR parser', () => {
  it('extracts consumer-ready rows from the captured upstream response', () => {
    const rows = parseFromHtml({ html: loadHtml(), view: 'all-time', fetchedAt: '2026-04-29T00:00:00Z' });
    expect(rows.length).toBeGreaterThanOrEqual(50);
    for (const row of rows.slice(0, 10)) {
      expect(row.source_id).toBe(`${row.owner}/${row.repo}/${row.skill_name}`);
      expect(row.url.startsWith('https://skills.sh/')).toBe(true);
      expect(row.github_url.startsWith('https://github.com/')).toBe(true);
    }
  });

  it('runs end-to-end through bounded native HTTP', async () => {
    const http = { json: vi.fn(), text: vi.fn(async () => ({ data: loadHtml(), cached: false })) } as unknown as HttpClient;
    const result = await scrapeSkillsSh({ http, log: silentLogger(), fetchedAt: '2026-04-29T00:00:00Z' }, { views: ['all-time'] });
    expect(result.rows.length).toBeGreaterThanOrEqual(50);
    expect(http.text).toHaveBeenCalledOnce();
    expect(http.json).not.toHaveBeenCalled();
  });

  it('degrades to zero rows without throwing on transport failure', async () => {
    const http = { json: vi.fn(), text: vi.fn(async () => { throw new Error('network down'); }) } as unknown as HttpClient;
    const result = await scrapeSkillsSh({ http, log: silentLogger(), fetchedAt: '2026-04-29T00:00:00Z' }, { views: ['all-time'] });
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ stage: 'fetch-all-time', message: 'network down' }]);
  });
});
