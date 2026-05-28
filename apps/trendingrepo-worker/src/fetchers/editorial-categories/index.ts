import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { runEditorial, type EditorialWorkItem } from '../_editorial/run.js';
import {
  EDITORIAL_CATEGORY_TOPICS,
  CATEGORY_SYSTEM_PROMPT,
  buildCategoryUserMessage,
} from './prompt.js';

// Slug written to the data-store and read by the app via
// src/lib/editorial-categories.ts (refreshEditorialCategoriesFromStore /
// getEditorialCategories). Keyed by category slug.
const SLUG = 'editorial-categories';

const fetcher: Fetcher = {
  name: 'editorial-categories',
  // Daily at 05:42 UTC — just after editorial-writer (05:40), off the hourly
  // consensus ticks (:00 analyst / :50 trending) and the 04:33 pool-sweep.
  // 15 evergreen overviews → daily is ample.
  schedule: '42 5 * * *',
  run(ctx: FetcherContext): Promise<RunResult> {
    return runEditorial(ctx, {
      slug: SLUG,
      fetcherName: 'editorial-categories',
      systemPrompt: CATEGORY_SYSTEM_PROMPT,
      buildWorkItems: async (): Promise<EditorialWorkItem[]> =>
        EDITORIAL_CATEGORY_TOPICS.map((t) => ({
          key: t.slug,
          title: t.name,
          userMessage: buildCategoryUserMessage(t),
        })),
    });
  },
};

export default fetcher;
