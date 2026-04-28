// Orchestrates skills.sh leaderboard scraping. Pulled out of index.ts so
// that tests can drive the full multi-view pipeline against a mocked
// Firecrawl client without touching the cron / Redis publish path.
//
// Responsibilities:
//   1. For each requested view, call Firecrawl JSON extract -> parser. If
//      the extract returns < 10 rows (looksEmpty sentinel), fall through
//      to the HTML scrape + cheerio path.
//   2. Merge rows across views by source_id, preferring the all-time row
//      (canonical rank for velocity), unioning agents from every view.
//   3. Filter out unknown agent slugs (drops LLM hallucinations).
//   4. Optionally enrich the top-N rows with SKILL.md frontmatter from
//      raw.githubusercontent.com (Phase 3 enrichment, bounded by
//      `detailDepth`).
//
// Returns rows + per-view counts + structured errors. The caller is
// responsible for scoring + publishing.

import type { Logger } from 'pino';
import type { HttpClient } from '../../lib/types.js';
import {
  SKILLS_LEADERBOARD_PROMPT,
  SKILLS_LEADERBOARD_SCHEMA,
  type FirecrawlLike,
} from './client.js';
import {
  filterToKnownAgents,
  looksEmpty,
  parseFromExtract,
  parseFromHtml,
  type ExtractedShape,
} from './parser.js';
import { fetchSkillMd, type ParsedSkillMd } from './skill-md.js';
import type { SkillRow, SkillView } from './types.js';

export const SKILLS_SH_VIEWS: ReadonlyArray<{ view: SkillView; url: string }> = [
  { view: 'all-time', url: 'https://skills.sh/' },
  { view: 'trending', url: 'https://skills.sh/trending' },
  { view: 'hot', url: 'https://skills.sh/hot' },
];

export interface ScrapeOptions {
  views?: ReadonlyArray<SkillView>;
  /** Max rows to enrich with SKILL.md. 0 disables enrichment. Default 0. */
  detailDepth?: number;
  /** Max concurrent SKILL.md fetches. Default 8. */
  detailConcurrency?: number;
  firecrawlWaitMs?: number;
}

export interface ScrapeError {
  stage: string;
  message: string;
  itemSourceId?: string;
}

export interface ScrapeResult {
  rows: SkillRow[];
  details: Map<string, ParsedSkillMd>;
  perView: Record<SkillView, number>;
  errors: ScrapeError[];
}

export interface ScrapeDeps {
  firecrawl: FirecrawlLike;
  http: HttpClient;
  log: Logger;
  fetchedAt: string;
}

/**
 * Choose which views to fetch given the current UTC hour. See plan
 * "Cron strategy" table. Exported for the index.ts dispatcher and tests.
 */
export function chooseViewsForHour(hour: number): SkillView[] {
  if (hour === 4) return ['all-time', 'trending', 'hot'];
  if ([2, 6, 10, 14, 18, 22].includes(hour)) return ['trending', 'hot'];
  if ([0, 8, 12, 16, 20].includes(hour)) return ['hot'];
  // Off-cadence (manual / dev) = full sweep.
  return ['all-time', 'trending', 'hot'];
}

