// Unit tests for stars-by-category — pure-function coverage only.
//
// The fetcher's `run()` is IO-bound (Redis reads + writes); leave that to the
// integration layer. What MUST stay correct:
//   1. classifyForHero produces deterministic, non-overlapping buckets.
//   2. rollingWindow returns exactly N consecutive UTC days ending today.
//   3. deltasInWindow:
//        - clamps negative day-over-day differences to 0
//        - credits the right (in-window) date
//        - ignores points outside the window
//        - returns zeros (not undefined) for days with no observation
//
// If any of these break, the chart silently mis-paints — exactly the kind of
// half-empty failure the user warned against.

import { describe, expect, it } from 'vitest';

import {
  classifyForHero,
  deltasInWindow,
  rollingWindow,
} from '../index.js';

describe('classifyForHero', () => {
  it('routes MCP first (most specific)', () => {
    expect(
      classifyForHero({
        fullName: 'modelcontextprotocol/servers',
        language: 'TypeScript',
        description: 'Model context protocol implementations',
      }),
    ).toBe('mcp');
    expect(
      classifyForHero({
        fullName: 'foo/mcp-everything',
        language: 'Python',
        description: 'Yet another server',
      }),
    ).toBe('mcp');
  });

  it('routes browser-automation before ai-agents', () => {
    // An "agent" that's really browser-driving stays in browser, not agents.
    expect(
      classifyForHero({
        fullName: 'browserbase/stagehand',
        language: 'TypeScript',
        description: 'Browser-use agent for AI workflows',
      }),
    ).toBe('browser-automation');
  });

  it('routes local-llm before ai-ml', () => {
    expect(
      classifyForHero({
        fullName: 'ggml-org/llama.cpp',
        language: 'C++',
        description: 'LLM inference in pure C/C++',
      }),
    ).toBe('local-llm');
    expect(
      classifyForHero({
        fullName: 'ollama/ollama',
        language: 'Go',
        description: 'Get up and running with large language models locally',
      }),
    ).toBe('local-llm');
  });

  it('routes ai-agents on framework keywords + naming', () => {
    expect(
      classifyForHero({
        fullName: 'addyosmani/agent-skills',
        language: 'TypeScript',
        description: 'Agent skills marketplace',
      }),
    ).toBe('ai-agents');
    expect(
      classifyForHero({
        fullName: 'crewAIInc/crewAI',
        language: 'Python',
        description: 'Framework for orchestrating role-playing autonomous AI agents',
      }),
    ).toBe('ai-agents');
  });

  it('routes ai-ml for models / training / RAG', () => {
    expect(
      classifyForHero({
        fullName: 'huggingface/transformers',
        language: 'Python',
        description: 'State-of-the-art Machine Learning for PyTorch, TensorFlow, and JAX',
      }),
    ).toBe('ai-ml');
  });

  it('routes devtools for tooling languages + keywords (after AI-family)', () => {
    expect(
      classifyForHero({
        fullName: 'rome/tools',
        language: 'Rust',
        description: 'Linter, formatter, bundler',
      }),
    ).toBe('devtools');
  });

  it('falls back to "other" when nothing matches', () => {
    expect(
      classifyForHero({
        fullName: 'someone/random-thing',
        language: 'Ruby',
        description: 'A web scraper for cat photos',
      }),
    ).toBe('other');
  });
});

describe('rollingWindow', () => {
  it('returns N consecutive UTC days ending TODAY', () => {
    const now = new Date('2026-05-30T18:00:00Z');
    const w = rollingWindow(5, now);
    expect(w).toEqual([
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-05-30',
    ]);
  });

  it('handles month boundaries', () => {
    const now = new Date('2026-03-02T00:30:00Z');
    const w = rollingWindow(3, now);
    expect(w).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
  });
});

describe('deltasInWindow', () => {
  const now = new Date('2026-05-30T12:00:00Z');
  const window = rollingWindow(5, now); // 2026-05-26 .. 2026-05-30

  it('returns zeros for an empty / null series', () => {
    expect([...deltasInWindow(null, window).values()]).toEqual([0, 0, 0, 0, 0]);
    expect([...deltasInWindow({ points: [] }, window).values()]).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect([...deltasInWindow({ points: [{ d: '2026-05-29', s: 10 }] }, window).values()]).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });

  it('credits the day of the LATER point (forward delta)', () => {
    const series = {
      points: [
        { d: '2026-05-25', s: 100 }, // anchor (out-of-window)
        { d: '2026-05-26', s: 110 }, // +10 → credited to 05-26
        { d: '2026-05-28', s: 130 }, // +20 → credited to 05-28
        { d: '2026-05-30', s: 135 }, // +5  → credited to 05-30
      ],
    };
    const got = deltasInWindow(series, window);
    expect(got.get('2026-05-26')).toBe(10);
    expect(got.get('2026-05-27')).toBe(0); // no observation
    expect(got.get('2026-05-28')).toBe(20);
    expect(got.get('2026-05-29')).toBe(0);
    expect(got.get('2026-05-30')).toBe(5);
  });

  it('clamps negative deltas (yanked stars) to 0', () => {
    const series = {
      points: [
        { d: '2026-05-26', s: 100 },
        { d: '2026-05-27', s: 95 }, // user un-starred — clamp to 0
        { d: '2026-05-28', s: 110 }, // +15 from yesterday → credit 15
      ],
    };
    const got = deltasInWindow(series, window);
    expect(got.get('2026-05-27')).toBe(0);
    expect(got.get('2026-05-28')).toBe(15);
  });

  it('ignores points outside the window entirely', () => {
    const series = {
      points: [
        { d: '2026-01-01', s: 0 },
        { d: '2026-01-02', s: 50 }, // huge jump pre-window — must NOT leak
        { d: '2026-05-27', s: 200 }, // first in-window point → credit (200-50)
      ],
    };
    const got = deltasInWindow(series, window);
    expect(got.get('2026-05-27')).toBe(150);
    // No window key should hold a value from the pre-window jump.
    expect([...got.values()].every((v) => v >= 0)).toBe(true);
  });
});
