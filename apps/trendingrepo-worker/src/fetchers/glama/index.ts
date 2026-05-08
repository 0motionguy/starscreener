import { loadEnv } from '../../lib/env.js';
import { runMcpFetcher } from '../../lib/mcp/run-mcp-fetcher.js';
import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { fetchAllGlama } from './client.js';

const fetcher: Fetcher = {
  name: 'glama',
  schedule: '15 */6 * * *',
  requiresDb: true,
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('glama dry-run');
      return empty('glama', startedAt);
    }
    const env = loadEnv();
    return runMcpFetcher({
      ctx,
      fetcherName: 'glama',
      startedAt,
      fetch: () =>
        fetchAllGlama(ctx.http, ctx.log, env.GLAMA_API_KEY, {
          maxPages: positiveInt(env.GLAMA_MAX_PAGES),
          pageLimit: positiveInt(env.GLAMA_PAGE_LIMIT),
          budgetMs: positiveInt(env.GLAMA_BUDGET_MS),
        }),
    });
  },
};

export default fetcher;

function empty(name: string, startedAt: string): RunResult {
  return {
    fetcher: name,
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: 0,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished: false,
    errors: [],
  };
}

function positiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
