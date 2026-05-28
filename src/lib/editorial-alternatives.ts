// App-side reader for the worker's `editorial-alternatives` slug — LLM-written
// "alternatives to X" framing for the /alternatives/[owner]/[name] surfaces.
// Keyed by repo fullName (owner/name). See src/lib/editorial-reader.ts for the
// shared pattern; buildAlternativesIntro (src/lib/alternatives.ts) prefers
// getEditorialAlternatives(fullName)?.overview.

import { createEditorialReader, type EditorialItem } from "./editorial-reader";

const reader = createEditorialReader("editorial-alternatives");

export const refreshEditorialAlternativesFromStore = reader.refresh;
export const getEditorialAlternativesPayload = reader.getPayload;

/** The LLM overview for a repo fullName, or null when none is stored yet. */
export function getEditorialAlternatives(fullName: string): EditorialItem | null {
  return reader.getItem(fullName);
}

export const _resetEditorialAlternativesCacheForTests = reader.reset;
