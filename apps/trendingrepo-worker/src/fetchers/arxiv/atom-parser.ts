// Pure parser: arXiv Atom XML -> ArxivPaper[]. No I/O.

import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import { canonicalizeArxivAtomId, arxivAbsUrl, arxivPdfUrl } from '../../lib/util/arxiv-ids.js';
import type { ArxivPaper } from './types.js';

export interface AtomParseResult {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  papers: ArxivPaper[];
  errors: Array<{ index: number; reason: string }>;
}

const EMPTY: AtomParseResult = {
  totalResults: 0, startIndex: 0, itemsPerPage: 0, papers: [], errors: [],
};

export function parseArxivAtom(xml: string): AtomParseResult {
  if (!xml || typeof xml !== 'string') return { ...EMPTY };
  let $: CheerioAPI;
  try {
    $ = cheerio.load(xml, { xmlMode: true });
  } catch (err) {
    return { ...EMPTY, errors: [{ index: -1, reason: `xml-load-failed: ${(err as Error).message}` }] };
  }

  const totalResults = parseInt(textOfFirst($, 'opensearch\\:totalResults'), 10) || 0;
  const startIndex = parseInt(textOfFirst($, 'opensearch\\:startIndex'), 10) || 0;
  const itemsPerPage = parseInt(textOfFirst($, 'opensearch\\:itemsPerPage'), 10) || 0;

  const papers: ArxivPaper[] = [];
  const errors: AtomParseResult['errors'] = [];

  $('entry').each((index, el) => {
    try {
      const paper = parseEntry($, $(el));
      if (paper) papers.push(paper);
      else errors.push({ index, reason: 'entry-missing-id' });
    } catch (err) {
      errors.push({ index, reason: (err as Error).message });
    }
  });

  return { totalResults, startIndex, itemsPerPage, papers, errors };
}

function parseEntry($: CheerioAPI, $entry: Cheerio<Element>): ArxivPaper | null {
  const rawAtomId = $entry.children('id').first().text().trim();
  const canonicalId = canonicalizeArxivAtomId(rawAtomId);
  if (!canonicalId) return null;

  const title = collapseWhitespace($entry.children('title').first().text());
  const abstract = collapseWhitespace($entry.children('summary').first().text());
  const publishedAt = normalizeIso($entry.children('published').first().text());
  const updatedAt = normalizeIso($entry.children('updated').first().text());

  const authors: string[] = [];
  const affiliations: string[] = [];
  $entry.children('author').each((_, a) => {
    const $a = $(a);
    const name = collapseWhitespace($a.children('name').first().text());
    if (name) authors.push(name);
    $a.children().each((_, child) => {
      const tag = (child as Element).tagName?.toLowerCase();
      if (tag === 'arxiv:affiliation') {
        const aff = collapseWhitespace($(child).text());
        if (aff) affiliations.push(aff);
      }
    });
  });

  const categories: string[] = [];
  $entry.children('category').each((_, c) => {
    const term = $(c).attr('term');
    if (term) categories.push(term);
  });

  let primaryCategory = '';
  let doi: string | null = null;
  let journalRef: string | null = null;
  let comment: string | null = null;
  let licenseUrl: string | null = null;

  $entry.children().each((_, child) => {
    const tag = (child as Element).tagName?.toLowerCase();
    if (!tag) return;
    if (tag === 'arxiv:primary_category') {
      primaryCategory = $(child).attr('term') ?? primaryCategory;
    } else if (tag === 'arxiv:doi') {
      doi = collapseWhitespace($(child).text()) || null;
    } else if (tag === 'arxiv:journal_ref') {
      journalRef = collapseWhitespace($(child).text()) || null;
    } else if (tag === 'arxiv:comment') {
      comment = collapseWhitespace($(child).text()) || null;
    } else if (tag === 'rights') {
      licenseUrl = collapseWhitespace($(child).text()) || null;
    }
  });

  if (!primaryCategory && categories.length > 0) {
    primaryCategory = categories[0]!;
  }

  return {
    id: canonicalId, title, abstract, authors,
    firstAuthor: authors[0] ?? null,
    affiliations, primaryCategory, categories,
    publishedAt, updatedAt,
    absUrl: arxivAbsUrl(canonicalId),
    pdfUrl: arxivPdfUrl(canonicalId),
    doi, journalRef, comment, licenseUrl,
    rawXml: $.xml($entry),
  };
}

function collapseWhitespace(s: string | undefined | null): string {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeIso(raw: string): string {
  if (!raw) return '';
  const ms = Date.parse(raw.trim());
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return raw.trim();
}

function textOfFirst($: CheerioAPI, selector: string): string {
  return $(selector).first().text().trim();
}
