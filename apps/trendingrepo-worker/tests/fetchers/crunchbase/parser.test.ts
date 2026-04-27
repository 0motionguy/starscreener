import { describe, it, expect } from 'vitest';
import {
  buildSignalsFromItems,
  createSignalId,
} from '../../../src/fetchers/crunchbase/index.js';
import { parseRssItems } from '../../../src/lib/sources/funding-extract.js';

const NOW = Date.parse('2026-04-26T12:00:00.000Z');

describe('crunchbase createSignalId', () => {
  it('produces a stable id from headline + sourceUrl', () => {
    const a = createSignalId(
      'Acme raises $50M Series B',
      'https://news.crunchbase.com/sections/venture/acme-50m/',
    );
    const b = createSignalId(
      'Acme raises $50M Series B',
      'https://news.crunchbase.com/sections/venture/acme-50m/',
    );
    expect(a).toBe(b);
    expect(a.startsWith('news.crunchbase.com-')).toBe(true);
  });

  it('changes id when domain differs', () => {
    const a = createSignalId('Acme raises $50M', 'https://techcrunch.com/x');
    const b = createSignalId('Acme raises $50M', 'https://techfundingnews.com/x');
    expect(a).not.toBe(b);
  });
});

describe('crunchbase buildSignalsFromItems', () => {
  const discoveredAt = '2026-04-26T12:00:00.000Z';

  it('extracts amount + round + tags from a real-shaped headline', () => {
    const items = [
      {
        headline: 'Anthropic raises $4 billion Series E led by Google',
        description:
          'AI safety lab Anthropic announced a $4B Series E round led by Google with participation from Salesforce.',
        sourceUrl: 'https://news.crunchbase.com/sections/venture/anthropic-4b/',
        publishedAt: '2026-04-25T10:00:00.000Z',
      },
    ];
    const signals = buildSignalsFromItems(items, 'crunchbase-venture', discoveredAt, NOW);
    expect(signals).toHaveLength(1);
    const s = signals[0]!;
    expect(s.sourcePlatform).toBe('crunchbase-venture');
    expect(s.discoveredAt).toBe(discoveredAt);
    expect(s.publishedAt).toBe('2026-04-25T10:00:00.000Z');
    expect(s.extracted?.amount).toBe(4_000_000_000);
    // ROUND_PATTERNS in lib/sources/funding-extract.ts collapses Series D-Z
    // into one bucket; "Series E" therefore extracts as `series-d-plus`.
    expect(s.extracted?.roundType).toBe('series-d-plus');
    expect(s.tags).toContain('ai');
  });

  it('drops items missing the funding keyword', () => {
    const items = [
      {
        headline: 'Anthropic launches new model',
        description: 'A new model from the AI lab.',
        sourceUrl: 'https://news.crunchbase.com/x/anthropic-launch',
        publishedAt: '2026-04-25T10:00:00.000Z',
      },
    ];
    expect(buildSignalsFromItems(items, 'crunchbase-venture', discoveredAt, NOW)).toEqual([]);
  });

  it('drops items older than the 21-day window', () => {
    const items = [
      {
        headline: 'Old Co raised $10M Seed',
        description: 'Old funding announcement',
        sourceUrl: 'https://news.crunchbase.com/x/old',
        publishedAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    expect(buildSignalsFromItems(items, 'crunchbase-venture', discoveredAt, NOW)).toEqual([]);
  });

  it('keeps items with non-finite publishedAt (best-effort fallthrough)', () => {
    // parseRssItems falls back to "now" when pubDate is missing/unparseable —
    // this guards against a stricter rewrite accidentally dropping those.
    const items = [
      {
        headline: 'NewCo raised $25M Series A',
        description: 'NewCo announced their A round',
        sourceUrl: 'https://techfundingnews.com/x',
        publishedAt: discoveredAt,
      },
    ];
    const signals = buildSignalsFromItems(items, 'techfundingnews', discoveredAt, NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.extracted?.amount).toBe(25_000_000);
    expect(signals[0]?.extracted?.roundType).toBe('series-a');
  });

  it('drops items whose extracted companyName trips BAD_NAME_PATTERN', () => {
    // The extractor often grabs a person's name (e.g., "Cathie Wood") as the
    // company; BAD_NAME_PATTERN filters those out. This test pins the filter
    // so a future patch to extractCompanyName doesn't accidentally let them
    // through.
    const items = [
      {
        headline: 'Cathie Wood raises $50M Series B funding for new fund',
        description: 'ARK Invest founder closes a new vehicle.',
        sourceUrl: 'https://techfundingnews.com/cathie-wood-50m',
        publishedAt: '2026-04-25T10:00:00.000Z',
      },
    ];
    expect(buildSignalsFromItems(items, 'techfundingnews', discoveredAt, NOW)).toEqual([]);
  });
});

describe('parseRssItems integration sanity', () => {
  it('parses a tiny RSS doc end-to-end through buildSignalsFromItems', () => {
    const xml = `
      <rss version="2.0">
        <channel>
          <item>
            <title><![CDATA[ Acme raises $250M Series C led by a16z ]]></title>
            <link>https://news.crunchbase.com/sections/venture/acme-250m/</link>
            <description>Acme closed a $250M Series C round.</description>
            <pubDate>Sat, 25 Apr 2026 10:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Unrelated: Apple ships new phone</title>
            <link>https://example.com/apple</link>
            <description>Just a launch.</description>
            <pubDate>Sat, 25 Apr 2026 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `;
    const items = parseRssItems(xml);
    expect(items).toHaveLength(2);
    const signals = buildSignalsFromItems(items, 'crunchbase-venture', '2026-04-26T12:00:00.000Z', NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.extracted?.amount).toBe(250_000_000);
    expect(signals[0]?.extracted?.roundType).toBe('series-c');
  });
});
