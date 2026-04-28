// revenue-manual-matches producer.
//
// Same shape as the manual-repos producer: operator-curated JSON in the
// monorepo, fetched from GitHub raw, mirrored to the
// `revenue-manual-matches` Redis slug where the `trustmrr` worker fetcher
// reads it via `readDataStore`. Without this producer, trustmrr silently
// treats the slug as `{}` and operator-curated revenue overrides are lost.
//
// Slug: `revenue-manual-matches`
// Cadence: daily 04:09 UTC (paired with manual-repos at :07 for a tight
//          pull window; both files change rarely so daily is plenty)

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const DEFAULT_REPO = '0motionguy/starscreener';
const DEFAULT_BRANCH = 'main';
const DATA_FILE = 'data/revenue-manual-matches.json';

const fetcher: Fetcher = {
  name: 'revenue-manual-matches',
  schedule: '9 4 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('revenue-manual-matches dry-run');
      return done(startedAt, 0, false, []);
    }

    const repo = (process.env.MANUAL_DATA_SOURCE_REPO ?? DEFAULT_REPO).trim() || DEFAULT_REPO;
    const branch =
      (process.env.MANUAL_DATA_SOURCE_BRANCH ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH;
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${DATA_FILE}`;

    let payload: Record<string, unknown>;
    try {
      const { data } = await ctx.http.json<Record<string, unknown>>(url, {
        useEtagCache: true,
        headers: { accept: 'application/json' },
      });
      payload = data && typeof data === 'object' ? data : {};
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.warn({ url, message }, 'revenue-manual-matches fetch failed');
      return done(startedAt, 0, false, [{ stage: 'fetch', message }]);
    }

    // The file is a flat map: { "<owner>/<name>": "<trustmrr-slug>" }.
    // Operator may include a leading `_comment` key — preserved as-is.
    // Counting only entries that LOOK like repo->slug mappings (skip keys
    // starting with underscore).
    const matchCount = Object.keys(payload).filter(
      (k) => !k.startsWith('_') && typeof payload[k] === 'string',
    ).length;

    const result = await writeDataStore('revenue-manual-matches', payload);
    ctx.log.info(
      { matches: matchCount, redisSource: result.source, source: url },
      'revenue-manual-matches published',
    );
    return done(startedAt, matchCount, result.source === 'redis', []);
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
    fetcher: 'revenue-manual-matches',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
