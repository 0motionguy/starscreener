// Phase 1 RSS path. Pure-fetch + parse glue around lib/feeds/rss-parser.

import type { Logger } from 'pino';
import type { HttpClient } from '../../lib/types.js';
import { parseFeed } from '../../lib/feeds/rss-parser.js';
import { extractCrossLinks } from './cross-link.js';
import type { LabFetchResult, NormalizedPost, RssFetchInput } from './types.js';

interface RssPathDeps {
  http: HttpClient;
  log: Logger;
}

export async function fetchLabRss(deps: RssPathDeps, input: RssFetchInput): Promise<LabFetchResult> {
  const { http, log } = deps;
  const errors: LabFetchResult['errors'] = [];
  const sinceMs = Date.parse(input.sinceIso);
  if (!Number.isFinite(sinceMs)) {
    return {
      labId: input.labId, feedFormat: 'unknown', posts: [],
      errors: [{ stage: 'input', message: `invalid sinceIso "${input.sinceIso}"` }],
    };
  }

  let body: string;
  try {
    const res = await http.text(input.feedUrl, {
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      useEtagCache: true,
    });
    body = res.data;
  } catch (err) {
    return {
      labId: input.labId, feedFormat: 'unknown', posts: [],
      errors: [{ stage: 'fetch', message: (err as Error).message }],
    };
  }

  const parsed = parseFeed(body);
  if (parsed.errors.length > 0) {
    log.debug({ labId: input.labId, errors: parsed.errors.length }, 'rss soft errors');
    for (const e of parsed.errors) errors.push({ stage: 'parse', message: e.reason });
  }

  const posts: NormalizedPost[] = [];
  for (const post of parsed.posts) {
    const publishedMs = post.publishedAt ? Date.parse(post.publishedAt) : NaN;
    if (Number.isFinite(publishedMs) && publishedMs < sinceMs) continue;
    const cross = extractCrossLinks(`${post.title}\n${post.summary}`);
    posts.push({
      url: post.url,
      labId: input.labId,
      title: post.title,
      summary: post.summary,
      publishedAt: post.publishedAt,
      author: post.author,
      arxivIds: cross.arxivIds,
    });
  }

  return { labId: input.labId, feedFormat: parsed.format, posts, errors };
}