export async function scrapeSkillsSh(
  deps: ScrapeDeps,
  opts: ScrapeOptions = {},
): Promise<ScrapeResult> {
  const views = opts.views && opts.views.length > 0
    ? opts.views
    : chooseViewsForHour(new Date().getUTCHours());

  const errors: ScrapeError[] = [];
  const perView: Record<SkillView, number> = {
    'all-time': 0,
    trending: 0,
    hot: 0,
  };
  const rowsByView: Partial<Record<SkillView, SkillRow[]>> = {};

  for (const view of views) {
    const target = SKILLS_SH_VIEWS.find((v) => v.view === view);
    if (!target) continue;
    try {
      const rows = await fetchOneView(deps, target.url, view, opts.firecrawlWaitMs);
      rowsByView[view] = rows;
      perView[view] = rows.length;
      deps.log.info({ view, rows: rows.length }, 'skills-sh view fetched');
    } catch (err) {
      errors.push({ stage: `fetch-${view}`, message: (err as Error).message });
      deps.log.warn({ view, err: (err as Error).message }, 'skills-sh view failed');
    }
  }

  const merged = mergeRowsAcrossViews(rowsByView);
  const cleaned = filterToKnownAgents(merged);

  const details = new Map<string, ParsedSkillMd>();
  const detailDepth = opts.detailDepth ?? 0;
  if (detailDepth > 0 && cleaned.length > 0) {
    const top = cleaned.slice(0, detailDepth);
    const concurrency = Math.max(1, opts.detailConcurrency ?? 8);
    await runWithConcurrency(top, concurrency, async (row) => {
      try {
        const res = await fetchSkillMd({
          http: deps.http,
          owner: row.owner,
          repo: row.repo,
          skillName: row.skill_name,
        });
        if (res.found && res.parsed) {
          details.set(row.source_id, res.parsed);
        }
      } catch (err) {
        errors.push({
          stage: 'enrich-skill-md',
          message: (err as Error).message,
          itemSourceId: row.source_id,
        });
      }
    });
    deps.log.info({ enriched: details.size, attempted: top.length }, 'skills-sh skill-md enrichment done');
  }

  return { rows: cleaned, details, perView, errors };
}

async function fetchOneView(
  deps: ScrapeDeps,
  url: string,
  view: SkillView,
  waitMs?: number,
): Promise<SkillRow[]> {
  let rows: SkillRow[] = [];
  try {
    const { data, warning } = await deps.firecrawl.scrapeJson(
      url,
      SKILLS_LEADERBOARD_SCHEMA,
      SKILLS_LEADERBOARD_PROMPT,
      waitMs,
    );
    if (warning) deps.log.warn({ view, warning }, 'skills-sh json-extract returned warning');
    rows = parseFromExtract({
      extracted: (data ?? null) as ExtractedShape | null,
      view,
      fetchedAt: deps.fetchedAt,
    });
    if (!looksEmpty(rows, 10)) return rows;
    deps.log.warn(
      { view, extracted: rows.length },
      'skills-sh json-extract returned <10 rows - falling back to html parse',
    );
  } catch (err) {
    deps.log.warn({ view, err: (err as Error).message }, 'skills-sh json-extract threw - falling back');
  }

  const { html } = await deps.firecrawl.scrapeHtml(url, waitMs);
  if (!html) return rows;
  const htmlRows = parseFromHtml({ html, view, fetchedAt: deps.fetchedAt });
  return htmlRows.length > rows.length ? htmlRows : rows;
}

/**
 * Dedupe by source_id. Prefer the all-time row when we have it (canonical
 * rank for velocity); union agents from every view; take the first non-null
 * installs we see across views.
 */
export function mergeRowsAcrossViews(
  byView: Partial<Record<SkillView, SkillRow[]>>,
): SkillRow[] {
  const merged = new Map<string, SkillRow>();
  const order: SkillView[] = ['all-time', 'trending', 'hot'];
  for (const view of order) {
    const rows = byView[view];
    if (!rows) continue;
    for (const row of rows) {
      const existing = merged.get(row.source_id);
      if (!existing) {
        merged.set(row.source_id, { ...row, agents: [...row.agents] });
        continue;
      }
      const seen = new Set(existing.agents);
      for (const a of row.agents) seen.add(a);
      existing.agents = Array.from(seen);
      if (existing.installs === null && row.installs !== null) {
        existing.installs = row.installs;
      }
    }
  }
  return Array.from(merged.values());
}

async function runWithConcurrency<T>(
  items: ReadonlyArray<T>,
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      const item = items[i];
      if (item === undefined) continue;
      await task(item);
    }
  });
  await Promise.all(workers);
}
