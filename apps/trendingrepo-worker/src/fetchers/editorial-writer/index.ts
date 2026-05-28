import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { runEditorial, type EditorialWorkItem } from '../_editorial/run.js';
import {
  EDITORIAL_BEST_TOPICS,
  SYSTEM_PROMPT,
  buildBestUserMessage,
} from './prompt.js';

// Slug written to the data-store and read by the app via src/lib/editorial-store.ts
// (refreshEditorialBestFromStore / getEditorialBest). Keyed by /best topic slug.
const SLUG = 'editorial-best';

const fetcher: Fetcher = {
  name: 'editorial-writer',
  // Daily at 05:40 UTC — off the hourly consensus ticks (:00 analyst / :50
  // trending) and the 04:33 pool-sweep. Evergreen framing → daily is ample.
  schedule: '40 5 * * *',
  run(ctx: FetcherContext): Promise<RunResult> {
    return runEditorial(ctx, {
      slug: SLUG,
      fetcherName: 'editorial-writer',
      systemPrompt: SYSTEM_PROMPT,
      buildWorkItems: async (): Promise<EditorialWorkItem[]> =>
        EDITORIAL_BEST_TOPICS.map((t) => ({
          key: t.slug,
          title: t.title,
          userMessage: buildBestUserMessage(t),
        })),
    });
  },
};

export default fetcher;
