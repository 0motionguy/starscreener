// Dev.to API helpers for the devto fetcher.
//
// Mirrors scripts/_devto-shared.mjs. Uses ctx.http for transport (retries +
// 429/5xx) and a token pool from DEVTO_API_KEYS (comma-separated) +
// DEVTO_API_KEY (singular fallback).

import type { HttpClient } from '../types.js';

export const USER_AGENT =
  'StarScreener-worker/0.1 (+https://github.com/0motionguy/starscreener; devto)';

export const DEVTO_BASE = 'https://dev.to/api';
export const DEVTO_PAUSE_MS = 200; // 5 req/sec
export const DEVTO_BATCH_SIZE = 5;

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function loadDevtoKeys(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (k: string | undefined): void => {
    const v = (k ?? '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  const pool = process.env.DEVTO_API_KEYS;
  if (typeof pool === 'string' && pool.length > 0) {
    for (const raw of pool.split(',')) push(raw);
  }
  push(process.env.DEVTO_API_KEY);
  return out;
}

const DEVTO_KEYS = loadDevtoKeys();
let devtoCursor = 0;

function nextDevtoKey(): string | undefined {
  if (DEVTO_KEYS.length === 0) return undefined;
  const key = DEVTO_KEYS[devtoCursor % DEVTO_KEYS.length];
  devtoCursor += 1;
  return key;
}

function buildHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'user-agent': USER_AGENT,
    accept: 'application/json',
  };
  const key = nextDevtoKey();
  if (key) h['api-key'] = key;
  return h;
}

export interface DevtoArticle {
  id: number;
  title?: string;
  description?: string;
  url?: string;
  tag_list?: string[];
  public_reactions_count?: number;
  comments_count?: number;
  reading_time_minutes?: number;
  published_at?: string;
  created_at?: string;
  user?: {
    username?: string;
    name?: string;
    profile_image_90?: string;
    profile_image?: string;
  };
}

export interface DevtoArticleDetail extends DevtoArticle {
  body_markdown?: string;
}

export interface FetchArticleListParams {
  http: HttpClient;
  tag?: string | undefined;
  top?: number | undefined;
  state?: 'rising' | 'fresh' | undefined;
  perPage?: number;
}

export async function fetchArticleList(params: FetchArticleListParams): Promise<DevtoArticle[]> {
  const { http, tag, top, state, perPage = 100 } = params;
  const usp = new URLSearchParams();
  if (tag) usp.set('tag', tag);
  if (top !== undefined && top !== null) usp.set('top', String(top));
  if (state) usp.set('state', state);
  usp.set('per_page', String(perPage));
  const url = `${DEVTO_BASE}/articles?${usp.toString()}`;
  const { data } = await http.json<DevtoArticle[]>(url, {
    headers: buildHeaders(),
    useEtagCache: false,
    timeoutMs: 15_000,
  });
  if (!Array.isArray(data)) {
    throw new Error(
      `articles list: expected array (tag=${tag ?? 'none'}, state=${state ?? 'none'}, top=${top ?? 'none'})`,
    );
  }
  return data;
}

export async function fetchArticleDetail(http: HttpClient, id: number): Promise<DevtoArticleDetail | null> {
  try {
    const { data } = await http.json<DevtoArticleDetail>(`${DEVTO_BASE}/articles/${id}`, {
      headers: buildHeaders(),
      useEtagCache: false,
      timeoutMs: 15_000,
    });
    return data;
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('404')) return null;
    throw err;
  }
}

export interface FetchDetailsBatchedResult {
  details: DevtoArticleDetail[];
  errors: number;
  aborted: boolean;
}

export interface FetchDetailsBatchedParams {
  http: HttpClient;
  ids: number[];
  onProgress?: (info: { done: number; total: number; errors: number }) => void;
}

export async function fetchDetailsBatched(
  params: FetchDetailsBatchedParams,
): Promise<FetchDetailsBatchedResult> {
  const { http, ids, onProgress } = params;
  const results: DevtoArticleDetail[] = [];
  let errors = 0;
  let consecutiveBadBatches = 0;
  let aborted = false;

  for (let i = 0; i < ids.length; i += DEVTO_BATCH_SIZE) {
    if (aborted) break;
    const batch = ids.slice(i, i + DEVTO_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchArticleDetail(http, id)),
    );

    let batchHadFatal = false;
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value);
      } else if (r.status === 'rejected') {
        errors += 1;
        const msg = (r.reason as Error)?.message ?? '';
        if (/\b(429|5\d\d)\b/.test(msg)) batchHadFatal = true;
      }
    }

    if (batchHadFatal) {
      consecutiveBadBatches += 1;
      if (consecutiveBadBatches >= 2) aborted = true;
    } else {
      consecutiveBadBatches = 0;
    }

    if (onProgress) {
      onProgress({
        done: Math.min(i + DEVTO_BATCH_SIZE, ids.length),
        total: ids.length,
        errors,
      });
    }
    if (i + DEVTO_BATCH_SIZE < ids.length && !aborted) {
      await sleep(DEVTO_PAUSE_MS);
    }
  }

  return { details: results, errors, aborted };
}

export function devtoKeyPoolSize(): number {
  return DEVTO_KEYS.length;
}
