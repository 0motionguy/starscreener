import { describe, expect, it } from 'vitest';

import {
  CONSENSUS_WEIGHTS,
  EXTERNAL_SOURCES,
  bandCounts,
  scoreConsensus,
} from '../scoring.js';
import type {
  ConsensusExternalSource,
  ConsensusScoreInput,
  ConsensusSourceInput,
} from '../types.js';

function emptyInput(): ConsensusScoreInput {
  return {
    ours: [],
    gh: [],
    hf: [],
    hn: [],
    x: [],
    r: [],
    pdh: [],
    dev: [],
    bs: [],
  };
}

function source(rank: number, fullName = 'foo/bar'): ConsensusSourceInput {
  return { fullName, rank };
}

describe('CONSENSUS_WEIGHTS', () => {
  it('sums to 1.0 across the 8 external sources', () => {
    const sum = EXTERNAL_SOURCES.reduce((acc, k) => acc + CONSENSUS_WEIGHTS[k], 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('matches the design spec weights', () => {
    expect(CONSENSUS_WEIGHTS).toMatchObject({
      gh: 0.20,
      hf: 0.18,
      hn: 0.16,
      x: 0.14,
      r: 0.10,
      pdh: 0.08,
      dev: 0.08,
      bs: 0.06,
    });
  });
});

describe('scoreConsensus — coverage and ranking', () => {
  it('returns empty when all inputs empty', () => {
    const items = scoreConsensus(emptyInput());
    expect(items).toEqual([]);
  });

  it('produces one item per unique fullName, deduped case-insensitively', () => {
    const input = emptyInput();
    input.gh = [source(1, 'Alpha/Beta')];
    input.hf = [source(2, 'alpha/beta')];
    const items = scoreConsensus(input);
    expect(items).toHaveLength(1);
    expect(items[0]?.fullName).toBe('Alpha/Beta');
    expect(items[0]?.sources.gh.present).toBe(true);
    expect(items[0]?.sources.hf.present).toBe(true);
  });

  it('rank-1 across all 8 sources scores higher than rank-1 in only 1 source', () => {
    const high = emptyInput();
    EXTERNAL_SOURCES.forEach((k) => {
      (high[k] as ConsensusSourceInput[]) = [source(1, 'top/top')];
    });
    const lone = emptyInput();
    lone.gh = [source(1, 'lone/lone')];

    const merged: ConsensusScoreInput = {
      ...emptyInput(),
      gh: [...high.gh, ...lone.gh],
      hf: high.hf, hn: high.hn, x: high.x, r: high.r, pdh: high.pdh, dev: high.dev, bs: high.bs,
    };

    const items = scoreConsensus(merged);
    const top = items.find((i) => i.fullName === 'top/top');
    const solo = items.find((i) => i.fullName === 'lone/lone');
    expect(top!.consensusScore).toBeGreaterThan(solo!.consensusScore);
    expect(top!.sourceCount).toBe(8);
    expect(solo!.sourceCount).toBe(1);
  });

  it('respects the limit param and assigns ranks 1..N', () => {
    const input = emptyInput();
    input.gh = Array.from({ length: 20 }, (_, i) => source(i + 1, `a${i}/b`));
    const items = scoreConsensus({ ...input, limit: 5 });
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.rank)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('verdict bands', () => {
  it('STRONG_CONSENSUS: ≥5 sources present, max gap ≤ 30', () => {
    const input = emptyInput();
    const fn = 'consensus/repo';
    input.gh = [source(1, fn)];
    input.hf = [source(2, fn)];
    input.hn = [source(3, fn)];
    input.x = [source(4, fn)];
    input.r = [source(5, fn)];
    const [item] = scoreConsensus(input);
    expect(item?.verdict).toBe('strong_consensus');
    expect(item?.sourceCount).toBe(5);
    expect(item?.maxRankGap).toBeLessThanOrEqual(30);
  });

  it('EARLY_CALL: ours ≤ external_rank − 20', () => {
    const input = emptyInput();
    const fn = 'early/repo';
    input.ours = [source(1, fn)];
    // Subject only weakly visible on 2 external feeds (high rank values = low score)
    input.gh = [source(80, fn)];
    input.hf = [source(80, fn)];
    // Pad pool with 30 external-only competitors that all rank well —
    // ensures the subject lands deep in the external composite rank.
    for (let i = 0; i < 30; i += 1) {
      const decoy = `decoy${i}/repo`;
      input.hn.push(source(1, decoy));
      input.x.push(source(1, decoy));
      input.r.push(source(1, decoy));
    }
    const items = scoreConsensus(input);
    const item = items.find((i) => i.fullName === fn);
    expect(item?.oursRank).toBe(1);
    expect(item?.externalRank).not.toBeNull();
    expect(item!.externalRank!).toBeGreaterThan(20);
    expect(item?.verdict).toBe('early_call');
  });

  it('DIVERGENCE: 2+ sources, max gap > 30', () => {
    const input = emptyInput();
    const fn = 'divergent/repo';
    input.gh = [source(2, fn)];
    input.hf = [source(80, fn)];
    const [item] = scoreConsensus(input);
    expect(item?.verdict).toBe('divergence');
    expect(item?.maxRankGap).toBeGreaterThan(30);
  });

  it('EXTERNAL_ONLY: ours absent, ≥2 external present', () => {
    const input = emptyInput();
    const fn = 'extonly/repo';
    input.gh = [source(5, fn)];
    input.hf = [source(8, fn)];
    const [item] = scoreConsensus(input);
    expect(item?.verdict).toBe('external_only');
    expect(item?.oursRank).toBeNull();
    expect(item?.sourceCount).toBe(2);
  });

  it('SINGLE_SOURCE: only 1 source present', () => {
    const input = emptyInput();
    input.gh = [source(1, 'lonely/repo')];
    const [item] = scoreConsensus(input);
    expect(item?.verdict).toBe('single_source');
    expect(item?.sourceCount).toBe(1);
  });

  it('STRONG_CONSENSUS overrides EARLY_CALL when both apply (precedence)', () => {
    // ours=1, 5 externals at rank 1 → strong_consensus (gap 0) takes precedence
    const input = emptyInput();
    const fn = 'both/repo';
    input.ours = [source(1, fn)];
    input.gh = [source(1, fn)];
    input.hf = [source(1, fn)];
    input.hn = [source(1, fn)];
    input.x = [source(1, fn)];
    input.r = [source(1, fn)];
    const [item] = scoreConsensus(input);
    expect(item?.verdict).toBe('strong_consensus');
  });
});

describe('confidence', () => {
  it('is 0 when no external sources present', () => {
    const input = emptyInput();
    input.ours = [source(1, 'ours/only')];
    const [item] = scoreConsensus(input);
    expect(item?.confidence).toBe(0);
  });

  it('grows with weight-sum of present sources', () => {
    const ghOnly = emptyInput();
    ghOnly.gh = [source(1, 'a/a')];
    const ghHf = emptyInput();
    ghHf.gh = [source(1, 'b/b')];
    ghHf.hf = [source(1, 'b/b')];

    const [a] = scoreConsensus(ghOnly);
    const [b] = scoreConsensus(ghHf);
    expect(b!.confidence).toBeGreaterThan(a!.confidence);
  });

  it('penalizes high rank-gap (concordance factor)', () => {
    const tight = emptyInput();
    tight.gh = [source(2, 'a/a')];
    tight.hf = [source(3, 'a/a')];
    tight.hn = [source(2, 'a/a')];

    const wide = emptyInput();
    wide.gh = [source(1, 'b/b')];
    wide.hf = [source(99, 'b/b')];
    wide.hn = [source(50, 'b/b')];

    const [a] = scoreConsensus(tight);
    const [b] = scoreConsensus(wide);
    expect(a!.confidence).toBeGreaterThan(b!.confidence);
  });
});

describe('bandCounts', () => {
  it('aggregates verdict bands correctly', () => {
    const input = emptyInput();
    input.gh = [source(1, 'a/a')]; // single
    input.hf = [source(2, 'b/b'), source(3, 'a/a')];
    input.hn = [source(4, 'b/b'), source(5, 'a/a')];
    input.x = [source(6, 'a/a')];
    input.r = [source(7, 'a/a')];
    const items = scoreConsensus(input);
    const counts = bandCounts(items);
    expect(counts.strong_consensus + counts.divergence + counts.external_only + counts.single_source + counts.early_call).toBe(items.length);
  });
});
