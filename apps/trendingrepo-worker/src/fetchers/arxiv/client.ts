// arXiv Atom client. Pure-fetch + parse glue. 3s polite delay between pages.

import type { Logger } from 'pino';
import type { HttpClient } from '../../lib/types.js';
import { parseArxivAtom } from './atom-parser.js';
import type { ArxivCategory, ArxivFetchInput, ArxivFetchOutput, ArxivPaper } from './types.js';

const ARXIV_API = 'https://export.arxiv.org/api/query';
const POLITE_DELAY_MS = 3_000;

interface ClientDeps {
  http: HttpClient;
  log: Logger;
  sleepMs?: number;
}

export async function fetchCategory(
  deps: ClientDeps,
  input: ArxivFetchInput,
): Promise<ArxivFetchOutput> {
  const { http, log } = deps;
  const sleepMs = deps.sleepMs ?? POLITE_DELAY_MS;
  const sinceMs = Date.parse(input.sinceIso);
  if (!Number.isFinite(sinceMs)) {
    throw new Error(`fetchCategory: invalid sinceIso "${input.sinceIso}"`);
  }

  const seen = new Set<string>();
  const papers: ArxivPaper[] = [];
  let totalResults = 0;
  let pagesFetched = 0;
  let truncated = false;
  let crossedCutoff = false;

  for (let page = 0; page < input.maxPages; page++) {
    const url = buildQueryUrl(input.category, page * input.pageSize, input.pageSize);
    log.debug({ url, page, category: input.category }, 'arxiv page fetch');

    let body: string;
    try {
      const res = await http.text(url, { useEtagCache: false });
      body = res.data;
    } catch (err) {
      log.warn({ err: (err as Error).message, page, category: input.category }, 'arxiv page fetch failed');
      break;
    }
    pagesFetched += 1;

    const parsed = parseArxivAtom(body);
    if (parsed.errors.length > 0) {
      log.warn({ count: parsed.errors.length, sample: parsed.errors.slice(0, 3) }, 'arxiv atom parse errors on page');
    }
    if (page === 0) totalResults = parsed.totalResults;

    if (parsed.papers.length === 0) break;

    for (const paper of parsed.papers) {
      if (seen.has(paper.id)) continue;
      seen.add(paper.id);
      const updatedMs = Date.parse(paper.updatedAt);
      if (Number.isFinite(updatedMs) && updatedMs < sinceMs) {
        crossedCutoff = true;
        continue;
      }
      papers.push(paper);
    }

    if (crossedCutoff) break;
    if (parsed.papers.length < input.pageSize) break;

    if (page < input.maxPages - 1) {
      await sleep(sleepMs);
    } else {
      truncated = true;
    }
  }

  return { category: input.category, pagesFetched, totalResults, papers, truncated };
}

function buildQueryUrl(category: ArxivCategory, start: number, max: number): string {
  const params = new URLSearchParams({
    search_query: `cat:${category}`,
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    start: String(start),
    max_results: String(max),
  });
  return `${ARXIV_API}?${params.toString()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
