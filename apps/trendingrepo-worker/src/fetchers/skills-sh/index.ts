// skills.sh fetcher entry. Single registry registration that internally
// dispatches between three views (All Time / Trending 24h / Hot 4h) based
// on the current UTC hour. See plan: ~/.claude/plans/skills-sh-fetcher-plan.md
//
//   schedule        '15 */2 * * *'   - every 2h at :15 UTC
//   hour 04         All Time + Trending + Hot - daily anchor + 4h window
//   hours 02,06,10,14,18,22  Trending + Hot
//   hours 00,08,12,16,20     Hot only
//
// Publishes the union-of-views to ss:data:v1:trending-skill-sh. The
// already-shipped claude-skills fetcher writes to ss:data:v1:trending-skill
// (GitHub-topic-based, covers community skills not yet on skills.sh).
// Cross-source merging is deferred; for now both slugs coexist and the
// frontend chooses which to surface.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { FirecrawlClient } from './client.js';
import { scrapeSkillsSh } from './scraper.js';
import { scoreRow } from './scoring.js';
import { AGENT_REGISTRY_VERSION } from './agents.js';
import type {
  SkillScored,
  SkillsLeaderboardPayload,
} from './types.js';

const REDIS_SLUG = 'trending-skill-sh';

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

    const firecrawl = FirecrawlClient.fromEnv();
    if (!firecrawl) {
      ctx.log.warn('FIRECRAWL_API_KEY not set - skills-sh skipped');
      return done(startedAt, 0, false, []);
    }

    const { rows, perView, errors } = await scrapeSkillsSh(
      { firecrawl, http: ctx.http, log: ctx.log, fetchedAt: startedAt },
      // detailDepth is intentionally 0 here - the SKILL.md enrichment pass
      // is a Phase 3 concern that needs GH_TOKEN_POOL throttling. Keep the
      // primary scrape lean and let a follow-up cron do enrichment.
      { detailDepth: 0 },
    );

    const maxRank = Math.max(1, ...rows.map((r) => r.rank));
    const scored: SkillScored[] = rows
      .map((r) => scoreRow(r, maxRank, null))
      .sort((a, b) => b.trending_score - a.trending_score)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    const openclawCount = scored.reduce((n, s) => (s.openclaw_compatible ? n + 1 : n), 0);

    const payload: SkillsLeaderboardPayload = {
      fetchedAt: new Date().toISOString(),
      windowItems: scored.length,
      views: {
        all_time: perView['all-time'],
        trending: perView.trending,
        hot: perView.hot,
      },
      agentRegistryVersion: AGENT_REGISTRY_VERSION,
      items: scored,
      sources: {
        skills_sh_total_seen: rows.length,
        openclaw_compatible_count: openclawCount,
      },
    };

    const result = await writeDataStore(REDIS_SLUG, payload);
    ctx.log.info(
      {
        slug: REDIS_SLUG,
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
