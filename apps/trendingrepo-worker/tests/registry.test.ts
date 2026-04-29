import { describe, expect, it } from 'vitest';
import { getFetcher, listFetcherNames } from '../src/registry.js';

describe('worker registry', () => {
  it('schedules the engagement-composite fetcher consumed by the public API', () => {
    expect(listFetcherNames()).toContain('engagement-composite');
    expect(getFetcher('engagement-composite')?.schedule).toBe('45 * * * *');
  });
});
