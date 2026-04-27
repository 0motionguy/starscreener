// Match a paper to a known AI lab via case-sensitive substring matching.
//
// Haystack is restricted to the most-reliable signal sources:
//   1. <arxiv:affiliation> values (parsed into paper.affiliations[])
//   2. Author names (paper.authors[])
//
// We deliberately do NOT match against the abstract or rawXml — papers
// frequently *reference* other labs in their abstracts ("we benchmark
// against Mistral 7B"), and matching there would mis-attribute the paper
// to the cited lab. False-positive cost > false-negative cost, since an
// unattributed paper just gets the default 1.0× boost (no harm), but a
// mis-attributed paper inflates the wrong lab's leaderboard.
//
// Tie-break (multiple labs matched the same number of patterns) is by
// total length of matched patterns — more specific evidence wins. So
// matching `'AI21 Labs'` (9 chars) beats matching `'AI2'` (3 chars).

import { AI_LAB_LIST, type AiLab } from '../../lib/registries/ai-labs.js';
import type { ArxivPaper } from './types.js';

export interface LabMatch {
  labId: string;
  hits: number;
  /** Sum of matched-pattern character lengths — used for specificity tie-break. */
  specificity: number;
  lab: AiLab;
}

export function detectLab(paper: ArxivPaper): LabMatch | null {
  const haystack = buildHaystack(paper);
  if (!haystack) return null;

  let best: LabMatch | null = null;
  for (const lab of AI_LAB_LIST) {
    let hits = 0;
    let specificity = 0;
    for (const pattern of lab.affiliation_patterns) {
      if (pattern && haystack.indexOf(pattern) !== -1) {
        hits += 1;
        specificity += pattern.length;
      }
    }
    if (hits === 0) continue;
    if (
      !best ||
      hits > best.hits ||
      (hits === best.hits && specificity > best.specificity)
    ) {
      best = { labId: lab.lab_id, hits, specificity, lab };
    }
  }
  return best;
}

function buildHaystack(paper: ArxivPaper): string {
  const parts: string[] = [];
  if (paper.affiliations.length > 0) parts.push(paper.affiliations.join('\n'));
  if (paper.authors.length > 0) parts.push(paper.authors.join('\n'));
  return parts.join('\n');
}
