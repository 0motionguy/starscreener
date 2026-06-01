import { describe, expect, it } from 'vitest';
import { CRUNCHBASE_FEEDS } from '../../crunchbase/feeds.js';
import {
  FUNDING_AI_TAGGED_SOURCES,
  FUNDING_RSS_FEEDS,
} from '../index.js';

const hostupBlockedFundingFeeds = [
  'geekwire',
  'ai-news',
  'marktechpost',
  'unite-ai',
];

describe('funding feed inventory', () => {
  it('keeps HOSTUP-blocked funding RSS feeds out of the active poll set', () => {
    const activeFundingFeeds = Object.keys(FUNDING_RSS_FEEDS);

    for (const source of hostupBlockedFundingFeeds) {
      expect(activeFundingFeeds).not.toContain(source);
      expect(FUNDING_AI_TAGGED_SOURCES.has(source)).toBe(false);
    }
  });

  it('keeps HOSTUP-blocked crunchbase RSS feeds out of the active poll set', () => {
    expect(Object.keys(CRUNCHBASE_FEEDS)).not.toContain('finsmes');
  });
});
