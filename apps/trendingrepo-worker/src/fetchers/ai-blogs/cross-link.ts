// Per-post cross-link enrichment.

import { extractArxivIds } from '../../lib/util/arxiv-ids.js';

export interface CrossLinkResult {
  arxivIds: string[];
}

export function extractCrossLinks(text: string | null | undefined): CrossLinkResult {
  if (!text) return { arxivIds: [] };
  return { arxivIds: extractArxivIds(text) };
}
