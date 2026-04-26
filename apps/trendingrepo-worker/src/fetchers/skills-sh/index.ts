// skills.sh fetcher entry. Single registry registration that internally
// dispatches between three views (All Time / Trending 24h / Hot 4h) based
// on the current UTC hour. See plan: ~/.claude/plans/skills-sh-fetcher-plan.md
//
//   schedule        '15 */2 * * *'   - every 2h at :15 UTC
//   hour 04         All Time + Hot   - daily anchor + 4h window
//   hours 00,08,12,16,20  Hot       - 4h-window leaderboard
//   hours 02,06,10,14,18,22  Trending - 24h-window leaderboard
//
// Publishes union-of-views to ss:data:v1:trending-skill. claude-skills
// fetcher (already shipped, github-topic based) writes to the SAME slug and
// covers community skills not yet on skills.sh; this fetcher overwrites it
// because skills.sh installs are higher-fidelity than star counts.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { loadEnv } from '../../lib/env.js';
import {
  FirecrawlClient,
  SKILLS_LEADERBOARD_SCHEMA,
  SKILLS_LEADERBOARD_PROMPT,
} from './client.js';
import {
  parseFromExtract,
  parseFromHtml,
  parseFromMarkdown,
  filterToKnownAgents,
  looksEmpty,
  type ExtractedShape,
} from './parser.js';
import { scoreRow } from './scoring.js';
import { AGENT_REGISTRY_VERSION } from './agents.js';
import type {
  SkillRow,
  SkillView,
  SkillScored,
  SkillsLeaderboardPayload,
} from './types.js';

const VIEWS: ReadonlyArray<{ view: SkillView; url: string }> = [
  { view: 'all-time', url: 'https://skills.sh/' },
  { view: 'trending', url: 'https://skills.sh/trending' },
  { view: 'hot', url: 'https://skills.sh/hot' },
];

