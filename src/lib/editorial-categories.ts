// App-side reader for the worker's `editorial-categories` slug — LLM-written
// expert overviews for the /categories/[slug] surfaces. Keyed by category slug.
// See src/lib/editorial-reader.ts for the shared pattern; buildCategoryIntro
// (src/lib/categories.ts) prefers getEditorialCategories(slug)?.overview.

import { createEditorialReader, type EditorialItem } from "./editorial-reader";

const reader = createEditorialReader("editorial-categories");

export const refreshEditorialCategoriesFromStore = reader.refresh;
export const getEditorialCategoriesPayload = reader.getPayload;

/** The LLM overview for a category slug, or null when none is stored yet. */
export function getEditorialCategories(slug: string): EditorialItem | null {
  return reader.getItem(slug);
}

export const _resetEditorialCategoriesCacheForTests = reader.reset;
