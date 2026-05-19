import { afterEach, describe, expect, it } from 'vitest';

import {
  deltasToToolboxEvents,
  hnMentionsToToolboxEvents,
  npmPackagesToToolboxEvents,
  postToolboxEvents,
} from '../src/lib/toolbox-ingest.js';

describe('TOOLBOX ingest transforms', () => {
  afterEach(() => {
    delete process.env.TOOLBOX_INGEST_URL;
    delete process.env.TOOLBOX_INGEST_HMAC_SECRET;
  });

  it('skips posting when ingest environment is not configured', async () => {
    await expect(postToolboxEvents([])).resolves.toEqual({
      status: 'skipped',
      reason: 'env_unset',
    });
  });

  it('emits bounded Hacker News mention events for GitHub targets', () => {
    const events = hnMentionsToToolboxEvents({
      mentions: {
        'openai/codex': {
          count7d: 3,
          scoreSum7d: 42,
          everHitFrontPage: true,
          topStory: { id: 1, title: 'Codex' },
          stories: Array.from({ length: 12 }, (_, i) => ({ id: i + 1 })),
        },
        not_a_repo: {
          count7d: 1,
          scoreSum7d: 1,
        },
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        target_url: 'https://github.com/openai/codex',
        signal_type: 'trending.hn.mentions',
        produced_by: 'trendingrepo-hn',
      }),
    );
    expect(events[0]?.normalized).toEqual(
      expect.arrayContaining([
        { key: 'count_7d', value: 3, confidence: 1 },
        { key: 'score_sum_7d', value: 42, confidence: 1 },
        { key: 'ever_hit_front_page', value: true, confidence: 1 },
      ]),
    );
    const stories = events[0]?.normalized.find((n) => n.key === 'stories_top10');
    expect(stories?.value).toHaveLength(10);
  });

  it('emits npm package events with download velocity fields', () => {
    const events = npmPackagesToToolboxEvents({
      packages: [
        {
          name: '@openai/codex',
          npmUrl: 'https://www.npmjs.com/package/@openai/codex',
          latestVersion: '1.2.3',
          publishedAt: '2026-05-18T00:00:00.000Z',
          description: 'test package',
          repositoryUrl: 'https://github.com/openai/codex',
          linkedRepo: 'openai/codex',
          homepage: 'https://github.com/openai/codex',
          keywords: ['ai', 'agent'],
          downloads24h: 100,
          downloads7d: 500,
          downloads30d: 2000,
          delta24h: 25,
          delta7d: 75,
          delta30d: 250,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        target_url: 'https://www.npmjs.com/package/@openai/codex',
        signal_type: 'trending.npm.packages',
        produced_by: 'trendingrepo-npm',
      }),
    );
    expect(events[0]?.normalized).toEqual(
      expect.arrayContaining([
        { key: 'name', value: '@openai/codex', confidence: 1 },
        { key: 'linked_repo', value: 'openai/codex', confidence: 1 },
        { key: 'downloads_24h', value: 100, confidence: 1 },
        { key: 'delta_24h', value: 25, confidence: 1 },
      ]),
    );
  });

  it('emits separate GitHub star and fork velocity events from deltas', () => {
    const events = deltasToToolboxEvents(
      {
        repos: {
          '123': {
            stars_now: 100,
            forks_now: 20,
            delta_24h: { value: 8, basis: 'exact' },
            fork_delta_24h: { value: 2, basis: 'nearest' },
          },
        },
      },
      new Map([['123', 'openai/codex']]),
    );

    expect(events.map((event) => event.signal_type).sort()).toEqual([
      'trending.github.fork.velocity',
      'trending.github.stars.velocity',
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_url: 'https://github.com/openai/codex',
          produced_by: 'trendingrepo-deltas',
        }),
      ]),
    );
    const forkEvent = events.find((event) => event.signal_type === 'trending.github.fork.velocity');
    expect(forkEvent?.normalized).toEqual(
      expect.arrayContaining([
        { key: 'forks_now', value: 20, confidence: 1 },
        { key: 'fork_delta_24h', value: 2, confidence: 0.7 },
      ]),
    );
  });
});
