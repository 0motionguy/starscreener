// Match a paper to a known AI lab via case-sensitive substring matching.

import { AI_LAB_LIST, type AiLab } from '../../lib/registries/ai-labs.js';
import type { ArxivPaper } from './types.js';

export interface LabMatch {
  labId: string;
  hits: number;
  lab: AiLab;
}

const ABSTRACT_INTRO_CHARS = 500;

export function detectLab(paper: ArxivPaper): LabMatch | null {
  const haystack = buildHaystack(paper);
  if (!haystack) return null;

  let best: LabMatch | null = null;
  for (const lab of AI_LAB_LIST) {
    let hits = 0;
    for (const pattern of lab.affiliation_patterns) {
      if (pattern && haystack.indexOf(pattern) !== -1) hits += 1;
    }
    if (hits === 0) continue;
    if (!best || hits > best.hits) {
      best = { labId: lab.lab_id, hits, lab };
    }
  }
  return best;
}

function buildHaystack(paper: ArxivPaper): string {
  const parts: string[] = [];
  if (paper.affiliations.length > 0) parts.push(paper.affiliations.join('\n'));
  if (paper.authors.length > 0) parts.push(paper.authors.join('\n'));
  if (paper.abstract) parts.push(paper.abstract.slice(0, ABSTRACT_INTRO_CHARS));
  if (paper.rawXml) parts.push(paper.rawXml);
  return parts.join('\n');
}
