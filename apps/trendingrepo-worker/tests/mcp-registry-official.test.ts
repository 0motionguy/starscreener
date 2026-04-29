import { describe, expect, it } from 'vitest';
import {
  buildMetrics,
  normalizeOfficial,
  type OfficialServerEntry,
} from '../src/fetchers/mcp-registry-official/client.js';

describe('mcp-registry-official buildMetrics', () => {
  it('returns empty when _meta is absent (current registry baseline)', () => {
    const entry: OfficialServerEntry = {
      server: { name: 'plain/mcp', description: 'no telemetry' },
    };
    expect(buildMetrics(entry)).toEqual({});
  });

  it('reads nested io.modelcontextprotocol/server namespace', () => {
    const entry: OfficialServerEntry = {
      server: { name: 'foo/bar' },
      _meta: {
        'io.modelcontextprotocol/server': {
          visitorsEstimateLastFourWeeks: 9100,
          useCount: 33,
          last24Hours: 2,
          last7Days: 14,
          last30Days: 70,
        },
      },
    };
    expect(buildMetrics(entry)).toEqual({
      visitors_4w: 9100,
      use_count: 33,
      popularity_24h: 2,
      popularity_7d: 14,
      popularity_30d: 70,
    });
  });

  it('reads flat dotted keys', () => {
    const entry: OfficialServerEntry = {
      server: { name: 'baz/qux' },
      _meta: {
        'io.modelcontextprotocol/server.visitorsEstimateLastFourWeeks': 5000,
        'io.modelcontextprotocol/server.installs': 21,
      },
    };
    expect(buildMetrics(entry)).toEqual({
      visitors_4w: 5000,
      use_count: 21,
    });
  });

  it('also accepts pulsemcp-style _meta extension if mirrored on the official feed', () => {
    const entry: OfficialServerEntry = {
      server: { name: 'mirror/mcp' },
      _meta: {
        'com.pulsemcp/server': {
          visitorsEstimateLastFourWeeks: 444,
        },
      },
    };
    expect(buildMetrics(entry).visitors_4w).toBe(444);
  });

  it('ignores non-numeric values', () => {
    const entry: OfficialServerEntry = {
      server: { name: 'noisy/mcp' },
      _meta: {
        'io.modelcontextprotocol/server': {
          visitorsEstimateLastFourWeeks: 'lots',
          useCount: null,
        },
      },
    };
    expect(buildMetrics(entry)).toEqual({});
  });
});

describe('normalizeOfficial', () => {
  it('attaches metrics to raw.metrics without losing original envelope', () => {
    const entry: OfficialServerEntry = {
      server: {
        name: 'io.github.example/svr',
        title: 'Example Server',
        description: 'desc',
        repository: { url: 'https://github.com/example/svr' },
        packages: [{ registryType: 'npm', identifier: '@example/svr' }],
      },
      _meta: {
        'io.modelcontextprotocol/server': {
          visitorsEstimateLastFourWeeks: 1234,
        },
      },
    };
    const norm = normalizeOfficial(entry);
    expect(norm).not.toBeNull();
    expect(norm!.source).toBe('official');
    expect(norm!.name).toBe('Example Server');
    expect(norm!.qualified_name).toBe('io.github.example/svr');
    expect(norm!.package_name).toBe('@example/svr');
    // Original envelope preserved verbatim alongside metrics.
    expect(norm!.raw.server).toBeTruthy();
    expect(norm!.raw._meta).toBeTruthy();
    expect(norm!.raw.metrics).toEqual({ visitors_4w: 1234 });
  });

  it('emits empty metrics when registry is silent (current production case)', () => {
    const entry: OfficialServerEntry = {
      server: { name: 'silent/mcp', description: 'no _meta' },
    };
    const norm = normalizeOfficial(entry);
    expect(norm).not.toBeNull();
    expect(norm!.raw.metrics).toEqual({});
  });

  it('returns null without a server name', () => {
    expect(normalizeOfficial({ server: {} })).toBeNull();
    expect(normalizeOfficial({})).toBeNull();
  });
});
