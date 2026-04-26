import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';

const fetcher: Fetcher = {
  name: 'github',
  schedule: '15 */1 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('github fetcher dry-run');
      return empty('github', startedAt);
    }
    throw new Error('Not Implemented: github fetcher');
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
