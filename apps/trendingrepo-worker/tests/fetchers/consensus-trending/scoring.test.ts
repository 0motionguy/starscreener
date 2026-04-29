import { describe, expect, it } from 'vitest';
import {
  CONSENSUS_WEIGHTS,
  scoreConsensus,
} from '../../../src/fetchers/consensus-trending/scoring.js';

describe('consensus-trending scoring', () => {
  it('keeps consensus weights normalized', () => {
    const sum = Object.values(CONSENSUS_WEIGHTS).reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('ranks three-source consensus above a single-source high score', () => {
    const items = scoreConsensus({
      ours: [
        { fullName: 'alpha/solo', rank: 1, score: 96 },
        { fullName: 'beta/consensus', rank: 2, score: 70 },
      ],
      oss: [
        { fullName: 'beta/consensus', rank: 1, score: 1000 },
      ],
      trendshift: [
        { fullName: 'beta/consensus', rank: 1 },
      ],
      limit: 10,
    });

    expect(items.map((i) => i.fullName)).toEqual([
      'beta/consensus',
      'alpha/solo',
    ]);
    expect(items[0]?.badges).toContain('consensus_pick');
    expect(items[1]?.badges).toContain('our_early_signal');
  });

  it('marks external breakouts and deterministic ties', () => {
    const items = scoreConsensus({
      ours: [],
      oss: [
        { fullName: 'zeta/tool', rank: 1, score: 500 },
        { fullName: 'alpha/tool', rank: 1, score: 500 },
      ],
      trendshift: [
        { fullName: 'zeta/tool', rank: 1 },
        { fullName: 'alpha/tool', rank: 1 },
      ],
      limit: 10,
    });

    expect(items.map((i) => i.fullName)).toEqual(['alpha/tool', 'zeta/tool']);
    expect(items[0]?.badges).toContain('external_breakout');
    expect(items[1]?.badges).toContain('external_breakout');
  });
});
