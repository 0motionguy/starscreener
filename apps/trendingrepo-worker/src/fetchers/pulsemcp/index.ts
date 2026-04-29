import { loadEnv } from '../../lib/env.js';
import { runMcpFetcher } from '../../lib/mcp/run-mcp-fetcher.js';
import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { fetchAllPulseMcp } from './client.js';

const fetcher: Fetcher = {
  name: 'pulsemcp',
  schedule: '30 */12 * * *',
  requiresDb: true,
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('pulsemcp dry-run');
      return empty('pulsemcp', startedAt);
    }
    const env = loadEnv();
    if (!env.PULSEMCP_API_KEY) {
      ctx.log.warn('pulsemcp skipped: PULSEMCP_API_KEY not set');
      return empty('pulsemcp', startedAt);
    }
    return runMcpFetcher({
      ctx,
      fetcherName: 'pulsemcp',
      startedAt,
      fetch: () =>
        fetchAllPulseMcp(ctx.http, ctx.log, {
          apiKey: env.PULSEMCP_API_KEY!,
          tenantId: env.PULSEMCP_TENANT_ID,
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
