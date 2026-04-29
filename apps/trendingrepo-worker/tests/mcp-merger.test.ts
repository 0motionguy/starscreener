import { describe, expect, it } from 'vitest';
import { mergeAndUpsert, bestGrade } from '../src/lib/mcp/merger.js';
import type { McpServerNormalized, McpSource } from '../src/lib/mcp/types.js';
import { createFakeSupabase } from './helpers/fake-supabase.js';

function makeNorm(source: McpSource, overrides: Partial<McpServerNormalized> = {}): McpServerNormalized {
  return {
    source,
    source_id: `${source}-1`,
    name: 'stripe-mcp',
    owner: 'stripe',
    qualified_name: 'stripe/stripe-mcp',
    package_name: '@stripe/mcp',
    package_registry: 'npm',
    github_url: 'https://github.com/stripe/agent-toolkit',
    github_stars: 100,
    downloads_total: 1000,
    popularity_signal: 0.5,
    security_grade: null,
    is_remote: false,
    description: 'Charge cards via the Stripe API',
    raw: { source },
    ...overrides,
  };
}

describe('mergeAndUpsert — cross-source dedup', () => {
  it('first source inserts a new row with cross_source_count=1', async () => {
    const { db, store } = createFakeSupabase();
    const result = await mergeAndUpsert(db, makeNorm('official'), {
      vendor_slug: 'stripe',
      is_official_vendor: true,
      strategy: 'package',
    });
    expect(result.inserted).toBe(true);
    expect(result.cross_source_count).toBe(1);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.merge_keys).toContain('gh:github.com/stripe/agent-toolkit');
    expect(store.rows[0]!.vendor).toBe('stripe');
  });

  it('second source merges into existing row, count -> 2, sources includes both', async () => {
    const { db, store } = createFakeSupabase();
    await mergeAndUpsert(db, makeNorm('official'), {
      vendor_slug: 'stripe',
      is_official_vendor: true,
      strategy: 'package',
    });
    const result = await mergeAndUpsert(
      db,
      makeNorm('glama', { security_grade: 'A', popularity_signal: 0.9 }),
      { vendor_slug: 'stripe', is_official_vendor: true, strategy: 'package' },
    );
    expect(result.inserted).toBe(false);
    expect(result.cross_source_count).toBe(2);
    expect(result.mergedFrom).toEqual(['official', 'glama']);
    expect(store.rows).toHaveLength(1);
    expect((store.rows[0]!.raw as { security_grade?: string }).security_grade).toBe('A');
    // popularity should rise to max(0.5, 0.9)
    expect(store.rows[0]!.absolute_popularity).toBeCloseTo(0.9, 5);
  });

  it('third source pushes count to 3', async () => {
    const { db, store } = createFakeSupabase();
    await mergeAndUpsert(db, makeNorm('official'), { vendor_slug: 'stripe', is_official_vendor: true, strategy: 'package' });
    await mergeAndUpsert(db, makeNorm('glama'), { vendor_slug: 'stripe', is_official_vendor: true, strategy: 'package' });
    const r = await mergeAndUpsert(db, makeNorm('pulsemcp'), {
      vendor_slug: 'stripe',
      is_official_vendor: true,
      strategy: 'package',
    });
    expect(r.cross_source_count).toBe(3);
    expect(store.rows).toHaveLength(1);
    const raw = store.rows[0]!.raw as { sources?: string[] };
    expect(raw.sources).toEqual(['official', 'glama', 'pulsemcp']);
  });

  it('re-running the same source does not inflate count', async () => {
    const { db, store } = createFakeSupabase();
    await mergeAndUpsert(db, makeNorm('official'), { vendor_slug: 'stripe', is_official_vendor: true, strategy: 'package' });
    const r2 = await mergeAndUpsert(db, makeNorm('official'), {
      vendor_slug: 'stripe',
      is_official_vendor: true,
      strategy: 'package',
    });
    expect(r2.cross_source_count).toBe(1);
    expect(store.rows).toHaveLength(1);
  });

  it('two unrelated MCPs (different github URLs) stay separate', async () => {
    const { db, store } = createFakeSupabase();
    await mergeAndUpsert(
      db,
      makeNorm('official', {
        github_url: 'https://github.com/stripe/agent-toolkit',
        package_name: '@stripe/mcp',
        qualified_name: 'stripe/agent-toolkit',
      }),
      { vendor_slug: 'stripe', is_official_vendor: true, strategy: 'package' },
    );
    await mergeAndUpsert(
      db,
      makeNorm('glama', {
        source_id: 'glama-2',
        github_url: 'https://github.com/notion-team/notion-mcp',
        package_name: 'notion-mcp',
        qualified_name: 'notion-team/notion-mcp',
        owner: 'notion-team',
      }),
      { vendor_slug: 'notion', is_official_vendor: false, strategy: 'package' },
    );
    expect(store.rows).toHaveLength(2);
  });
});

describe('bestGrade', () => {
  it('returns the better of two grades (A > B > C > F)', () => {
    expect(bestGrade('A', 'B')).toBe('A');
    expect(bestGrade('C', 'B')).toBe('B');
    expect(bestGrade('F', 'F')).toBe('F');
  });

  it('handles nulls', () => {
    expect(bestGrade(null, 'B')).toBe('B');
    expect(bestGrade('A', null)).toBe('A');
    expect(bestGrade(null, null)).toBeNull();
    expect(bestGrade(undefined, undefined)).toBeNull();
  });
});
