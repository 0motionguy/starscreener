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
      fetch: () => fetchAllGlama(ctx.http, ctx.log, env.GLAMA_API_KEY),
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
