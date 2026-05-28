import { describe, expect, it } from 'vitest';

import {
  EditorialReportSchema,
  EDITORIAL_BEST_TOPICS,
  buildBestUserMessage,
} from '../prompt.js';

describe('EditorialReportSchema', () => {
  const baseValid = {
    overview:
      'Vector databases store high-dimensional embeddings and serve nearest-neighbour queries for semantic search and RAG. Strong projects differ on index type, recall/latency tradeoffs and horizontal scaling.',
  };

  it('accepts a valid overview-only payload (tagline optional)', () => {
    expect(EditorialReportSchema.safeParse(baseValid).success).toBe(true);
  });

  it('accepts a payload WITH tagline', () => {
    expect(
      EditorialReportSchema.safeParse({ ...baseValid, tagline: 'embedding stores for AI search and RAG' }).success,
    ).toBe(true);
  });

  it('rejects an overview shorter than 40 chars (thin content guard)', () => {
    expect(EditorialReportSchema.safeParse({ overview: 'too short' }).success).toBe(false);
  });

  it('rejects an overview longer than 900 chars', () => {
    expect(EditorialReportSchema.safeParse({ overview: 'x'.repeat(901) }).success).toBe(false);
  });

  it('rejects a tagline over 160 chars', () => {
    expect(
      EditorialReportSchema.safeParse({ ...baseValid, tagline: 'x'.repeat(161) }).success,
    ).toBe(false);
  });

  it('rejects a missing overview', () => {
    expect(EditorialReportSchema.safeParse({ tagline: 'x' }).success).toBe(false);
  });
});

describe('EDITORIAL_BEST_TOPICS', () => {
  it('covers the 12 best-of topics', () => {
    expect(EDITORIAL_BEST_TOPICS).toHaveLength(12);
  });

  it('has unique, kebab-case slugs', () => {
    const slugs = EDITORIAL_BEST_TOPICS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('every topic has a non-empty title + blurb (LLM seed)', () => {
    for (const t of EDITORIAL_BEST_TOPICS) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
    }
  });

  // Drift sentinel: these slugs MUST stay in sync with BEST_TOPIC_SLUGS in
  // src/lib/best-topics.ts (the worker can't import app code). If best-topics
  // changes, mirror it in prompt.ts and update this list.
  it('matches the app best-topic slugs (keep-in-sync sentinel)', () => {
    const expected = [
      'ai-agents',
      'ai-coding-assistants',
      'mcp-servers',
      'local-llm-tools',
      'open-source-llms',
      'vector-databases',
      'browser-automation-tools',
      'developer-tools',
      'security-tools',
      'web-frameworks',
      'rust-projects',
      'self-hosted-ai',
    ];
    expect(EDITORIAL_BEST_TOPICS.map((t) => t.slug)).toEqual(expected);
  });
});

describe('buildBestUserMessage', () => {
  it('emits valid JSON carrying slug/title/blurb', () => {
    const [topic] = EDITORIAL_BEST_TOPICS;
    expect(topic).toBeDefined();
    if (!topic) return;
    const parsed = JSON.parse(buildBestUserMessage(topic));
    expect(parsed.slug).toBe(topic.slug);
    expect(parsed.title).toBe(topic.title);
    expect(parsed.blurb).toBe(topic.blurb);
  });
});
