import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMetrics,
  normalizePulse,
  type PulseMcpMetrics,
  type PulseServerEnvelope,
} from '../src/fetchers/pulsemcp/client.js';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(fixtureDir, 'fixtures', 'pulsemcp-server.json');
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  withAllMetrics: PulseServerEnvelope;
  withActiveInstallsFallback: PulseServerEnvelope;
  withNoMetrics: PulseServerEnvelope;
};

function metricsOf(envelope: PulseServerEnvelope): PulseMcpMetrics {
  const norm = normalizePulse(envelope);
  expect(norm).not.toBeNull();
  const raw = norm!.raw as { metrics?: PulseMcpMetrics };
  expect(raw.metrics).toBeDefined();
  return raw.metrics!;
}

describe('pulsemcp metrics subobject', () => {
  it('populates every metrics field when upstream emits them all', () => {
    const m = metricsOf(fixtures.withAllMetrics);
    expect(m.visitors_4w).toBe(42000);
    expect(m.use_count).toBe(1234);
    expect(m.popularity_24h).toBe(50);
    expect(m.popularity_7d).toBe(320);
    expect(m.popularity_30d).toBe(1500);
  });

  it('falls back to activeInstalls when useCount absent', () => {
    const m = metricsOf(fixtures.withActiveInstallsFallback);
    expect(m.visitors_4w).toBe(100);
    expect(m.use_count).toBe(7);
    expect(m.popularity_24h).toBeUndefined();
    expect(m.popularity_7d).toBeUndefined();
    expect(m.popularity_30d).toBeUndefined();
  });

  it('leaves all metrics undefined (not zero) when upstream emits no _meta', () => {
    const m = metricsOf(fixtures.withNoMetrics);
    expect(m.visitors_4w).toBeUndefined();
    expect(m.use_count).toBeUndefined();
    expect(m.popularity_24h).toBeUndefined();
    expect(m.popularity_7d).toBeUndefined();
    expect(m.popularity_30d).toBeUndefined();
  });

  it('preserves the original envelope alongside the metrics subobject', () => {
    const norm = normalizePulse(fixtures.withAllMetrics);
    const raw = norm!.raw as Record<string, unknown> & {
      server?: unknown;
      _meta?: unknown;
      metrics?: PulseMcpMetrics;
    };
    // Existing shape: full envelope passthrough (server + _meta) must still be there.
    expect(raw.server).toBeDefined();
    expect(raw._meta).toBeDefined();
    // New shape: metrics sits as a sibling.
    expect(raw.metrics).toBeDefined();
  });

  it('ignores non-numeric values defensively (never fakes a number)', () => {
    const m = buildMetrics({
      visitorsEstimateLastFourWeeks: 'lots' as unknown as number,
      useCount: null as unknown as number,
      last24Hours: Number.NaN,
      last7Days: Number.POSITIVE_INFINITY,
      last30Days: 12,
    });
    expect(m.visitors_4w).toBeUndefined();
    expect(m.use_count).toBeUndefined();
    expect(m.popularity_24h).toBeUndefined();
    expect(m.popularity_7d).toBeUndefined();
    expect(m.popularity_30d).toBe(12);
  });

  it('handles flat dotted _meta keys (com.pulsemcp/server.X) for visitors', () => {
    const envelope: PulseServerEnvelope = {
      server: { name: 'flat-mcp', description: 'flat keys' },
      _meta: {
        'com.pulsemcp/server.visitorsEstimateLastFourWeeks': 1500,
        'com.pulsemcp/server.useCount': 99,
      },
    };
    const norm = normalizePulse(envelope);
    const raw = norm!.raw as { metrics: PulseMcpMetrics };
    expect(raw.metrics.visitors_4w).toBe(1500);
    expect(raw.metrics.use_count).toBe(99);
  });
});
