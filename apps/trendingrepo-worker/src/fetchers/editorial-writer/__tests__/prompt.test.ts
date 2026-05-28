import { describe, expect, it } from 'vitest';

import { EDITORIAL_BEST_TOPICS, buildBestUserMessage } from '../prompt.js';

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
