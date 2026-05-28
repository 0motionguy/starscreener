import { describe, expect, it } from 'vitest';

import {
  EDITORIAL_CATEGORY_TOPICS,
  buildCategoryUserMessage,
} from '../prompt.js';

describe('EDITORIAL_CATEGORY_TOPICS', () => {
  it('covers the 15 category buckets', () => {
    expect(EDITORIAL_CATEGORY_TOPICS).toHaveLength(15);
  });

  it('has unique, kebab-case slugs', () => {
    const slugs = EDITORIAL_CATEGORY_TOPICS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('every topic has a non-empty name + description (LLM seed)', () => {
    for (const t of EDITORIAL_CATEGORY_TOPICS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  // Drift sentinel: these slugs MUST stay in sync with CATEGORIES (the `id`
  // field) in src/lib/constants.ts — the worker can't import app code. If a
  // category is added/renamed there, mirror it in prompt.ts and update this
  // list.
  it('matches the app category ids (keep-in-sync sentinel)', () => {
    const expected = [
      'ai-agents',
      'mcp',
      'devtools',
      'browser-automation',
      'local-llm',
      'security',
      'infrastructure',
      'design-engineering',
      'ai-ml',
      'web-frameworks',
      'databases',
      'mobile',
      'data-analytics',
      'crypto-web3',
      'rust-ecosystem',
    ];
    expect(EDITORIAL_CATEGORY_TOPICS.map((t) => t.slug)).toEqual(expected);
  });
});

describe('buildCategoryUserMessage', () => {
  it('emits valid JSON carrying slug/name/description', () => {
    const [topic] = EDITORIAL_CATEGORY_TOPICS;
    expect(topic).toBeDefined();
    if (!topic) return;
    const parsed = JSON.parse(buildCategoryUserMessage(topic));
    expect(parsed.slug).toBe(topic.slug);
    expect(parsed.name).toBe(topic.name);
    expect(parsed.description).toBe(topic.description);
  });
});
