import { describe, expect, it } from 'vitest';

import {
  CitationSchema,
  ItemReportSchema,
  buildCitationCandidates,
  buildItemUserMessage,
} from '../prompt.js';
import type {
  ConsensusItem,
  ConsensusSource,
  ConsensusSourceComponent,
} from '../../consensus-trending/types.js';

// Minimal helper to construct a ConsensusItem with present-flag-only source
// components, ranked by an external rank map. Defaults absent sources.
function makeItem(
  fullName: string,
  presentRanks: Partial<Record<ConsensusSource, number>>,
): ConsensusItem {
  const allSources: ConsensusSource[] = [
    'ours',
    'gh',
    'hf',
    'hn',
    'x',
    'r',
    'pdh',
    'dev',
    'bs',
  ];
  const sources = Object.fromEntries(
    allSources.map((src) => {
      const rank = presentRanks[src];
      const component: ConsensusSourceComponent =
        typeof rank === 'number'
          ? { present: true, rank, score: 100 - rank, normalized: 1 - rank / 100 }
          : { present: false, rank: null, score: null, normalized: 0 };
      return [src, component];
    }),
  ) as Record<ConsensusSource, ConsensusSourceComponent>;
  return {
    fullName,
    rank: 1,
    consensusScore: 75,
    confidence: 80,
    sourceCount: Object.values(presentRanks).filter((r) => typeof r === 'number')
      .length,
    externalRank: 1,
    oursRank: presentRanks.ours ?? null,
    maxRankGap: 5,
    verdict: 'strong_consensus',
    sources,
  };
}

describe('CitationSchema', () => {
  it('accepts a valid https citation', () => {
    expect(
      CitationSchema.safeParse({ title: 'GitHub: owner/repo', url: 'https://github.com/owner/repo' })
        .success,
    ).toBe(true);
  });

  it('rejects http (non-https)', () => {
    expect(
      CitationSchema.safeParse({ title: 'x', url: 'http://example.com' }).success,
    ).toBe(false);
  });

  it('rejects javascript: scheme', () => {
    expect(
      CitationSchema.safeParse({ title: 'x', url: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });

  it('rejects relative URLs', () => {
    expect(
      CitationSchema.safeParse({ title: 'x', url: '/local/path' }).success,
    ).toBe(false);
  });

  it('rejects titles over 80 chars', () => {
    expect(
      CitationSchema.safeParse({ title: 'x'.repeat(81), url: 'https://x.com' })
        .success,
    ).toBe(false);
  });
});

describe('ItemReportSchema (rolling-deploy compat)', () => {
  const baseValid = {
    summary: 'A summary',
    scores: {
      momentum: 50,
      credibility: 50,
      crossSource: 50,
      developerAdoption: 50,
      marketRelevance: 50,
      hypeRisk: 50,
    },
    evidence: ['point 1'],
    contrarian: 'might fail',
    verdict: 'strong',
    confidence: 80,
    whyNow: 'release happened',
    whatToDo: 'watch',
    whatToDoDetail: 'monitor stars',
  };

  it('accepts legacy payload WITHOUT tagline or citations (back-compat)', () => {
    expect(ItemReportSchema.safeParse(baseValid).success).toBe(true);
  });

  it('accepts payload WITH tagline and citations', () => {
    expect(
      ItemReportSchema.safeParse({
        ...baseValid,
        tagline: 'open-source agent orchestration framework',
        citations: [
          { title: 'GitHub: owner/repo', url: 'https://github.com/owner/repo' },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects citations array longer than 8', () => {
    const tooMany = Array.from({ length: 9 }, (_, i) => ({
      title: `s${i}`,
      url: `https://example.com/${i}`,
    }));
    expect(
      ItemReportSchema.safeParse({ ...baseValid, citations: tooMany }).success,
    ).toBe(false);
  });

  it('rejects tagline over 160 chars', () => {
    expect(
      ItemReportSchema.safeParse({ ...baseValid, tagline: 'x'.repeat(161) })
        .success,
    ).toBe(false);
  });
});

describe('buildCitationCandidates', () => {
  it('returns one https candidate per present external source', () => {
    const item = makeItem('owner/repo', { gh: 1, hn: 5, r: 3 });
    const candidates = buildCitationCandidates(item);
    expect(candidates).toHaveLength(3);
    for (const c of candidates) {
      expect(c.url).toMatch(/^https:\/\//);
      // Validates against the strict schema — the LLM's output must pass the
      // same gate, so candidates must too.
      expect(CitationSchema.safeParse(c).success).toBe(true);
    }
  });

  it('GitHub is always first when present', () => {
    const item = makeItem('owner/repo', { gh: 100, hn: 1, r: 1 });
    const candidates = buildCitationCandidates(item);
    expect(candidates[0]?.url).toBe('https://github.com/owner/repo');
  });

  it('non-GH candidates are sorted by ascending rank (lower = better)', () => {
    const item = makeItem('owner/repo', { hn: 50, r: 5, dev: 20 });
    const ordered = buildCitationCandidates(item).map((c) => c.url);
    // Reddit (rank 5) < dev (20) < HN (50)
    expect(ordered[0]).toContain('reddit.com');
    expect(ordered[1]).toContain('dev.to');
    expect(ordered[2]).toContain('hn.algolia.com');
  });

  it('omits the internal "ours" source from citations', () => {
    const item = makeItem('owner/repo', { ours: 1, gh: 1 });
    const urls = buildCitationCandidates(item).map((c) => c.url);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://github.com/owner/repo');
  });

  it('URL-encodes entity names with special chars', () => {
    const item = makeItem('owner/repo with spaces', { hn: 1 });
    const candidates = buildCitationCandidates(item);
    expect(candidates[0]?.url).toContain('owner%2Frepo%20with%20spaces');
  });

  it('returns empty array when no external sources are present', () => {
    const item = makeItem('owner/repo', { ours: 1 });
    expect(buildCitationCandidates(item)).toEqual([]);
  });
});

describe('buildItemUserMessage', () => {
  const ctx = {
    poolSize: 200,
    bandCounts: {
      strong_consensus: 1,
      early_call: 1,
      divergence: 0,
      external_only: 0,
      single_source: 0,
    },
    sourceStats: {
      gh: { count: 10, rows: 100 },
      hf: { count: 0, rows: 0 },
      hn: { count: 5, rows: 50 },
      x: { count: 0, rows: 0 },
      r: { count: 3, rows: 30 },
      pdh: { count: 0, rows: 0 },
      dev: { count: 0, rows: 0 },
      bs: { count: 0, rows: 0 },
    },
    weights: {
      gh: 0.25,
      hf: 0.1,
      hn: 0.15,
      x: 0.1,
      r: 0.15,
      pdh: 0.05,
      dev: 0.1,
      bs: 0.1,
    },
  };

  it('includes citationCandidates in the JSON payload', () => {
    const item = makeItem('owner/repo', { gh: 1, hn: 5 });
    const msg = buildItemUserMessage(item, ctx);
    const parsed = JSON.parse(msg);
    expect(Array.isArray(parsed.citationCandidates)).toBe(true);
    expect(parsed.citationCandidates).toHaveLength(2);
    expect(parsed.citationCandidates[0].url).toBe('https://github.com/owner/repo');
  });

  it('still includes the original entity/sources/consensus fields', () => {
    const item = makeItem('owner/repo', { gh: 1 });
    const parsed = JSON.parse(buildItemUserMessage(item, ctx));
    expect(parsed.entity.fullName).toBe('owner/repo');
    expect(parsed.consensus.score).toBe(75);
    expect(parsed.weights).toEqual(ctx.weights);
  });
});
