import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/redis.js', () => ({
  readDataStore: vi.fn(),
  writeDataStore: vi.fn(),
}));

vi.mock('../_picker.js', () => ({
  pickHotRepos: vi.fn(async () => ({ repos: [], source: 'test-empty' })),
}));

vi.mock('../_scan.js', () => ({
  scanRepoBatch: vi.fn(),
}));

import fetcher from '../index.js';
import { writeDataStore } from '../../../lib/redis.js';
import { scanRepoBatch } from '../_scan.js';

function makeContext() {
  return {
    db: {} as never,
    redis: {} as never,
    http: {} as never,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    } as never,
    dryRun: false,
    since: new Date('2026-06-01T00:00:00.000Z'),
    signalRunComplete: vi.fn(),
  };
}

describe('twitter fetcher empty picker guard', () => {
  it('does not overwrite twitter-repo-signals when the hot picker returns zero repos', async () => {
    const result = await fetcher.run(makeContext());

    expect(writeDataStore).not.toHaveBeenCalled();
    expect(scanRepoBatch).not.toHaveBeenCalled();
    expect(result.redisPublished).toBe(false);
    expect(result.errors).toEqual([
      {
        stage: 'pick-hot-repos',
        message: 'hot picker returned 0 repos; skipped empty twitter-repo-signals write',
      },
    ]);
  });
});
