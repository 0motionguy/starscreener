import { runMcpFetcher } from '../../lib/mcp/run-mcp-fetcher.js';
import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { fetchAllOfficial } from './client.js';

const fetcher: Fetcher = {
  name: 'mcp-registry-official',
  schedule: '0 */6 * * *',
  requiresDb: true,
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('mcp-registry-official dry-run');
      return empty('mcp-registry-official', startedAt);
    }
    return runMcpFetcher({
      ctx,
      fetcherName: 'mcp-registry-official',
      startedAt,
      fetch: () => fetchAllOfficial(ctx.http, ctx.log),
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
