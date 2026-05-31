import { describe, expect, it } from 'vitest';
import { diffScheduledFetchers } from '../src/scheduler-reconcile.js';
import type { Fetcher } from '../src/lib/types.js';

function fetcher(name: string): Fetcher {
  return {
    name,
    schedule: '0 * * * *',
    async run() {
      return {
        fetcher: name,
        startedAt: new Date(0).toISOString(),
        finishedAt: new Date(0).toISOString(),
        itemsSeen: 0,
        itemsUpserted: 0,
        metricsWritten: 0,
        redisPublished: false,
        errors: [],
      };
    },
  };
}

describe('scheduler reconciliation', () => {
  it('starts newly active fetchers and stops newly skipped fetchers', () => {
    const desired = [fetcher('hn-pulse'), fetcher('recent-repos'), fetcher('twitter')];

    expect(diffScheduledFetchers(['hn-pulse', 'old-paused'], desired)).toEqual({
      toStart: [desired[1], desired[2]],
      toStop: ['old-paused'],
      unchanged: ['hn-pulse'],
    });
  });

  it('keeps desired ordering for starts and sorted names for stops', () => {
    const desired = [fetcher('b'), fetcher('a'), fetcher('c')];

    expect(diffScheduledFetchers(['z', 'b', 'y'], desired)).toEqual({
      toStart: [desired[1], desired[2]],
      toStop: ['y', 'z'],
      unchanged: ['b'],
    });
  });
});
