import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_CONTRACTS, getFetcher, listFetcherNames } from '../src/registry.js';
import type { PrimaryOutputKey, SourceContract } from '../src/platform/source-contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function primaryOutputKeys(source: SourceContract): string[] {
  const raw = source.primary_output_keys;
  const items: PrimaryOutputKey[] = Array.isArray(raw) ? raw : [raw];
  return items.map((item) => (typeof item === 'string' ? item : item.pattern));
}

describe('worker registry', () => {
  it('has unique SourceContract ids', () => {
    const ids = SOURCE_CONTRACTS.map((source) => source.id);
    const duplicateIds = ids
      .filter((id, index) => ids.indexOf(id) !== index)
      .sort();

    expect(duplicateIds).toEqual([]);
  });

  it('has a SourceContract for every registered fetcher', () => {
    const contracts = new Set(SOURCE_CONTRACTS.map((source) => source.id));
    const missing = listFetcherNames().filter((name) => !contracts.has(name)).sort();

    expect(missing).toEqual([]);
  });

  it('does not mark non-worker sources active', () => {
    const fetchers = new Set(listFetcherNames());
    const activeWithoutFetcher = SOURCE_CONTRACTS.filter(
      (source) =>
        source.state === 'active' &&
        source.category !== 'user-input' &&
        !fetchers.has(source.id),
    )
      .map((source) => source.id)
      .sort();

    expect(activeWithoutFetcher).toEqual([]);
  });

  it('records dynamic output families for multi-output fetchers', () => {
    const velocityBackfill = SOURCE_CONTRACTS.find((source) => source.id === 'velocity-backfill');
    const velocityRefresh = SOURCE_CONTRACTS.find((source) => source.id === 'velocity-refresh');
    const dropDeepEnrich = SOURCE_CONTRACTS.find(
      (source) => source.id === 'drop-deep-enrich-drain',
    );

    expect(velocityBackfill).toBeTruthy();
    expect(primaryOutputKeys(velocityBackfill!)).toEqual([
      'star-activity:<owner>__<name>',
      'star-activity-deltas',
    ]);
    expect(velocityRefresh).toBeTruthy();
    expect(primaryOutputKeys(velocityRefresh!)).toEqual([
      'star-activity:<owner>__<name>',
      'star-activity-deltas',
    ]);
    expect(dropDeepEnrich).toBeTruthy();
    expect(primaryOutputKeys(dropDeepEnrich!)).toEqual([
      'repo-community:<owner>__<name>',
      'repo-editorial:<owner>__<name>',
    ]);
  });

  it('schedules the engagement-composite fetcher consumed by the public API', () => {
    expect(listFetcherNames()).toContain('engagement-composite');
    expect(getFetcher('engagement-composite')?.schedule).toBe('45 * * * *');
  });

  it('schedules ProductHunt as a worker-owned production data source', () => {
    expect(listFetcherNames()).toContain('producthunt');
    expect(getFetcher('producthunt')?.schedule).toBe('8 */4 * * *');
    expect(SOURCE_CONTRACTS.find((source) => source.id === 'producthunt')).toMatchObject({
      auth_scheme: 'producthunt_token_pool',
      primary_output_keys: ['producthunt-launches'],
    });
  });

  it('keeps Reddit collectors paused until the topic is intentionally enabled', () => {
    expect(listFetcherNames()).not.toContain('reddit');
    expect(getFetcher('reddit')).toBeUndefined();
    expect(listFetcherNames()).not.toContain('reddit-baselines');
    expect(getFetcher('reddit-baselines')).toBeUndefined();
    expect(SOURCE_CONTRACTS.find((source) => source.id === 'reddit')).toMatchObject({
      state: 'paused',
      auth_required: true,
      auth_scheme: 'reddit_oauth_client_credentials',
      primary_output_keys: ['reddit-mentions', 'reddit-all-posts'],
    });
    expect(SOURCE_CONTRACTS.find((source) => source.id === 'reddit-baselines')).toMatchObject({
      state: 'paused',
      primary_output_keys: ['reddit-baselines'],
    });
  });

  it('keeps Apify-only x-funding paused until an approved non-empty producer exists', () => {
    expect(listFetcherNames()).not.toContain('x-funding');
    expect(getFetcher('x-funding')).toBeUndefined();
    expect(SOURCE_CONTRACTS.find((source) => source.id === 'x-funding')).toMatchObject({
      state: 'paused',
      auth_required: true,
      auth_scheme: 'apify_token',
      primary_output_keys: ['funding-news-x'],
    });
  });

  it('records deleted or parked GitHub producers honestly', () => {
    expect(listFetcherNames()).not.toContain('github');
    expect(getFetcher('github')).toBeUndefined();
    expect(SOURCE_CONTRACTS.find((source) => source.id === 'github')).toMatchObject({
      state: 'deprecated',
      supports_backfill: false,
      primary_output_keys: ['github-trending'],
    });

    expect(listFetcherNames()).not.toContain('github-events');
    expect(getFetcher('github-events')).toBeUndefined();
    expect(SOURCE_CONTRACTS.find((source) => source.id === 'github-events')).toMatchObject({
      state: 'intent-only',
      consumer_surfaces: [
        'src/lib/github-events.ts',
        'src/app/api/repos/[owner]/[name]/events/route.ts',
      ],
    });
  });

  it('does not leave decision notes pointing at missing worker fetcher paths', () => {
    const root = resolve(__dirname, '..', '..', '..');
    const missing = SOURCE_CONTRACTS.flatMap((source) => {
      const note = source.decision_pending ?? '';
      const matches = note.matchAll(
        /apps\/trendingrepo-worker\/src\/fetchers\/[A-Za-z0-9_-]+/g,
      );

      return [...matches]
        .map((match) => match[0])
        .filter((relativePath) => !existsSync(resolve(root, relativePath)))
        .map((relativePath) => `${source.id}: ${relativePath}`);
    });

    expect(missing).toEqual([]);
  });
});
