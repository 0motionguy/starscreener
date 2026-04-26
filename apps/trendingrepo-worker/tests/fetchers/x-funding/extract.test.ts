import { describe, it, expect } from 'vitest';
import {
  tweetToSignal,
  createSignalId,
} from '../../../src/fetchers/x-funding/index.js';

const NOW = Date.parse('2026-04-26T12:00:00.000Z');
const DISCOVERED_AT = '2026-04-26T12:00:00.000Z';

describe('x-funding createSignalId', () => {
  it('uses twitter.com domain when sourceUrl points to twitter', () => {
    const id = createSignalId('Acme raised $50M', 'https://twitter.com/x/status/1');
    expect(id.startsWith('twitter.com-')).toBe(true);
  });

  it('is stable across calls', () => {
    const a = createSignalId('Acme raised $50M', 'https://twitter.com/x/status/1');
    const b = createSignalId('Acme raised $50M', 'https://twitter.com/x/status/1');
    expect(a).toBe(b);
  });
});

describe('tweetToSignal', () => {
  it('extracts amount + round + tags from a clean funding tweet', () => {
    const sig = tweetToSignal(
      {
        text: 'Excited to announce Acme raised $50M Series B led by a16z to scale our AI platform.',
        url: 'https://twitter.com/acme/status/123',
        createdAt: '2026-04-25T10:00:00.000Z',
        id: 123,
      },
      DISCOVERED_AT,
      NOW,
    );
    expect(sig).not.toBeNull();
    expect(sig?.sourcePlatform).toBe('twitter');
    expect(sig?.sourceUrl).toBe('https://twitter.com/acme/status/123');
    expect(sig?.discoveredAt).toBe(DISCOVERED_AT);
    expect(sig?.publishedAt).toBe('2026-04-25T10:00:00.000Z');
    expect(sig?.extracted?.amount).toBe(50_000_000);
    expect(sig?.extracted?.roundType).toBe('series-b');
    expect(sig?.tags).toContain('ai');
  });

  it('returns null when the tweet has no funding signal at all', () => {
    const sig = tweetToSignal(
      {
        text: 'This is just a regular tweet about coffee.',
        url: 'https://twitter.com/x/status/1',
        createdAt: '2026-04-25T10:00:00.000Z',
        id: 1,
      },
      DISCOVERED_AT,
      NOW,
    );
    expect(sig).toBeNull();
  });

  it('returns null when extractor finds only a company name (too noisy for tweet stream)', () => {
    // The extractor sometimes pulls a leading capitalized word as a company
    // even when no money / round is mentioned. We require amount OR roundType
    // to keep the stream clean.
    const sig = tweetToSignal(
      {
        text: 'Acme is launching a new dashboard today.',
        url: 'https://twitter.com/acme/status/1',
        createdAt: '2026-04-25T10:00:00.000Z',
        id: 1,
      },
      DISCOVERED_AT,
      NOW,
    );
    expect(sig).toBeNull();
  });

  it('drops tweets older than the 7-day window', () => {
    const sig = tweetToSignal(
      {
        text: 'Acme raised $20M Series A',
        url: 'https://twitter.com/acme/status/1',
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 1,
      },
      DISCOVERED_AT,
      NOW,
    );
    expect(sig).toBeNull();
  });

  it('handles full_text + screen_name fallbacks (older actor field shape)', () => {
    const sig = tweetToSignal(
      {
        full_text: 'NewCo just secured $100M Series C — biggest round of the year.',
        created_at: '2026-04-25T10:00:00.000Z',
        id: 99,
        user: { screen_name: 'newco' },
      },
      DISCOVERED_AT,
      NOW,
    );
    expect(sig).not.toBeNull();
    expect(sig?.sourceUrl).toBe('https://twitter.com/newco/status/99');
    expect(sig?.extracted?.amount).toBe(100_000_000);
    expect(sig?.extracted?.roundType).toBe('series-c');
  });

  it('truncates the headline at 280 chars but keeps full description', () => {
    const long = `Acme raised $5M seed round to build the biggest ${'x'.repeat(400)} platform`;
    const sig = tweetToSignal(
      {
        text: long,
        url: 'https://twitter.com/acme/status/1',
        createdAt: '2026-04-25T10:00:00.000Z',
        id: 1,
      },
      DISCOVERED_AT,
      NOW,
    );
    expect(sig).not.toBeNull();
    expect(sig?.headline.length).toBeLessThanOrEqual(280);
    expect(sig?.description.length).toBeGreaterThan(280);
  });

  it('returns null when text is empty', () => {
    const sig = tweetToSignal(
      { text: '', url: 'https://twitter.com/x/status/1', createdAt: '2026-04-25T10:00:00.000Z', id: 1 },
      DISCOVERED_AT,
      NOW,
    );
    expect(sig).toBeNull();
  });

  it('falls back to a synthetic url when no permalink fields are present', () => {
    const sig = tweetToSignal(
      {
        text: 'BoldCo raised $2B Series F round',
        createdAt: '2026-04-25T10:00:00.000Z',
      },
      DISCOVERED_AT,
      NOW,
    );
    expect(sig?.sourceUrl).toBe('https://twitter.com');
  });
});
