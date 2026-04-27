// manual-repos producer.
//
// The `data/manual-repos.json` file in the monorepo is operator-curated —
// it lists repos Mirko explicitly wants tracked even when they don't
// surface organically through OSS Insight or GitHub search. The file is
// hand-edited and committed to git.
//
// The worker is a self-contained Railway build (Dockerfile is `COPY .`
// from the worker dir) and so cannot read the monorepo's `data/` directory
// at runtime. We fetch it from GitHub raw instead and mirror it to the
// `manual-repos` Redis slug, where `repo-metadata` already reads it via
// `readDataStore`. Daily cadence — these files change rarely.
//
// Slug: `manual-repos`
// Cadence: daily 04:07 UTC (off-cluster — most other fetchers fire on the
//          hour or :17/:27/:37; :07 keeps it solitary)

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const DEFAULT_REPO = '0motionguy/starscreener';
const DEFAULT_BRANCH = 'main';
const DATA_FILE = 'data/manual-repos.json';

interface ManualReposPayload {
  fetchedAt?: string;
  items?: unknown[];
  [key: string]: unknown;
}

const fetcher: Fetcher = {
  name: 'manual-repos',
  schedule: '7 4 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('manual-repos dry-run');
      return done(startedAt, 0, false, []);
    }

    const repo = (process.env.MANUAL_DATA_SOURCE_REPO ?? DEFAULT_REPO).trim() || DEFAULT_REPO;
    const branch =
      (process.env.MANUAL_DATA_SOURCE_BRANCH ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH;
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${DATA_FILE}`;

    let payload: ManualReposPayload;
    try {
      const { data } = await ctx.http.json<ManualReposPayload>(url, {
        useEtagCache: true,
        headers: { accept: 'application/json' },
      });
      payload = data && typeof data === 'object' ? data : { items: [] };
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.warn({ url, message }, 'manual-repos fetch failed');
      return done(startedAt, 0, false, [{ stage: 'fetch', message }]);
    }

    // Normalize: ensure the payload has the shape repo-metadata reads
    // (`{ items: [{ fullName }] }`) without rewriting operator content.
    const items = Array.isArray(payload.items) ? payload.items : [];
    const normalized: ManualReposPayload = {
      ...payload,
      fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
      items,
    };

    const result = await writeDataStore('manual-repos', normalized);
    ctx.log.info(
      { items: items.length, redisSource: result.source, source: url },
      'manual-repos published',
    );
    return done(startedAt, items.length, result.source === 'redis', []);
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
    fetcher: 'manual-repos',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
