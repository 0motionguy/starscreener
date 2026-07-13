// Orchestrates skills.sh leaderboard scraping. Pulled out of index.ts so
// tests can drive the full multi-view pipeline without touching the cron /
// Redis publish path.
//
// Responsibilities:
//   1. Fetch each server-rendered leaderboard view with the bounded worker
//      HTTP client and parse it locally with cheerio/regex.
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
  filterToKnownAgents,
  parseFromHtml,
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
  http: HttpClient;
  log: Logger;
  fetchedAt: string;
}

/** Match the desktop UA skills.sh expects; some CDNs 403 generic Node UAs. */
const SKILLS_SH_USER_AGENT =
  'Mozilla/5.0 (compatible; trendingrepo-worker/1.0; +https://trendingrepo.com)';

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
      const rows = await fetchOneView(deps, target.url, view);
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

/**
 * Hits the public skills.sh URL with a desktop User Agent and parses the
 * SSR-rendered HTML with cheerio (with the regex backstop). Transport errors
 * bubble to the per-view handler so partial results still publish with a
 * diagnostic for the failed view.
 */
async function fetchOneView(
  deps: ScrapeDeps,
  url: string,
  view: SkillView,
): Promise<SkillRow[]> {
  // 30s (above 20s policy default) — skills.sh SSR pulls down the full
  // leaderboard HTML; with all rows + agent metadata it tops 20s on
  // cold-cache hits.
  const { data: html } = await deps.http.text(url, {
    useEtagCache: false,
    timeoutMs: 30_000,
    maxRetries: 1,
    headers: {
      'user-agent': SKILLS_SH_USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
    },
  });
  return html ? parseFromHtml({ html, view, fetchedAt: deps.fetchedAt }) : [];
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
