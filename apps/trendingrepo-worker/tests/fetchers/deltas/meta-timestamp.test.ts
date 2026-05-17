import { describe, expect, it } from 'vitest';

import { resolveTrendingSnapshotTs } from '../../../src/fetchers/deltas/index.js';

describe('deltas timestamp resolver', () => {
  it('reads writtenAt from JSON data-store metadata', () => {
    expect(
      resolveTrendingSnapshotTs(
        '{"writtenAt":"2026-05-17T11:22:39.301Z","writer":"worker:oss-trending"}',
        { fetchedAt: '2026-05-17T11:20:00.000Z' },
        1770000000,
      ),
    ).toBe(1779016959);
  });

  it('keeps compatibility with raw ISO metadata strings', () => {
    expect(
      resolveTrendingSnapshotTs(
        '2026-05-17T11:22:39.301Z',
        { fetchedAt: '2026-05-17T11:20:00.000Z' },
        1770000000,
      ),
    ).toBe(1779016959);
  });

  it('falls back to the current payload fetchedAt when metadata is malformed', () => {
    expect(
      resolveTrendingSnapshotTs(
        '{not-json',
        { fetchedAt: '2026-05-17T11:20:00.000Z' },
        1770000000,
      ),
    ).toBe(1779016800);
  });
});
