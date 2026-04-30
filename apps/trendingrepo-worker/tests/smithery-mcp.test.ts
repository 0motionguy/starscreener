// Coverage for the Smithery (MCP) fetcher metrics surface. The /mcp page
// reads numeric stats off `raw.smithery.metrics.*` per the cross-source
// contract M4 consumes (visitors_4w, use_count, popularity_24h/7d/30d,
// quality_score). Smithery's registry only exposes useCount + score, so
// the time-windowed visitor fields stay undefined here by design — the
// shape is preserved across sources for uniform downstream code.
//
// Fixture: tests/fixtures/smithery-mcp-server.json — captured from
// https://registry.smithery.ai/servers?pageSize=1 on 2026-04-29 plus a
// synthetic null-score row to guard the optional path.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  normalizeSmithery,
  buildSmitheryMetrics,
  type SmitheryServerEntry,
} from '../src/fetchers/smithery/client.js';

interface FixtureShape {
  servers: SmitheryServerEntry[];
}

function loadFixture(): FixtureShape {
  const raw = readFileSync(
    resolve(__dirname, 'fixtures/smithery-mcp-server.json'),
    'utf8',
  );
  return JSON.parse(raw) as FixtureShape;
}

describe('normalizeSmithery — metrics subobject', () => {
  it('populates raw.smithery.metrics.use_count + quality_score from a populated entry', () => {
    const fixture = loadFixture();
    const exa = fixture.servers[0]!;
    const norm = normalizeSmithery(exa);
    expect(norm).not.toBeNull();

    // The merger spreads norm.raw into trending_items.raw.smithery, so this
    // assertion mirrors what M4 will read from the row.
    const raw = norm!.raw as { metrics?: Record<string, number | undefined> };
    expect(raw.metrics).toBeDefined();
    expect(raw.metrics!.use_count).toBe(56917);
    expect(raw.metrics!.quality_score).toBeCloseTo(0.4321, 4);

    // Fields Smithery does NOT expose must stay undefined — the contract
    // is uniform across sources but only what's available is populated.
    expect(raw.metrics!.visitors_4w).toBeUndefined();
    expect(raw.metrics!.popularity_24h).toBeUndefined();
    expect(raw.metrics!.popularity_7d).toBeUndefined();
    expect(raw.metrics!.popularity_30d).toBeUndefined();
  });

  it('omits quality_score when score is null and use_count when useCount is 0', () => {
    // Note: useCount=0 is a valid finite number, so use_count IS populated
    // (zero is meaningful — "deployed but no connections yet"). Only nulls
    // and non-finite values get dropped.
    const fixture = loadFixture();
    const trends = fixture.servers[1]!;
    const norm = normalizeSmithery(trends);
    expect(norm).not.toBeNull();
    const raw = norm!.raw as { metrics?: Record<string, number | undefined> };
    expect(raw.metrics).toBeDefined();
    expect(raw.metrics!.use_count).toBe(0);
    expect(raw.metrics!.quality_score).toBeUndefined();
  });

  it('preserves original Smithery fields alongside metrics in raw', () => {
    // Existing consumers that read raw.smithery.qualifiedName / useCount
    // directly must keep working — metrics is purely additive.
    const fixture = loadFixture();
    const exa = fixture.servers[0]!;
    const norm = normalizeSmithery(exa);
    const raw = norm!.raw as Record<string, unknown>;
    expect(raw.qualifiedName).toBe('exa');
    expect(raw.useCount).toBe(56917);
    expect(raw.metrics).toBeDefined();
  });

  it('buildSmitheryMetrics drops non-finite numbers', () => {
    const m = buildSmitheryMetrics({
      qualifiedName: 'broken',
      useCount: Number.NaN,
      score: Number.POSITIVE_INFINITY,
    } as SmitheryServerEntry);
    expect(m.use_count).toBeUndefined();
    expect(m.quality_score).toBeUndefined();
  });

  it('returns an empty metrics object when no numeric fields are present', () => {
    const m = buildSmitheryMetrics({ qualifiedName: 'bare' } as SmitheryServerEntry);
    expect(m).toEqual({});
  });
});
