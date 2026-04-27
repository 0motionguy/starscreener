// HackerNews helpers (Firebase + Algolia) for the hackernews fetcher.
// Mirrors scripts/_hn-shared.mjs. ctx.http handles retries/timeouts.

import type { HttpClient } from '../types.js';

export const USER_AGENT =
  'StarScreener-worker/0.1 (+https://github.com/0motionguy/starscreener; hackernews)';

export const FIREBASE_PAUSE_MS = 200;
export const FIREBASE_BATCH_SIZE = 5;
export const ALGOLIA_PAUSE_MS = 1000;

const FIREBASE_BASE = 'https://hacker-news.firebaseio.com/v0';
const ALGOLIA_BASE = 'https://hn.algolia.com/api/v1';

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const baseHeaders: Record<string, string> = {
  'user-agent': USER_AGENT,
  accept: 'application/json',
};

export interface HnFirebaseItem {
  id: number;
  type?: string;
  by?: string;
  title?: string;
  url?: string;
  score?: number;
  text?: string;
  descendants?: number;
  time?: number;
  dead?: boolean;
  deleted?: boolean;
}

export interface HnAlgoliaHit {
  objectID?: string;
  title?: string;
  url?: string;
  story_text?: string;
  points?: number;
  num_comments?: number;
  created_at_i?: number;
  author?: string;
}

export async function fetchTopStoryIds(http: HttpClient): Promise<number[]> {
  const { data } = await http.json<number[]>(`${FIREBASE_BASE}/topstories.json`, {
    headers: baseHeaders,
    useEtagCache: false,
    timeoutMs: 15_000,
  });
  if (!Array.isArray(data)) throw new Error('topstories.json: expected array');
  return data.filter((n): n is number => Number.isInteger(n) && n > 0);
}

export async function fetchItem(http: HttpClient, id: number): Promise<HnFirebaseItem | null> {
  const { data } = await http.json<HnFirebaseItem | null>(`${FIREBASE_BASE}/item/${id}.json`, {
    headers: baseHeaders,
    useEtagCache: false,
    timeoutMs: 15_000,
  });
  return data ?? null;
}

export interface FetchItemsBatchedResult {
  items: HnFirebaseItem[];
  errors: number;
}

export async function fetchItemsBatched(
  http: HttpClient,
  ids: number[],
  opts: { onProgress?: (info: { done: number; total: number; errors: number }) => void } = {},
): Promise<FetchItemsBatchedResult> {
  const { onProgress } = opts;
  const results: HnFirebaseItem[] = [];
  let errors = 0;
  for (let i = 0; i < ids.length; i += FIREBASE_BATCH_SIZE) {
    const batch = ids.slice(i, i + FIREBASE_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((id) => fetchItem(http, id)));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value);
      } else if (r.status === 'rejected') {
        errors += 1;
      }
    }
    if (onProgress) {
      onProgress({
        done: Math.min(i + FIREBASE_BATCH_SIZE, ids.length),
        total: ids.length,
        errors,
      });
    }
    if (i + FIREBASE_BATCH_SIZE < ids.length) await sleep(FIREBASE_PAUSE_MS);
  }
  return { items: results, errors };
}

export interface SearchAlgoliaParams {
  http: HttpClient;
  query: string;
  since?: number | undefined;
}

export async function searchAlgoliaStories(params: SearchAlgoliaParams): Promise<HnAlgoliaHit[]> {
  const { http, query, since } = params;
  const hitsPerPage = 100;
  const numericFilters = since ? `&numericFilters=created_at_i>${since}` : '';
  const all: HnAlgoliaHit[] = [];
  let page = 0;
  let nbPages = 1;
  while (page < nbPages) {
    const url =
      `${ALGOLIA_BASE}/search?query=${encodeURIComponent(query)}` +
      `&tags=story&hitsPerPage=${hitsPerPage}&page=${page}${numericFilters}`;
    const { data } = await http.json<{ hits?: HnAlgoliaHit[]; nbPages?: number }>(url, {
      headers: baseHeaders,
      useEtagCache: false,
      timeoutMs: 15_000,
    });
    if (!data || !Array.isArray(data.hits)) {
      throw new Error(`Algolia search: malformed response on page ${page}`);
    }
    for (const hit of data.hits) all.push(hit);
    nbPages = Number.isFinite(data.nbPages) ? Number(data.nbPages) : page + 1;
    page += 1;
    if (page < nbPages) await sleep(ALGOLIA_PAUSE_MS);
    if (page >= 20) break;
  }
  return all;
}
