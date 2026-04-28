import { loadEnv } from '../../lib/env.js';
import { runMcpFetcher } from '../../lib/mcp/run-mcp-fetcher.js';
import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { fetchAllSmithery } from './client.js';

const fetcher: Fetcher = {
  name: 'smithery',
  schedule: '0 4 * * *',
  requiresDb: true,
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('smithery dry-run');
      return empty('smithery', startedAt);
    }
    const env = loadEnv();
    if (!env.SMITHERY_API_KEY) {
      ctx.log.warn('smithery skipped: SMITHERY_API_KEY not set');
      return empty('smithery', startedAt);
    }
    return runMcpFetcher({
      ctx,
      fetcherName: 'smithery',
      startedAt,
      fetch: () => fetchAllSmithery(ctx.http, ctx.log, env.SMITHERY_API_KEY!),
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
