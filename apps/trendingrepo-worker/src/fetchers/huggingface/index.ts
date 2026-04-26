import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';

const fetcher: Fetcher = {
  name: 'huggingface',
  schedule: '0 */4 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('huggingface fetcher dry-run');
      return empty('huggingface', startedAt);
    }
    throw new Error('Not Implemented: huggingface fetcher');
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
