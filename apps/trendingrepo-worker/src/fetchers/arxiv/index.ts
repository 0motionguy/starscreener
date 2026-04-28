// arXiv fetcher. Pulls last 7 days of cs.AI/CL/LG/MA, normalizes to
// trending_items rows with type='paper', publishes leaderboard payload to
// ss:data:v1:trending-paper.

import { upsertItem, writeMetric } from '../../lib/db.js';
import { publishLeaderboard } from '../../lib/publish.js';
import type {
  Fetcher, FetcherContext, NormalizedItem, NormalizedMetric, RunResult,
} from '../../lib/types.js';
import { arxivAbsUrl, arxivPdfUrl, arxivSlug } from '../../lib/util/arxiv-ids.js';
import { fetchCategory } from './client.js';
import { detectLab } from './lab-detect.js';
import { extractTags } from './tag-extract.js';
import { ARXIV_CATEGORIES, type ArxivPaper } from './types.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 200;
const MAX_PAGES_PER_CATEGORY = 5;

const fetcher: Fetcher = {
  name: 'arxiv',
  schedule: '45 */6 * * *',
  requiresDb: true,
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('arxiv fetcher dry-run');
      return done('arxiv', startedAt, 0, 0, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const sinceIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    let itemsSeen = 0;
    let itemsUpserted = 0;
    let metricsWritten = 0;
    let totalTruncated = 0;

    const seen = new Set<string>();

    for (const category of ARXIV_CATEGORIES) {
      try {
        const result = await fetchCategory(
          { http: ctx.http, log: ctx.log },
          { category, sinceIso, pageSize: PAGE_SIZE, maxPages: MAX_PAGES_PER_CATEGORY },
        );
        if (result.truncated) totalTruncated += 1;
        ctx.log.info(
          { category, pages: result.pagesFetched, papers: result.papers.length, totalResults: result.totalResults, truncated: result.truncated },
          'arxiv category fetched',
        );

        for (const paper of result.papers) {
          if (seen.has(paper.id)) continue;
          seen.add(paper.id);
          itemsSeen += 1;
          try {
            const normalized = normalizePaper(paper);
            const { id } = await upsertItem(ctx.db, { item: normalized.item });
            await writeMetric(ctx.db, id, normalized.metric);
            itemsUpserted += 1;
            metricsWritten += 1;
          } catch (err) {
            errors.push({
              stage: `normalize-upsert-${category}`,
              message: (err as Error).message,
              itemSourceId: paper.id,
            });
          }
        }
      } catch (err) {
        errors.push({ stage: `fetch-${category}`, message: (err as Error).message });
      }
    }

    if (totalTruncated > 0) {
      ctx.log.warn(
        { categories: totalTruncated, cap: MAX_PAGES_PER_CATEGORY * PAGE_SIZE },
        'arxiv hit page cap on at least one category — extending the 7d window may have missed papers',
      );
    }

    let redisPublished = false;
    try {
      const result = await publishLeaderboard(ctx.db, 'paper');
      redisPublished = result.redisPublished;
      ctx.log.info({ items: result.items, redisPublished }, 'arxiv leaderboard published');
    } catch (err) {
      errors.push({ stage: 'publish-paper', message: (err as Error).message });
    }

    await ctx.signalRunComplete({
      fetcher: 'arxiv', startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen, itemsUpserted, metricsWritten, redisPublished, errors,
    });

    return done('arxiv', startedAt, itemsSeen, itemsUpserted, metricsWritten, redisPublished, errors);
  },
};

export default fetcher;

interface NormalizedArxiv { item: NormalizedItem; metric: NormalizedMetric; }

function normalizePaper(paper: ArxivPaper): NormalizedArxiv {
  const labMatch = detectLab(paper);
  const tags = extractTags(paper);

  const mergeKeys = [`arxiv:${paper.id}`];
  if (paper.doi) mergeKeys.push(`doi:${paper.doi.toLowerCase()}`);

  const item: NormalizedItem = {
    type: 'paper',
    source: 'arxiv',
    source_id: paper.id,
    slug: arxivSlug(paper.id),
    title: paper.title.slice(0, 500),
    description: paper.abstract.slice(0, 500),
    url: paper.absUrl ?? arxivAbsUrl(paper.id),
    author: paper.firstAuthor ?? undefined,
    vendor: labMatch?.labId ?? undefined,
    tags,
    license: paper.licenseUrl ?? undefined,
    last_modified_at: paper.updatedAt || paper.publishedAt,
    raw: {
      pdf_url: paper.pdfUrl ?? arxivPdfUrl(paper.id),
      authors: paper.authors,
      affiliations: paper.affiliations,
      categories: paper.categories,
      primary_category: paper.primaryCategory,
      abstract: paper.abstract,
      published_at: paper.publishedAt,
      doi: paper.doi,
      journal_ref: paper.journalRef,
      comment: paper.comment,
      lab_id: labMatch?.labId ?? null,
      lab_confidence: labMatch?.hits ?? 0,
      merge_keys: mergeKeys,
      cross_source_ids: [] as string[],
    },
  };

  const metric: NormalizedMetric = {
    raw: {
      lab_id: labMatch?.labId ?? null,
      primary_category: paper.primaryCategory,
    },
  };

  return { item, metric };
}

function done(
  name: string, startedAt: string,
  itemsSeen: number, itemsUpserted: number, metricsWritten: number,
  redisPublished: boolean, errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: name, startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen, itemsUpserted, metricsWritten, redisPublished, errors,
  };
}
