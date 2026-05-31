import { describe, expect, it } from 'vitest';
import {
  buildGithubCollectionRankingsFallback,
  buildHotCollectionsFromRankings,
  countRankingRows,
} from '../fallback.js';

describe('collection rankings github fallback', () => {
  it('builds fresh rowful rankings from live repo metadata and star deltas', () => {
    const payload = buildGithubCollectionRankingsFallback(
      {
        repoMetadata: {
          fetchedAt: '2026-06-01T00:00:00.000Z',
          items: [
            {
              githubId: 155220641,
              fullName: 'huggingface/transformers',
              stars: 152000,
              openIssues: 950,
            },
          ],
        },
        starActivityDeltas: {
          computedAt: '2026-06-01T00:00:00.000Z',
          repos: {
            'huggingface/transformers': {
              stars_now: 152000,
              delta_30d: { value: 321, basis: 'exact' },
            },
          },
        },
      },
      '2026-06-01T00:00:00.000Z',
    );

    expect(payload?.status).toBe('ok');
    expect(payload?.source).toBe('github-metadata-fallback');
    expect(payload?.dataAsOf).toBe('2026-06-01T00:00:00.000Z');
    expect(countRankingRows(payload)).toBeGreaterThan(0);
    expect(payload?.collections['10010']?.stars[0]).toMatchObject({
      repoId: 155220641,
      repoName: 'huggingface/transformers',
      currentPeriodGrowth: 321,
      total: 152000,
      currentPeriodRank: 1,
    });
    expect(payload?.collections['10010']?.issues[0]).toMatchObject({
      repoName: 'huggingface/transformers',
      currentPeriodGrowth: 950,
      total: 950,
    });
  });

  it('derives non-empty hot collections from fallback rankings', () => {
    const rankings = buildGithubCollectionRankingsFallback(
      {
        repoMetadata: {
          items: [
            {
              githubId: 155220641,
              fullName: 'huggingface/transformers',
              stars: 152000,
              openIssues: 950,
            },
          ],
        },
        starActivityDeltas: null,
      },
      '2026-06-01T00:00:00.000Z',
    );

    const hotRows = buildHotCollectionsFromRankings(rankings);

    expect(hotRows.length).toBeGreaterThan(0);
    expect(hotRows[0]).toMatchObject({
      id: 10010,
      name: 'Artificial Intelligence',
      repoId: 155220641,
      repoName: 'huggingface/transformers',
    });
  });
});
