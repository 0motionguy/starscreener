import { describe, expect, it } from 'vitest';
import { buildMetrics, normalizeGlama, type GlamaServerEntry } from '../src/fetchers/glama/client.js';

describe('glama buildMetrics', () => {
  it('forwards all numeric fields when upstream provides them', () => {
    const entry: GlamaServerEntry = {
      name: 'glama-rich',
      visitors_4w: 12000,
      use_count: 850,
      popularity_24h: 4.2,
      popularity_7d: 31,
      popularity_30d: 122,
    };
    expect(buildMetrics(entry)).toEqual({
      visitors_4w: 12000,
      use_count: 850,
      popularity_24h: 4.2,
      popularity_7d: 31,
      popularity_30d: 122,
    });
  });

  it('falls back through alternate field spellings', () => {
    const entry: GlamaServerEntry = {
      name: 'glama-alt',
      visitorsLastFourWeeks: 7000,
      useCount: 42,
      last24Hours: 1,
      last7Days: 9,
      last30Days: 50,
    };
    expect(buildMetrics(entry)).toEqual({
      visitors_4w: 7000,
      use_count: 42,
      popularity_24h: 1,
      popularity_7d: 9,
      popularity_30d: 50,
    });
  });

  it('falls back to downloads when no use_count/installs present', () => {
    const entry: GlamaServerEntry = {
      name: 'glama-downloads-only',
      downloads: 5000,
    };
    expect(buildMetrics(entry).use_count).toBe(5000);
  });

  it('omits fields that are not finite numbers', () => {
    const entry: GlamaServerEntry = {
      name: 'glama-empty',
      // null / string / NaN should never land in metrics
      visitors_4w: undefined,
      use_count: Number.NaN,
    };
    expect(buildMetrics(entry)).toEqual({});
  });
});

describe('normalizeGlama', () => {
  it('attaches metrics to raw.metrics without losing original fields', () => {
    const entry: GlamaServerEntry = {
      id: 'srv_abc',
      name: 'cool-mcp',
      namespace: 'acme',
      description: 'Does cool things',
      repository: { url: 'https://github.com/acme/cool-mcp' },
      attributes: ['hosting:remote'],
      stars: 250,
      visitors_4w: 4000,
      use_count: 200,
    };
    const norm = normalizeGlama(entry);
    expect(norm).not.toBeNull();
    expect(norm!.source).toBe('glama');
    expect(norm!.qualified_name).toBe('acme/cool-mcp');
    expect(norm!.is_remote).toBe(true);
    // Original fields preserved verbatim alongside new metrics subobject.
    expect(norm!.raw.id).toBe('srv_abc');
    expect(norm!.raw.namespace).toBe('acme');
    const metrics = norm!.raw.metrics as Record<string, number>;
    expect(metrics).toEqual({
      visitors_4w: 4000,
      use_count: 200,
    });
  });

  it('emits an empty metrics subobject when upstream is silent', () => {
    const entry: GlamaServerEntry = {
      name: 'plain-mcp',
      description: 'No telemetry',
    };
    const norm = normalizeGlama(entry);
    expect(norm).not.toBeNull();
    expect(norm!.raw.metrics).toEqual({});
  });

  it('returns null when no name/slug', () => {
    expect(normalizeGlama({} as GlamaServerEntry)).toBeNull();
  });
});
