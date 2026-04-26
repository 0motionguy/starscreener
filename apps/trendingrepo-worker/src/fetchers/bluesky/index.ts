import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';

const fetcher: Fetcher = {
  name: 'bluesky',
  schedule: '*/15 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('bluesky fetcher dry-run');
      return empty('bluesky', startedAt);
    }
    throw new Error('Not Implemented: bluesky fetcher');
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
