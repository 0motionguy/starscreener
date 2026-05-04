import type { Logger } from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';

export type TrendingItemType =
  | 'skill'
  | 'mcp'
  | 'hf_model'
  | 'hf_dataset'
  | 'hf_space'
  | 'repo'
  | 'idea'
  | 'post'
  | 'paper';

export const TRENDING_ITEM_TYPES: readonly TrendingItemType[] = [
  'skill',
  'mcp',
  'hf_model',
  'hf_dataset',
  'hf_space',
  'repo',
  'idea',
  'post',
  'paper',
] as const;

export interface TrendingItemRow {
  id: string;
  type: TrendingItemType;
  source: string;
  source_id: string;
  slug: string;
  title: string;
  description: string | null;
  url: string;
  author: string | null;
  vendor: string | null;
  agents: string[];
  tags: string[];
  language: string | null;
  license: string | null;
  thumbnail_url: string | null;
  trending_score: number;
  absolute_popularity: number;
  cross_source_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_modified_at: string | null;
  created_at: string;
  updated_at: string;
  raw: Record<string, unknown>;
}

export interface TrendingMetricRow {
  id: number;
  item_id: string;
  captured_at: string;
  downloads_total: number | null;
  downloads_7d: number | null;
  stars_total: number | null;
  installs_total: number | null;
  upvotes: number | null;
  comments: number | null;
  velocity_delta_7d: number | null;
  source_rank: number | null;
  raw: Record<string, unknown>;
}

export interface NormalizedItem {
  type: TrendingItemType;
  source: string;
  source_id: string;
  slug: string;
  title: string;
  description?: string;
  url: string;
  author?: string;
  vendor?: string;
  agents?: string[];
  tags?: string[];
  language?: string;
  license?: string;
  thumbnail_url?: string;
  absolute_popularity?: number;
  cross_source_count?: number;
  last_modified_at?: string;
  raw?: Record<string, unknown>;
  metric?: NormalizedMetric;
}

export interface NormalizedMetric {
  /** YYYY-MM-DD; defaults to capturedAt date if omitted (see db.upsertMetric). */
  captured_date?: string;
  downloads_total?: number;
  downloads_7d?: number;
  stars_total?: number;
  installs_total?: number;
  upvotes?: number;
  comments?: number;
  velocity_delta_7d?: number;
  source_rank?: number;
  raw?: Record<string, unknown>;
}

export interface RedisStreamEntry {
  id: string;
  fields: Record<string, string>;
}

export interface RedisHandle {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<void>;
  del(key: string): Promise<void>;
  quit(): Promise<void>;
  // Stream operations — used by the LLM usage telemetry layer.
  // `xadd` returns the assigned entry id ('<ms>-<seq>'). When
  // `maxlenApprox` is set we trim to ~that many entries (`MAXLEN ~ N`).
  xadd(
    key: string,
    fields: Record<string, string>,
    opts?: { maxlenApprox?: number },
  ): Promise<string>;
  xrange(
    key: string,
    start: string,
    end: string,
    count?: number,
  ): Promise<RedisStreamEntry[]>;
  xtrim(key: string, opts: { minIdApprox: string }): Promise<number>;
  xlen(key: string): Promise<number>;
}

export interface HttpOptions {
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string | Record<string, unknown>;
  timeoutMs?: number;
  maxRetries?: number;
  useEtagCache?: boolean;
}

export interface HttpClient {
  json<T>(url: string, opts?: HttpOptions): Promise<{ data: T; cached: boolean; etag?: string | undefined }>;
  text(url: string, opts?: HttpOptions): Promise<{ data: string; cached: boolean }>;
}

export interface FetcherContext {
  db: SupabaseClient;
  redis: RedisHandle;
  http: HttpClient;
  log: Logger;
  dryRun: boolean;
  since: Date;
  signalRunComplete: (counts: RunResult) => Promise<void>;
}

export interface Fetcher {
  name: string;
  schedule: string;
  /** Default false. Set true to receive a live SupabaseClient on ctx.db. */
  requiresDb?: boolean;
  requiresFirecrawl?: boolean;
  /**
   * Override the global 24h `since` window. Useful for fetchers whose
   * upstream API benefits from a different lookback (e.g. weekly digests,
   * slow-moving registries). A caller-supplied `--since` always wins.
   */
  defaultLookbackHours?: number;
  run(ctx: FetcherContext): Promise<RunResult>;
}

export interface RunResult {
  fetcher: string;
  startedAt: string;
  finishedAt: string;
  itemsSeen: number;
  itemsUpserted: number;
  metricsWritten: number;
  redisPublished: boolean;
  errors: Array<{ stage: string; message: string; itemSourceId?: string }>;
}
