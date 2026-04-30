import { describe, expect, it } from 'vitest';
import { parseTrendshiftDaily } from '../../../src/fetchers/trendshift-daily/index.js';

describe('parseTrendshiftDaily', () => {
  it('extracts unique repository links in page order', () => {
    const html = `
      <a href="/topics/ai-agent"># AI agent</a>
      <a href="/repositories/10">owner-one/repo-one</a>
      <a href="/repositories/11">owner-two/repo-two</a>
      <a href="/repositories/10">owner-one/repo-one</a>
      <a href="/repositories/12">not a repo name</a>
    `;

    expect(parseTrendshiftDaily(html)).toEqual([
      {
        fullName: 'owner-one/repo-one',
        rank: 1,
        repositoryId: 10,
        url: 'https://trendshift.io/repositories/10',
        source: 'trendshift',
      },
      {
        fullName: 'owner-two/repo-two',
        rank: 2,
        repositoryId: 11,
        url: 'https://trendshift.io/repositories/11',
        source: 'trendshift',
      },
    ]);
  });
});
