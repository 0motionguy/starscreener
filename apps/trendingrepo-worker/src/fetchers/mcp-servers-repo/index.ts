import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';

const fetcher: Fetcher = {
  name: 'mcp-servers-repo',
  schedule: '5 */12 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('mcp-servers-repo fetcher dry-run');
      return empty('mcp-servers-repo', startedAt);
    }
    throw new Error('Not Implemented: mcp-servers-repo fetcher');
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
