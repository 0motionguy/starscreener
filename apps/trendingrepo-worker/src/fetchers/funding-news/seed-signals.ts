// Editorial floor for the funding-news leaderboard. A small curated set of
// known-quality recent rounds, kept here so the consumer page never goes
// empty even when every RSS source is quiet (or briefly 5xx).
//
// Mirrors the SEED_SIGNALS list in scripts/scrape-funding-news.mjs but
// trimmed to a maintainable subset. Operator can grow this list anytime —
// the full upstream seed (60+ entries) lives in the script and isn't worth
// duplicating here verbatim. Treat this as a "guaranteed minimum" floor,
// not the canonical archive.
//
// Each entry must satisfy the FundingSignal shape used by the fetcher.

import type { FundingExtraction } from '../../lib/sources/funding-extract.js';

export interface SeedFundingSignal {
  id: string;
  headline: string;
  description: string;
  sourceUrl: string;
  sourcePlatform: string;
  publishedAt: string;
  extracted: FundingExtraction | null;
  tags: string[];
}

export const SEED_SIGNALS: ReadonlyArray<SeedFundingSignal> = [
  {
    id: 'seed-cursor-growth-2026',
    headline: 'Cursor raises $2B growth round at $50B valuation',
    description: 'AI coding assistant Cursor has raised a $2 billion growth round.',
    sourceUrl: 'https://techcrunch.com/2026/04/17/cursor-raises-2b-growth-round/',
    sourcePlatform: 'techcrunch',
    publishedAt: '2026-04-17T00:00:00.000Z',
    extracted: {
      companyName: 'Cursor',
      companyWebsite: 'https://cursor.com',
      companyLogoUrl: 'https://github.com/getcursor.png',
      amount: 2_000_000_000,
      amountDisplay: '$2B',
      currency: 'USD',
      roundType: 'growth',
      investors: ['Thrive Capital', 'a16z', 'Sequoia'],
      investorsEnriched: [
        { name: 'Thrive Capital', isKnown: true, confidence: 'high' },
        { name: 'a16z', isKnown: true, confidence: 'high' },
        { name: 'Sequoia', isKnown: true, confidence: 'high' },
      ],
      confidence: 'high',
    },
    tags: ['ai', 'saas', 'devtools'],
  },
  {
    id: 'seed-elevenlabs-series-c-2026',
    headline: 'ElevenLabs raises $250M Series C at $3B valuation',
    description: 'AI voice synthesis startup ElevenLabs raised $250M in Series C funding.',
    sourceUrl: 'https://techcrunch.com/2026/01/20/elevenlabs-series-c/',
    sourcePlatform: 'techcrunch',
    publishedAt: '2026-01-20T00:00:00.000Z',
    extracted: {
      companyName: 'ElevenLabs',
      companyWebsite: 'https://elevenlabs.io',
      companyLogoUrl: 'https://logo.clearbit.com/elevenlabs.io',
      amount: 250_000_000,
      amountDisplay: '$250M',
      currency: 'USD',
      roundType: 'series-c',
      investors: ['a16z', 'Sequoia', 'Nat Friedman'],
      investorsEnriched: [
        { name: 'a16z', isKnown: true, confidence: 'high' },
        { name: 'Sequoia', isKnown: true, confidence: 'high' },
        { name: 'Nat Friedman', isKnown: true, confidence: 'high' },
      ],
      confidence: 'high',
    },
    tags: ['ai'],
  },
  {
    id: 'seed-poolside-series-a-2026',
    headline: 'Poolside raises $500M for AI coding models',
    description: 'Poolside raised $500 million to build AI models for software development.',
    sourceUrl: 'https://techcrunch.com/2026/03/15/poolside-raises-500m/',
    sourcePlatform: 'techcrunch',
    publishedAt: '2026-03-15T00:00:00.000Z',
    extracted: {
      companyName: 'Poolside',
      companyWebsite: 'https://poolside.ai',
      companyLogoUrl: 'https://github.com/poolside.png',
      amount: 500_000_000,
      amountDisplay: '$500M',
      currency: 'USD',
      roundType: 'series-a',
      investors: ['a16z', 'Redpoint'],
      investorsEnriched: [
        { name: 'a16z', isKnown: true, confidence: 'high' },
        { name: 'Redpoint', isKnown: true, confidence: 'high' },
      ],
      confidence: 'high',
    },
    tags: ['ai', 'devtools'],
  },
  {
    id: 'seed-groq-series-d-2026',
    headline: 'Groq raises $640M Series D for AI chips',
    description: 'AI chip startup Groq raised $640 million in Series D funding led by BlackRock.',
    sourceUrl: 'https://techcrunch.com/2026/02/10/groq-series-d/',
    sourcePlatform: 'techcrunch',
    publishedAt: '2026-02-10T00:00:00.000Z',
    extracted: {
      companyName: 'Groq',
      companyWebsite: 'https://groq.com',
      companyLogoUrl: 'https://github.com/groq.png',
      amount: 640_000_000,
      amountDisplay: '$640M',
      currency: 'USD',
      roundType: 'series-d-plus',
      investors: ['BlackRock', 'Type1 Ventures'],
      investorsEnriched: [
        { name: 'BlackRock', isKnown: true, confidence: 'high' },
        { name: 'Type1 Ventures', isKnown: false, confidence: 'medium' },
      ],
      confidence: 'high',
    },
    tags: ['ai', 'hardware'],
  },
  {
    id: 'seed-sierra-series-b-2026',
    headline: 'Sierra raises $175M Series B for AI customer service agents',
    description: 'Sierra raised $175M led by Greenoaks for conversational AI agents.',
    sourceUrl: 'https://techcrunch.com/2026/02/25/sierra-series-b/',
    sourcePlatform: 'techcrunch',
    publishedAt: '2026-02-25T00:00:00.000Z',
    extracted: {
      companyName: 'Sierra',
      companyWebsite: 'https://sierra.ai',
      companyLogoUrl: 'https://logo.clearbit.com/sierra.ai',
      amount: 175_000_000,
      amountDisplay: '$175M',
      currency: 'USD',
      roundType: 'series-b',
      investors: ['Greenoaks', 'Sequoia'],
      investorsEnriched: [
        { name: 'Greenoaks', isKnown: true, confidence: 'high' },
        { name: 'Sequoia', isKnown: true, confidence: 'high' },
      ],
      confidence: 'high',
    },
    tags: ['ai', 'agents'],
  },
];
