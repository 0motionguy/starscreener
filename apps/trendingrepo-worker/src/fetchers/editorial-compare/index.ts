import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore } from '../../lib/redis.js';
import { runEditorial, type EditorialWorkItem } from '../_editorial/run.js';
import {
  COMPARE_SYSTEM_PROMPT,
  buildCompareUserMessage,
  compareKey,
} from './prompt.js';
import pairsData from './pairs.json' with { type: 'json' };

// Curated in-category compare pairs, generated app-side by
// scripts/dump-compare-pairs.ts (selectComparablePairs). Regenerate that file
// when the curated set drifts. fullNames are pre-sorted alphabetically per pair.
interface ComparePairSeed {
  a: string;
  b: string;
}
const PAIRS = pairsData as readonly ComparePairSeed[];

// Slug written to the data-store and read by the app via
// src/lib/editorial-compare.ts (getEditorialCompare). Keyed by `${a}__vs__${b}`.
const SLUG = 'editorial-compare';

// Minimal read shape of the consensus-verdicts slug (written by
// consensus-analyst). We only need tagline + summary to ground the prompt and
// to gate a pair (both repos must carry a real verdict).
interface VerdictItem {
  tagline?: string;
  summary?: string;
}
interface VerdictsPayload {
  items?: Record<string, VerdictItem>;
}

function shortName(fullName: string): string {
  const parts = fullName.split('/');
  return parts[1] ?? fullName;
}

const fetcher: Fetcher = {
  name: 'editorial-compare',
  // Daily at 05:47 UTC — after editorial-categories (05:42), off the hourly
  // consensus ticks (:00 analyst / :50 trending) and the 04:33 pool-sweep.
  schedule: '47 5 * * *',
  run(ctx: FetcherContext): Promise<RunResult> {
    return runEditorial(ctx, {
      slug: SLUG,
      fetcherName: 'editorial-compare',
      systemPrompt: COMPARE_SYSTEM_PROMPT,
      // Evergreen framing → only generate pairs we don't already have. The
      // curated set is small (~100); a cold start fills in one run (~1-2 min at
      // concurrency 4), then steady-state generates only newly-curated pairs.
      skipExisting: true,
      buildWorkItems: async (): Promise<EditorialWorkItem[]> => {
        const verdicts = await readDataStore<VerdictsPayload>('consensus-verdicts');
        const items = verdicts?.items ?? {};
        const work: EditorialWorkItem[] = [];
        for (const { a, b } of PAIRS) {
          const va = items[a];
          const vb = items[b];
          // Gate: both repos must carry a real verdict (same contract as
          // selectComparablePairs). Missing → the page keeps its deterministic
          // intro, so skip rather than write thin framing.
          if (!va?.summary?.trim() || !vb?.summary?.trim()) continue;
          work.push({
            key: compareKey(a, b),
            title: `${shortName(a)} vs ${shortName(b)}`,
            userMessage: buildCompareUserMessage({
              a,
              b,
              aTagline: va.tagline,
              aSummary: va.summary,
              bTagline: vb.tagline,
              bSummary: vb.summary,
            }),
          });
        }
        return work;
      },
    });
  },
};

export default fetcher;
