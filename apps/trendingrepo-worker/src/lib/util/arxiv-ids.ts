// Canonical arXiv id extractor. Reused by:
//   1. fetchers/arxiv          - normalizing self-emitted ids
//   2. fetchers/ai-blogs       - extracting arxiv refs from blog post text
//   3. fetchers/arxiv-mentions  - scanning HN/Reddit/GH text for citations (Phase 5)
//   4. fetchers/huggingface     - extracting paper refs from model cards
//
// Two id formats:
//   - new (since 2007-04): YYMM.NNNNN where NNNNN is 4 or 5 digits
//   - old (pre-2007):      archive.subject-class/YYMMNNN

interface MatchHit {
  start: number;
  id: string;
}

const URL_NEW_RE = /arxiv\.org\/(?:abs|pdf|html|ps)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf|\.ps)?/gi;
const URL_OLD_RE = /arxiv\.org\/(?:abs|pdf|html|ps)\/([a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf|\.ps)?/gi;
const PREFIX_NEW_RE = /arxiv[:\s]\s*(\d{4}\.\d{4,5})(?:v\d+)?/gi;
const PREFIX_OLD_RE = /arxiv[:\s]\s*([a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?/gi;
const DOI_NEW_RE = /10\.48550\/arxiv\.(\d{4}\.\d{4,5})(?:v\d+)?/gi;
const DOI_OLD_RE = /10\.48550\/arxiv\.([a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?/gi;
const STANDALONE_NEW_RE = /(?<![\d.])(\d{4}\.\d{4,5})(?:v\d+)?(?![\d.])/g;
const STANDALONE_OLD_RE = /(?<![A-Za-z0-9.])([a-z-]+(?:\.[A-Z]{2})\/\d{7})(?:v\d+)?(?![\d])/g;

/**
 * Extract canonical arxiv ids from arbitrary text. Deduped, source-order-preserving.
 */
export function extractArxivIds(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  const hits: MatchHit[] = [];
  const collect = (re: RegExp, transform?: (raw: string) => string): void => {
    for (const m of text.matchAll(re)) {
      const raw = m[1];
      if (!raw) continue;
      const id = transform ? transform(raw) : raw;
      hits.push({ start: m.index ?? 0, id });
    }
  };

  collect(URL_OLD_RE, preserveOldCase);
  collect(URL_NEW_RE);
  collect(DOI_OLD_RE, preserveOldCase);
  collect(DOI_NEW_RE);
  collect(PREFIX_OLD_RE, preserveOldCase);
  collect(PREFIX_NEW_RE);
  collect(STANDALONE_OLD_RE);
  collect(STANDALONE_NEW_RE);

  hits.sort((a, b) => a.start - b.start);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push(hit.id);
  }
  return out;
}

export function canonicalizeArxivAtomId(atomId: string): string | null {
  if (!atomId || typeof atomId !== 'string') return null;
  const ids = extractArxivIds(atomId);
  return ids[0] ?? null;
}

export function arxivAbsUrl(canonicalId: string): string {
  return `https://arxiv.org/abs/${canonicalId}`;
}

export function arxivPdfUrl(canonicalId: string): string {
  return `https://arxiv.org/pdf/${canonicalId}.pdf`;
}

export function arxivSlug(canonicalId: string): string {
  return `arxiv-${canonicalId.replace(/[./]/g, '-')}`;
}

function preserveOldCase(matched: string): string {
  const slash = matched.indexOf('/');
  if (slash < 0) return matched;
  const archive = matched.slice(0, slash);
  const id = matched.slice(slash);
  const dot = archive.indexOf('.');
  if (dot < 0) return archive.toLowerCase() + id;
  return archive.slice(0, dot).toLowerCase() + archive.slice(dot, dot + 1) + archive.slice(dot + 1).toUpperCase() + id;
}
