import { describe, expect, it, vi } from 'vitest';

import {
  batchEnrichWithGithub,
  type GithubEnrichmentResult,
} from '../../../lib/sources/producthunt.js';
import { enrichLaunchesWithGithub } from '../index.js';

describe('producthunt github batching', () => {
  it('batches repo enrichment requests (>=30% quota reduction)', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const http = {
      json: vi.fn(async (url: string, opts?: { body?: unknown }) => {
        calls.push({ url, body: opts?.body });
        const query = (opts?.body as { query?: string })?.query ?? '';
        const matches = query.match(/r\d+: repository\(/g) ?? [];
        const data: Record<string, { description: string; repositoryTopics: { nodes: never[] }; stargazerCount: number }> = {};
        for (let i = 0; i < matches.length; i += 1) {
          data[`r${i}`] = {
            description: `repo-${i}`,
            repositoryTopics: { nodes: [] },
            stargazerCount: i + 1,
          };
        }
        return { data: { data } };
      }),
    };

    const fullNames = Array.from({ length: 45 }, (_, i) => `owner${i}/repo${i}`);
    const out = await batchEnrichWithGithub(http as never, fullNames, {
      token: 'ghp_test',
    });

    // Old path: one REST call + one README call per repo = 2N calls.
    const oldCalls = fullNames.length * 2;
    const newCalls = calls.length;
    const reduction = (oldCalls - newCalls) / oldCalls;

    expect(newCalls).toBe(3); // 45 repos with batch size 20
    expect(reduction).toBeGreaterThanOrEqual(0.3);
    expect(out.size).toBe(45);
  });

  it('uses single-repo fallback only when batch misses', async () => {
    const launches: any[] = [
      {
        id: '1',
        name: 'A',
        tagline: '',
        description: '',
        url: '',
        website: null,
        votesCount: 0,
        commentsCount: 0,
        createdAt: new Date().toISOString(),
        thumbnail: null,
        topics: [],
        makers: [],
        githubUrl: 'https://github.com/acme/one',
        xUrl: null,
        linkedRepo: null,
        daysSinceLaunch: 0,
      },
      {
        id: '2',
        name: 'B',
        tagline: '',
        description: '',
        url: '',
        website: null,
        votesCount: 0,
        commentsCount: 0,
        createdAt: new Date().toISOString(),
        thumbnail: null,
        topics: [],
        makers: [],
        githubUrl: 'https://github.com/acme/two',
        xUrl: null,
        linkedRepo: null,
        daysSinceLaunch: 0,
      },
    ];

    const batchMap = new Map<string, GithubEnrichmentResult>();
    batchMap.set('acme/one', {
      stars: 10,
      topics: ['mcp'],
      readmeSnippet: '',
      tags: ['mcp'],
    });

    const batchEnrich = vi.fn(async () => batchMap);
    const enrichSingle = vi.fn(async (_http, fullName: string) => ({
      stars: fullName === 'acme/two' ? 20 : 0,
      topics: ['agent'],
      readmeSnippet: 'fallback',
      tags: ['agent'],
    }));

    const count = await enrichLaunchesWithGithub(launches as never, {} as never, 'ghp_test', {
      batchEnrich,
      enrichSingle,
    });

    expect(count).toBe(2);
    expect(batchEnrich).toHaveBeenCalledTimes(1);
    expect(enrichSingle).toHaveBeenCalledTimes(1);
    expect(launches[0]?.githubRepo?.stars).toBe(10);
    expect(launches[1]?.githubRepo?.stars).toBe(20);
  });
});
