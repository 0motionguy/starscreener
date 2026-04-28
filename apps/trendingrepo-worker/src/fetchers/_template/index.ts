// Template fetcher. Copy this folder, rename to your source, fill in run().

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';

const fetcher: Fetcher = {
  name: '_template',
  schedule: '0 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('template fetcher dry-run - no work to do');
      return {
        fetcher: '_template',
        startedAt,
        finishedAt: new Date().toISOString(),
        itemsSeen: 0,
        itemsUpserted: 0,
        metricsWritten: 0,
        redisPublished: false,
        errors: [],
      };
    }
    throw new Error('Not Implemented - copy this folder and fill in run()');
  },
};

export default fetcher;
