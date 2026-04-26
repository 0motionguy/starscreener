// Bluesky AT Protocol helpers used by the bluesky fetcher.
//
// Mirrors scripts/_bluesky-shared.mjs but typed and uses ctx.http for the
// underlying transport so retries + timeouts are consistent with the rest
// of the worker. Auth still goes through bsky.social createSession because
// it is a single POST with a tiny payload (the worker's http.json supports
// POST too).

import type { HttpClient } from '../types.js';

export const USER_AGENT =
  'StarScreener-worker/0.1 (+https://github.com/0motionguy/starscreener; bluesky)';

const AT_PDS = 'https://bsky.social';
const SEARCH_THROTTLE_MS = 250;

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export class BlueskyRateLimitError extends Error {
  rateLimit: BlueskyRateLimit | undefined;
  constructor(message: string, rateLimit?: BlueskyRateLimit) {
    super(message);
    this.name = 'BlueskyRateLimitError';
    this.rateLimit = rateLimit;
  }
}

export interface BlueskyRateLimit {
  limit: string | null;
  remaining: string | null;
  reset: string | null;
  policy: string | null;
}

export interface BlueskySession {
  accessJwt: string;
  refreshJwt?: string;
  did?: string;
  handle?: string;
}

export async function createSession(
  http: HttpClient,
  identifier: string,
  password: string,
): Promise<BlueskySession> {
  const { data } = await http.json<BlueskySession>(
    `${AT_PDS}/xrpc/com.atproto.server.createSession`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': USER_AGENT,
        accept: 'application/json',
      },
      body: { identifier, password },
      useEtagCache: false,
      timeoutMs: 15_000,
    },
  );
  if (!data?.accessJwt) {
    throw new Error('createSession: response missing accessJwt');
  }
  return data;
}

export interface BlueskyAuthor {
  did?: string;
  handle?: string;
  displayName?: string;
}

export interface BlueskyEmbed {
  external?: { uri?: string };
  media?: { external?: { uri?: string } };
}

export interface BlueskyFacetFeature {
  $type?: string;
  uri?: string;
}

export interface BlueskyFacet {
  features?: BlueskyFacetFeature[];
}

export interface BlueskyRecord {
  text?: string;
  createdAt?: string;
  facets?: BlueskyFacet[];
}

export interface BlueskyPost {
  uri: string;
  cid: string;
  author?: BlueskyAuthor;
  record?: BlueskyRecord;
  embed?: BlueskyEmbed;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  indexedAt?: string;
}

export interface SearchPostsPageResult {
  posts: BlueskyPost[];
  cursor: string | null;
  rateLimit: BlueskyRateLimit;
}

export interface SearchPostsAllResult {
  posts: BlueskyPost[];
  pagesFetched: number;
  lastRateLimit: BlueskyRateLimit | undefined;
}

export interface SearchPostsParams {
  http: HttpClient;
  accessJwt: string;
  q: string;
  sort?: 'latest' | 'top';
  limit?: number;
  cursor?: string | undefined;
}

export async function searchPostsPage(params: SearchPostsParams): Promise<SearchPostsPageResult> {
  const { http, accessJwt, q, sort = 'latest', limit = 100, cursor } = params;
  const usp = new URLSearchParams({ q, sort, limit: String(limit) });
  if (cursor) usp.set('cursor', cursor);
  const url = `${AT_PDS}/xrpc/app.bsky.feed.searchPosts?${usp.toString()}`;

  // We can't easily read the rate-limit headers through ctx.http.json — and
  // the underlying client throws on 429 already (with retry). For the worker
  // we don't need explicit rate-limit telemetry; we treat 429 as the same
  // class of error the upstream helper does.
  let body: { posts?: BlueskyPost[]; cursor?: string };
  try {
    const res = await http.json<{ posts?: BlueskyPost[]; cursor?: string }>(url, {
      headers: {
        authorization: `Bearer ${accessJwt}`,
        'user-agent': USER_AGENT,
        accept: 'application/json',
      },
      useEtagCache: false,
      timeoutMs: 15_000,
    });
    body = res.data;
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes('429')) {
      throw new BlueskyRateLimitError(msg);
    }
    throw err;
  }

  return {
    posts: Array.isArray(body?.posts) ? body.posts : [],
    cursor: body?.cursor ?? null,
    rateLimit: { limit: null, remaining: null, reset: null, policy: null },
  };
}

export interface SearchPostsAllParams {
  http: HttpClient;
  accessJwt: string;
  q: string;
  sort?: 'latest' | 'top';
  limit?: number;
  maxPages?: number;
}

export async function searchPostsAllPages(
  params: SearchPostsAllParams,
): Promise<SearchPostsAllResult> {
  const { http, accessJwt, q, sort = 'latest', limit = 100, maxPages = 1 } = params;
  const all: BlueskyPost[] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  let lastRateLimit: BlueskyRateLimit | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await searchPostsPage({ http, accessJwt, q, sort, limit, cursor });
    pagesFetched += 1;
    lastRateLimit = res.rateLimit;
    for (const p of res.posts) all.push(p);
    if (!res.cursor || res.posts.length < limit) break;
    cursor = res.cursor;
    if (page + 1 < maxPages) await sleep(SEARCH_THROTTLE_MS);
  }
  return { posts: all, pagesFetched, lastRateLimit };
}

export function deriveBskyUrl(uri: string, handleOrDid: string | undefined): string {
  const parts = String(uri ?? '').split('/');
  const rkey = parts[parts.length - 1] ?? '';
  const profile = String(handleOrDid ?? '').trim() || 'unknown';
  return `https://bsky.app/profile/${encodeURIComponent(profile)}/post/${encodeURIComponent(rkey)}`;
}

export function extractUrlsFromEmbed(embed: BlueskyEmbed | undefined): string[] {
  const urls: string[] = [];
  if (!embed || typeof embed !== 'object') return urls;
  if (embed.external && typeof embed.external.uri === 'string') {
    urls.push(embed.external.uri);
  }
  if (embed.media?.external && typeof embed.media.external.uri === 'string') {
    urls.push(embed.media.external.uri);
  }
  return urls;
}

export function extractUrlsFromFacets(facets: BlueskyFacet[] | undefined): string[] {
  const urls: string[] = [];
  if (!Array.isArray(facets)) return urls;
  for (const f of facets) {
    const feats = Array.isArray(f?.features) ? f.features : [];
    for (const feat of feats) {
      if (feat?.$type === 'app.bsky.richtext.facet#link' && typeof feat.uri === 'string') {
        urls.push(feat.uri);
      }
    }
  }
  return urls;
}

export function collectPostUrls(post: BlueskyPost): string[] {
  const urls: string[] = [];
  for (const u of extractUrlsFromEmbed(post?.embed)) urls.push(u);
  for (const u of extractUrlsFromFacets(post?.record?.facets)) urls.push(u);
  return urls;
}