const fetcher: Fetcher = {
  name: 'skills-sh',
  schedule: '15 */2 * * *',
  requiresFirecrawl: true,
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('skills-sh dry-run');
      return done(startedAt, 0, false, []);
    }

    const env = loadEnv();
    if (!env.FIRECRAWL_API_KEY) {
      ctx.log.warn('FIRECRAWL_API_KEY not set - skills-sh skipped');
      return done(startedAt, 0, false, []);
    }

    const firecrawl = new FirecrawlClient({ http: ctx.http, apiKey: env.FIRECRAWL_API_KEY });

    const errors: RunResult['errors'] = [];
    const viewsToFetch = chooseViewsForCurrentHour();
    const rowsByView: Partial<Record<SkillView, SkillRow[]>> = {};

    for (const view of viewsToFetch) {
      const target = VIEWS.find((v) => v.view === view);
      if (!target) continue;
      try {
        const rows = await fetchView(firecrawl, target.url, view, startedAt, ctx);
        rowsByView[view] = rows;
        ctx.log.info({ view, rows: rows.length }, 'skills-sh view fetched');
      } catch (err) {
        errors.push({ stage: `fetch-${view}`, message: (err as Error).message });
      }
    }

    // Dedupe across views by source_id. Prefer the all-time row when we have
    // both - it carries the canonical rank for velocity computation.
    const merged = mergeRows(rowsByView);
    const cleaned = filterToKnownAgents(merged);
    const maxRank = Math.max(1, ...cleaned.map((r) => r.rank));

    // skills.sh doesn't expose pushed_at in the leaderboard; we leave it null
    // here and let a future Phase 3 enrichment pass populate it from
    // GitHub. recencyDecay falls back to 1 (no decay) when null.
    const scored: SkillScored[] = cleaned
      .map((r) => scoreRow(r, maxRank, null))
      .sort((a, b) => b.trending_score - a.trending_score)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    const openclawCount = scored.reduce((n, s) => (s.openclaw_compatible ? n + 1 : n), 0);

    const payload: SkillsLeaderboardPayload = {
      fetchedAt: new Date().toISOString(),
      windowItems: scored.length,
      views: {
        all_time: rowsByView['all-time']?.length ?? 0,
        trending: rowsByView.trending?.length ?? 0,
        hot: rowsByView.hot?.length ?? 0,
      },
      agentRegistryVersion: AGENT_REGISTRY_VERSION,
      items: scored,
      sources: {
        skills_sh_total_seen: cleaned.length,
        openclaw_compatible_count: openclawCount,
      },
    };

    const result = await writeDataStore('trending-skill', payload);
    ctx.log.info(
      {
        items: scored.length,
        openclawCount,
        views: payload.views,
        redisSource: result.source,
        writtenAt: result.writtenAt,
        errors: errors.length,
      },
      'skills-sh published',
    );

    return {
      fetcher: 'skills-sh',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: scored.length,
      itemsUpserted: 0,
      metricsWritten: 0,
      redisPublished: result.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

async function fetchView(
  client: FirecrawlClient,
  url: string,
  view: SkillView,
  fetchedAt: string,
  ctx: FetcherContext,
): Promise<SkillRow[]> {
  // Primary: Firecrawl markdown render (waitFor=12s lets skills.sh's deferred
  // XHR populate the leaderboard before snapshot). Captured pattern:
  //   1.2M](https://skills.sh/vercel-labs/skills/find-skills)
  // -> rank (positional), installs, owner, repo, skill_name. Per-row agents
  //    are NOT present in the markdown view (skills.sh surfaces agents
  //    platform-wide, not per-row); they're left empty for v1 and will be
  //    enriched from skill detail pages in Phase 3.
  let rows: SkillRow[] = [];
  try {
    const { markdown, html } = await client.scrapeMarkdown(url);
    if (markdown) {
      rows = parseFromMarkdown({ markdown, view, fetchedAt });
      if (!looksEmpty(rows, 10)) return rows;
      ctx.log.warn(
        { view, markdownRows: rows.length, mdLen: markdown.length },
        'skills-sh markdown parse returned <10 rows - trying html fallback',
      );
    }
    if (html) {
      const htmlRows = parseFromHtml({ html, view, fetchedAt });
      if (htmlRows.length > rows.length) return htmlRows;
    }
    return rows;
  } catch (err) {
    ctx.log.warn({ view, err: (err as Error).message }, 'skills-sh primary fetch threw - trying json-extract');
  }

  // Last-resort: structured JSON extract via LLM. Costs more per call but
  // robust against parser drift. Currently 500s; kept for when Firecrawl
  // restores the endpoint.
  try {
    const { data } = await client.scrapeJson<ExtractedShape>(
      url,
      SKILLS_LEADERBOARD_SCHEMA,
      SKILLS_LEADERBOARD_PROMPT,
    );
    const extractRows = parseFromExtract({ extracted: data, view, fetchedAt });
    return extractRows.length > rows.length ? extractRows : rows;
  } catch (err) {
    ctx.log.warn({ view, err: (err as Error).message }, 'skills-sh json-extract also failed');
    return rows;
  }
}

function mergeRows(byView: Partial<Record<SkillView, SkillRow[]>>): SkillRow[] {
  // Prefer all-time as canonical (gives rank for velocity); merge agents and
  // installs from any view where the all-time row was missing them.
  const merged = new Map<string, SkillRow>();
  const order: SkillView[] = ['all-time', 'trending', 'hot'];
  for (const view of order) {
    const rows = byView[view];
    if (!rows) continue;
    for (const r of rows) {
      const existing = merged.get(r.source_id);
      if (!existing) {
        merged.set(r.source_id, r);
        continue;
      }
      // Union of agents.
      const seen = new Set(existing.agents);
      for (const a of r.agents) seen.add(a);
      existing.agents = Array.from(seen);
      // Take the first non-null installs.
      if (existing.installs === null && r.installs !== null) existing.installs = r.installs;
    }
  }
  return Array.from(merged.values());
}

function chooseViewsForCurrentHour(): SkillView[] {
  const hour = new Date().getUTCHours();
  // Daily 04 anchor: all 3 views for full refresh.
  if (hour === 4) return ['all-time', 'trending', 'hot'];
  // Trending hours.
  if ([2, 6, 10, 14, 18, 22].includes(hour)) return ['trending', 'hot'];
  // Hot-only hours.
  if ([0, 8, 12, 16, 20].includes(hour)) return ['hot'];
  // Manual invocation outside cron - do all 3 so devs see full data.
  return ['all-time', 'trending', 'hot'];
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'skills-sh',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
