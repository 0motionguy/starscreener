import { describe, expect, it } from 'vitest';
import { SOURCE_CONTRACTS, getFetcher, listFetcherNames } from '../src/registry.js';

describe('worker registry', () => {
  it('schedules the engagement-composite fetcher consumed by the public API', () => {
    expect(listFetcherNames()).toContain('engagement-composite');
    expect(getFetcher('engagement-composite')?.schedule).toBe('45 * * * *');
  });

  it('schedules ProductHunt as a worker-owned production data source', () => {
    expect(listFetcherNames()).toContain('producthunt');
    expect(getFetcher('producthunt')?.schedule).toBe('8 11,15,19,23 * * *');
    expect(SOURCE_CONTRACTS.find((source) => source.id === 'producthunt')).toMatchObject({
      auth_scheme: 'producthunt_token_pool',
      primary_output_keys: ['producthunt-launches'],
    });
  });
});
