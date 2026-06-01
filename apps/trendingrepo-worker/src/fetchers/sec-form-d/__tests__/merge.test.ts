import { describe, expect, it } from 'vitest';
import { mergeSecFormDSignals } from '../index.js';

function signal(id: string, publishedAt: string, amount: number | null = null) {
  return {
    id,
    headline: `${id} filed Form D`,
    description: 'SEC Form D filing',
    sourceUrl: `https://www.sec.gov/${id}`,
    sourcePlatform: 'sec-form-d' as const,
    publishedAt,
    discoveredAt: publishedAt,
    extracted: {
      companyName: id,
      companyWebsite: null,
      companyLogoUrl: null,
      amount,
      amountDisplay: amount === null ? 'Undisclosed' : `$${amount}`,
      currency: 'USD' as const,
      roundType: 'undisclosed' as const,
      investors: [],
      investorsEnriched: [],
      confidence: 'medium' as const,
      industryGroup: null,
    },
    tags: ['sec', 'form-d', 'ai'],
  };
}

describe('mergeSecFormDSignals', () => {
  it('preserves prior SEC rows when a run finds no fresh rows', () => {
    const existing = [
      signal('sec-form-d-old', '2026-05-01T00:00:00.000Z'),
      signal('sec-form-d-newer', '2026-05-02T00:00:00.000Z'),
    ];

    const merged = mergeSecFormDSignals(existing, [], 50);

    expect(merged.map((row) => row.id)).toEqual([
      'sec-form-d-newer',
      'sec-form-d-old',
    ]);
  });

  it('lets fresh filings replace the same accession and caps newest first', () => {
    const existing = [
      signal('sec-form-d-dup', '2026-05-01T00:00:00.000Z', null),
      signal('sec-form-d-keep', '2026-05-02T00:00:00.000Z', 5),
    ];
    const fresh = [
      signal('sec-form-d-dup', '2026-05-03T00:00:00.000Z', 10),
      signal('sec-form-d-latest', '2026-05-04T00:00:00.000Z', 20),
    ];

    const merged = mergeSecFormDSignals(existing, fresh, 2);

    expect(merged.map((row) => row.id)).toEqual([
      'sec-form-d-latest',
      'sec-form-d-dup',
    ]);
    expect(merged.find((row) => row.id === 'sec-form-d-dup')?.extracted.amount).toBe(10);
  });
});
