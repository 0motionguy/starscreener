// Unit tests for source-overrides pure helpers.
//
// These exercise applyOverrides, findGhostOverrides, summarizeOverrides, and
// shouldSkip semantics (via applyOverrides). The DB-touching `loadOverrides`
// function is exercised indirectly: tests construct override Maps directly
// instead of mocking Supabase. A live-Supabase loadOverrides test would be
// integration-tier and is intentionally out of scope (per task constraint).

import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  findGhostOverrides,
  summarizeOverrides,
  type SourceOverride,
} from '../overrides.js';
import type { Fetcher } from '../../lib/types.js';
import type { SourceContract } from '../source-contract.js';

function fetcher(name: string): Fetcher {
  return {
    name,
    schedule: '0 * * * *',
    run: async () => ({
      fetcher: name,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      itemsSeen: 0,
      itemsUpserted: 0,
      metricsWritten: 0,
      redisPublished: false,
      errors: [],
    }),
  };
}

function contract(id: string): SourceContract {
  return {
    id,
    category: 'repo-derived',
    kind: 'collector',
    state: 'active',
    freshness_budget_ms: 3_600_000,
    cost_signal_metric: { type: 'none' },
    owner: 'UNASSIGNED',
    upstream_url: 'https://example.com',
    auth_required: false,
    primary_output_keys: [id],
    output_record_shape: 'metric_snapshot',
    consumer_surfaces: [],
    depends_on: [],
    supports_backfill: false,
    fallback_strategy: 'none',
  };
}

function override(
  source_id: string,
  state: SourceOverride['state'],
  paused_until: string | null = null,
  reason = 'test',
): SourceOverride {
  return { source_id, state, paused_until, reason };
}

describe('applyOverrides', () => {
  it('keeps fetchers with no override', () => {
    const fetchers = [fetcher('a'), fetcher('b')];
    const overrides = new Map<string, SourceOverride>();
    expect(applyOverrides(fetchers, overrides).map((f) => f.name)).toEqual(['a', 'b']);
  });

  it('keeps fetchers explicitly active', () => {
    const fetchers = [fetcher('a')];
    const overrides = new Map([['a', override('a', 'active')]]);
    expect(applyOverrides(fetchers, overrides).map((f) => f.name)).toEqual(['a']);
  });

  it('skips fetchers paused indefinitely (paused_until null)', () => {
    const fetchers = [fetcher('a'), fetcher('b')];
    const overrides = new Map([['a', override('a', 'paused', null)]]);
    expect(applyOverrides(fetchers, overrides).map((f) => f.name)).toEqual(['b']);
  });

  it('skips fetchers paused with future paused_until', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const fetchers = [fetcher('a'), fetcher('b')];
    const overrides = new Map([['a', override('a', 'paused', future)]]);
    expect(applyOverrides(fetchers, overrides).map((f) => f.name)).toEqual(['b']);
  });

  it('keeps fetchers whose paused_until is in the past (pause expired)', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fetchers = [fetcher('a'), fetcher('b')];
    const overrides = new Map([['a', override('a', 'paused', past)]]);
    expect(applyOverrides(fetchers, overrides).map((f) => f.name)).toEqual(['a', 'b']);
  });

  it('skips fetchers marked deprecated regardless of paused_until', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const fetchers = [fetcher('a'), fetcher('b')];
    const overrides = new Map([
      ['a', override('a', 'deprecated', future)],
      ['b', override('b', 'deprecated', null)],
    ]);
    expect(applyOverrides(fetchers, overrides).map((f) => f.name)).toEqual([]);
  });

  it('returns a new array (does not mutate input)', () => {
    const fetchers = [fetcher('a'), fetcher('b')];
    const overrides = new Map([['a', override('a', 'paused')]]);
    const result = applyOverrides(fetchers, overrides);
    expect(result).not.toBe(fetchers);
    expect(fetchers.map((f) => f.name)).toEqual(['a', 'b']);
  });

  it('handles mixed states across many fetchers', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const fetchers = [
      fetcher('keep-active'),
      fetcher('skip-paused-indef'),
      fetcher('skip-paused-future'),
      fetcher('keep-paused-expired'),
      fetcher('skip-deprecated'),
      fetcher('keep-no-override'),
    ];
    const overrides = new Map<string, SourceOverride>([
      ['keep-active', override('keep-active', 'active')],
      ['skip-paused-indef', override('skip-paused-indef', 'paused', null)],
      ['skip-paused-future', override('skip-paused-future', 'paused', future)],
      ['keep-paused-expired', override('keep-paused-expired', 'paused', past)],
      ['skip-deprecated', override('skip-deprecated', 'deprecated', null)],
    ]);
    expect(applyOverrides(fetchers, overrides).map((f) => f.name)).toEqual([
      'keep-active',
      'keep-paused-expired',
      'keep-no-override',
    ]);
  });
});

describe('findGhostOverrides', () => {
  it('returns empty when every override has a fetcher', () => {
    const fetchers = [fetcher('a'), fetcher('b')];
    const overrides = new Map([['a', override('a', 'paused')]]);
    expect(findGhostOverrides(fetchers, overrides, [])).toEqual([]);
  });

  it('returns empty when override matches a contract-only source (script / user-input)', () => {
    const fetchers = [fetcher('a')];
    const overrides = new Map([['scrape-foo', override('scrape-foo', 'paused')]]);
    const contracts = [contract('scrape-foo')];
    expect(findGhostOverrides(fetchers, overrides, contracts)).toEqual([]);
  });

  it('flags override ids absent from both fetchers and contracts', () => {
    const fetchers = [fetcher('a')];
    const overrides = new Map([
      ['a', override('a', 'active')],
      ['ghost-1', override('ghost-1', 'paused')],
      ['ghost-2', override('ghost-2', 'deprecated')],
    ]);
    const contracts = [contract('a')];
    expect(findGhostOverrides(fetchers, overrides, contracts).sort()).toEqual([
      'ghost-1',
      'ghost-2',
    ]);
  });

  it('returns empty when overrides map is empty', () => {
    expect(findGhostOverrides([fetcher('a')], new Map(), [contract('a')])).toEqual([]);
  });
});

describe('summarizeOverrides', () => {
  it('counts paused and deprecated separately and totals', () => {
    const overrides = new Map<string, SourceOverride>([
      ['a', override('a', 'paused')],
      ['b', override('b', 'paused')],
      ['c', override('c', 'deprecated')],
      ['d', override('d', 'active')],
    ]);
    expect(summarizeOverrides(overrides)).toEqual({ total: 4, paused: 2, deprecated: 1 });
  });

  it('returns zeros for an empty map', () => {
    expect(summarizeOverrides(new Map())).toEqual({ total: 0, paused: 0, deprecated: 0 });
  });
});
