// App-side reader for the worker's `editorial-compare` slug — LLM-written
// "X vs Y" framing for the /compare/[a]/vs/[b] surfaces. Keyed by `${a}__vs__${b}`
// (fullNames sorted alphabetically, the canonical comparePath order). See
// src/lib/editorial-reader.ts for the shared pattern; buildCompareIntro
// (src/lib/compare-pairs.ts) prefers getEditorialCompare(key)?.overview.

import { createEditorialReader, type EditorialItem } from "./editorial-reader";

const reader = createEditorialReader("editorial-compare");

export const refreshEditorialCompareFromStore = reader.refresh;
export const getEditorialComparePayload = reader.getPayload;

/** The LLM overview for a compare pair key, or null when none is stored yet. */
export function getEditorialCompare(pairKey: string): EditorialItem | null {
  return reader.getItem(pairKey);
}

export const _resetEditorialCompareCacheForTests = reader.reset;
