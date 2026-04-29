import { describe, expect, it } from 'vitest';
import {
  computeMergeKeys,
  qualifiedNameSimilarity,
  serializeMergeKeys,
} from '../src/lib/mcp/dedup-keys.js';
import type { McpServerNormalized } from '../src/lib/mcp/types.js';

const base: McpServerNormalized = {
  source: 'official',
  source_id: 'x',
  name: 'foo',
  owner: 'foo',
  qualified_name: 'foo/bar',
  package_name: '@foo/bar',
  package_registry: 'npm',
  github_url: 'https://github.com/Foo/Bar',
  github_stars: null,
  downloads_total: null,
  popularity_signal: 0,
  security_grade: null,
  is_remote: false,
  description: null,
  raw: {},
};

describe('computeMergeKeys', () => {
  it('emits keys in priority order: github_url, registry_pkg, qualified_name', () => {
    const keys = computeMergeKeys(base);
    expect(keys.map((k) => k.kind)).toEqual(['github_url', 'registry_pkg', 'qualified_name']);
  });

  it('normalizes the github_url (lowercase, no .git suffix)', () => {
    const keys = computeMergeKeys({
      ...base,
      github_url: 'https://github.com/Foo/Bar.git',
    });
    expect(keys[0]).toEqual({ kind: 'github_url', value: 'github.com/foo/bar' });
  });

  it('omits github_url when missing', () => {
    const keys = computeMergeKeys({ ...base, github_url: null });
    expect(keys[0]?.kind).toBe('registry_pkg');
  });

  it('omits registry_pkg when registry or name is missing', () => {
    const keys = computeMergeKeys({
      ...base,
      package_name: null,
      package_registry: null,
    });
    expect(keys.some((k) => k.kind === 'registry_pkg')).toBe(false);
  });
});

describe('serializeMergeKeys', () => {
  it('prefixes each key with its kind', () => {
    const out = serializeMergeKeys(computeMergeKeys(base));
    expect(out).toEqual([
      'gh:github.com/foo/bar',
      'pkg:npm:@foo/bar',
      'qn:foo/bar',
    ]);
  });
});

describe('qualifiedNameSimilarity', () => {
  it('returns 1 for identical names', () => {
    expect(qualifiedNameSimilarity('foo/bar', 'foo/bar')).toBe(1);
  });

  it('returns >0.85 for slug variants', () => {
    expect(qualifiedNameSimilarity('stripe/agent-toolkit', 'stripe/agent-toolkit')).toBe(1);
    expect(qualifiedNameSimilarity('stripe-agent-toolkit', 'stripe/agent-toolkit')).toBeGreaterThanOrEqual(0.85);
  });

  it('returns <0.85 for unrelated names', () => {
    expect(qualifiedNameSimilarity('stripe/billing', 'notion/pages')).toBeLessThan(0.85);
  });
});
