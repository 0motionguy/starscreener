import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore } from '../../lib/redis.js';
import { runEditorial, type EditorialWorkItem } from '../_editorial/run.js';
import {
  ALTERNATIVES_SYSTEM_PROMPT,
  buildAlternativesUserMessage,
} from './prompt.js';

// Slug written to the data-store and read by the app via
// src/lib/editorial-alternatives.ts (getEditorialAlternatives). Keyed by repo
// fullName (owner/name).
const SLUG = 'editorial-alternatives';

// Cap NEW generations per run. The verdict-bearing set is the largest of the
// editorial surfaces (grows with the consensus backfill); overviews are
// evergreen, so skipExisting + this cap spread a cold start over a few daily
// runs and keep steady-state cost to just newly-analysed repos.
const MAX_NEW_PER_RUN = 50;

// Minimal read shape of the consensus-verdicts slug (written by
// consensus-analyst). We only need tagline/summary/whyNow to ground the prompt;
// the keys ARE the candidate repo fullNames.
interface VerdictItem {
  tagline?: string;
  summary?: string;
  whyNow?: string;
}
interface VerdictsPayload {
  items?: Record<string, VerdictItem>;
}

const fetcher: Fetcher = {
  name: 'editorial-alternatives',
  // Daily at 05:53 UTC — after editorial-compare (05:47), off the hourly
  // consensus ticks (:00 analyst / :50 trending) and the 04:33 pool-sweep.
  schedule: '53 5 * * *',
  run(ctx: FetcherContext): Promise<RunResult> {
    return runEditorial(ctx, {
      slug: SLUG,
      fetcherName: 'editorial-alternatives',
      systemPrompt: ALTERNATIVES_SYSTEM_PROMPT,
      skipExisting: true,
      maxNew: MAX_NEW_PER_RUN,
      buildWorkItems: async (): Promise<EditorialWorkItem[]> => {
        const verdicts = await readDataStore<VerdictsPayload>('consensus-verdicts');
        const items = verdicts?.items ?? {};
        const work: EditorialWorkItem[] = [];
        for (const [fullName, v] of Object.entries(items)) {
          // Gate on a real verdict so the framing has grounding. Repos without
          // one keep the deterministic intro on the page.
          if (!v?.summary?.trim()) continue;
          work.push({
            key: fullName,
            title: `Alternatives to ${fullName}`,
            userMessage: buildAlternativesUserMessage({
              fullName,
              tagline: v.tagline,
              summary: v.summary,
              whyNow: v.whyNow,
            }),
          });
        }
        // Deterministic order so the per-run cap fills predictably (not random
        // Object.entries order across runs).
        work.sort((x, y) => x.key.toLowerCase().localeCompare(y.key.toLowerCase()));
        return work;
      },
    });
  },
};

export default fetcher;
