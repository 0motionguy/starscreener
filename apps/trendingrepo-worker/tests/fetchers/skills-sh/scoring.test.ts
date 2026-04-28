import { describe, it, expect } from 'vitest';
import {
  OPENCLAW_BOOST,
  RECENCY_HALF_LIFE_DAYS,
  VELOCITY_WEIGHT,
  compositeScore,
  openclawMultiplier,
  rankVelocity,
  recencyDecay,
  scoreRow,
} from '../../../src/fetchers/skills-sh/scoring.js';
import type { SkillRow } from '../../../src/fetchers/skills-sh/types.js';

describe('openclawMultiplier', () => {
  it('returns 1.20 when openclaw is in agents', () => {
    expect(openclawMultiplier(['claude-code', 'openclaw'])).toBe(OPENCLAW_BOOST);
    expect(openclawMultiplier(['openclaw'])).toBe(OPENCLAW_BOOST);
  });
  it('returns 1.00 otherwise', () => {
    expect(openclawMultiplier(['claude-code', 'cursor'])).toBe(1);
    expect(openclawMultiplier([])).toBe(1);
  });
});

describe('recencyDecay', () => {
  it('returns 1 for null, future, or now', () => {
    expect(recencyDecay(null)).toBe(1);
    expect(recencyDecay(new Date(Date.now() + 1000))).toBe(1);
  });
  it('halves at half-life', () => {
    const halfLife = new Date(Date.now() - RECENCY_HALF_LIFE_DAYS * 86_400_000);
    expect(recencyDecay(halfLife)).toBeCloseTo(0.5, 6);
  });
});

describe('rankVelocity', () => {
  it('returns 0 for missing inputs or zero maxRank', () => {
    expect(rankVelocity(null, null, 100)).toBe(0);
    expect(rankVelocity(10, 5, 0)).toBe(0);
  });
  it('positive when 24h rank rose vs all-time', () => {
    // all-time #50, now #20 -> rising. (50-20)/100 = 0.30.
    expect(rankVelocity(50, 20, 100)).toBeCloseTo(0.3, 6);
  });
});

describe('compositeScore', () => {
  it('OpenClaw boost is exactly 1.20x the same input without it', () => {
    const base = compositeScore({
      installs: 10_000,
      agents: ['claude-code'],
      lastPushed: null,
      rankAllTime: null,
      rank24h: null,
      maxRank: 1,
    });
    const boosted = compositeScore({
      installs: 10_000,
      agents: ['claude-code', 'openclaw'],
      lastPushed: null,
      rankAllTime: null,
      rank24h: null,
      maxRank: 1,
    });
    expect(boosted / base).toBeCloseTo(OPENCLAW_BOOST, 3);
  });

  it('weights and constants are sane', () => {
    expect(OPENCLAW_BOOST).toBe(1.2);
    expect(RECENCY_HALF_LIFE_DAYS).toBe(30);
    expect(VELOCITY_WEIGHT).toBe(0.25);
  });

  it('produces finite, monotonic-in-installs scores for a sample batch', () => {
    const inputs = [10, 100, 1_000, 10_000, 100_000, 1_000_000].map((installs) =>
      compositeScore({
        installs,
        agents: [],
        lastPushed: null,
        rankAllTime: null,
        rank24h: null,
        maxRank: 1,
      }),
    );
    for (const s of inputs) expect(Number.isFinite(s)).toBe(true);
    for (let i = 1; i < inputs.length; i += 1) {
      expect(inputs[i]).toBeGreaterThan(inputs[i - 1]!);
    }
  });
});

describe('scoreRow', () => {
  const baseRow: SkillRow = {
    rank: 5,
    skill_name: 'find-skills',
    owner: 'vercel-labs',
    repo: 'skills',
    source_id: 'vercel-labs/skills/find-skills',
    url: 'https://skills.sh/vercel-labs/skills/find-skills',
    github_url: 'https://github.com/vercel-labs/skills/tree/main/find-skills',
    installs: 50_000,
    agents: ['claude-code', 'cursor'],
    view: 'all-time',
    fetchedAt: '2026-04-26T00:00:00Z',
  };

  it('flags openclaw_compatible accurately', () => {
    const off = scoreRow(baseRow, 100, null);
    expect(off.openclaw_compatible).toBe(false);
    const on = scoreRow({ ...baseRow, agents: [...baseRow.agents, 'openclaw'] }, 100, null);
    expect(on.openclaw_compatible).toBe(true);
  });

  it('returns velocity null when only one rank source present', () => {
    const out = scoreRow(baseRow, 100, null);
    expect(out.velocity).toBeNull();
  });

  it('produces a finite score and propagates the base row fields', () => {
    const out = scoreRow(baseRow, 100, null);
    expect(Number.isFinite(out.trending_score)).toBe(true);
    expect(out.source_id).toBe(baseRow.source_id);
    expect(out.skill_name).toBe(baseRow.skill_name);
  });
});
