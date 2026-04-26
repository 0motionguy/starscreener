// Compute rolling 30-day baseline stats per subreddit, used by the reddit
// scraper to compute baseline_ratio = post.upvotes / baseline.median_upvotes.
//
// Slug: `reddit-baselines`. Cadence: weekly (matches refresh-reddit-baselines.yml).
//
// Note: this fetcher uses Reddit's anonymous public-JSON path with a real-
// browser UA. When/if Reddit OAuth credentials become available in the worker
// env (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET), the Group 2 reddit fetcher
// will land an OAuth helper we can adopt. Until then, anonymous is the
// floor, and per-sub failures degrade gracefully — partial baselines are
// useful, complete absence is not.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import {
  fetchJsonWithRetry,
  HttpStatusError,
  sleep,
} from '../../lib/util/http-helpers.js';

// Mirrors scripts/_reddit-shared.mjs SUBREDDITS list (2026-04-26).
const SUBREDDITS: readonly string[] = [
  'ClaudeAI',
  'ChatGPT',
  'OpenAI',
  'LocalLLaMA',
  'GeminiAI',
  'DeepSeek',
  'Perplexity_AI',
  'MistralAI',
  'grok',
  'AI_Agents',
  'AgentsOfAI',
  'LLMDevs',
  'ClaudeCode',
  'aiagents',
  'ArtificialInteligence',
  'MachineLearning',
  'artificial',
  'singularity',
  'datascience',
  'vibecoding',
  'cursor',
  'ChatGPTCoding',
  'ChatGPTPromptGenius',
  'PromptEngineering',
  'AIToolTesting',
  'AIBuilders',
  'AIAssisted',
  'learnmachinelearning',
  'deeplearning',
  'LocalLLM',
  'GoogleGeminiAI',
  'n8n',
  'automation',
  'LangChain',
  'generativeAI',
  'Rag',
  'SEO',
  'WritingWithAI',
  'SaaS',
  'machinelearningnews',
  'ollama',
  'LLM',
  'CLine',
  'windsurf',
  'nocode',
];

const REDDIT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const WINDOW_DAYS = 30;
const WINDOW_SECONDS = WINDOW_DAYS * 24 * 60 * 60;
const BASELINE_REQUEST_PAUSE_MS = 5_000;
const RATE_LIMIT_BACKOFF_MS = 65_000;
const MAX_PAGES_PER_SUB = 5;
const PAGE_LIMIT = 100;
const BASELINE_STALE_MS = 6 * 24 * 60 * 60 * 1000;
const CONFIDENCE_HIGH_MIN = 200;
const CONFIDENCE_MEDIUM_MIN = 50;

interface SubBaseline {
  median_upvotes: number;
  mean_upvotes: number;
  p75_upvotes: number;
  p90_upvotes: number;
  median_comments: number;
  sample_size: number;
  actual_window_days: number;
  confidence: 'high' | 'medium' | 'low';
}

interface RedditPost {
  score?: number;
  num_comments?: number;
  created_utc?: number;
}

interface RedditListingResponse {
  data?: {
    after?: string | null;
    children?: Array<{ data?: RedditPost }>;
  };
}

interface BaselinesPayload {
  lastComputedAt: string;
  windowDays: number;
  subredditsRequested: number;
  subredditsSucceeded: number;
  errors: Record<string, string>;
  baselines: Record<string, SubBaseline>;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const idx = Math.min(n - 1, Math.floor((p / 100) * n));
  return sorted[idx]!;
}

function meanOf(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  let sum = 0;
  for (const x of numbers) sum += x;
  return sum / numbers.length;
}

function classifyConfidence(sampleSize: number): SubBaseline['confidence'] {
  if (sampleSize >= CONFIDENCE_HIGH_MIN) return 'high';
  if (sampleSize >= CONFIDENCE_MEDIUM_MIN) return 'medium';
  return 'low';
}

async function fetchRedditWithBackoff(url: string): Promise<RedditListingResponse> {
  try {
    return await fetchJsonWithRetry<RedditListingResponse>(url, {
      headers: { 'User-Agent': REDDIT_USER_AGENT, Accept: 'application/json' },
      attempts: 2,
      retryDelayMs: 2_000,
      timeoutMs: 25_000,
    });
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 429) {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      return fetchJsonWithRetry<RedditListingResponse>(url, {
        headers: { 'User-Agent': REDDIT_USER_AGENT, Accept: 'application/json' },
        attempts: 1,
        timeoutMs: 25_000,
      });
    }
    throw err;
  }
}

async function fetchSubPosts(sub: string, cutoffUtc: number): Promise<RedditPost[]> {
  const collected: RedditPost[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES_PER_SUB; page += 1) {
    const afterParam = after ? `&after=${encodeURIComponent(after)}` : '';
    const url = `https://www.reddit.com/r/${sub}/new.json?limit=${PAGE_LIMIT}${afterParam}`;
    const body = await fetchRedditWithBackoff(url);
    const children = body?.data?.children;
    if (!Array.isArray(children) || children.length === 0) break;
    let pageOldestUtc = Infinity;
    let pageCount = 0;
    for (const c of children) {
      const p = c?.data;
      if (!p || typeof p !== 'object') continue;
      if (typeof p.created_utc !== 'number') continue;
      pageOldestUtc = Math.min(pageOldestUtc, p.created_utc);
      if (p.created_utc < cutoffUtc) continue;
      collected.push(p);
      pageCount += 1;
    }
    after = body?.data?.after ?? null;
    if (!after) break;
    if (pageOldestUtc < cutoffUtc) break;
    if (page < MAX_PAGES_PER_SUB - 1) await sleep(BASELINE_REQUEST_PAUSE_MS);
    if (pageCount === 0) break;
  }
  return collected;
}

function computeSubBaseline(posts: RedditPost[]): SubBaseline {
  if (posts.length === 0) {
    return {
      median_upvotes: 0,
      mean_upvotes: 0,
      p75_upvotes: 0,
      p90_upvotes: 0,
      median_comments: 0,
      sample_size: 0,
      actual_window_days: 0,
      confidence: 'low',
    };
  }
  const upvotes = posts
    .map((p) => (Number.isFinite(p.score) ? (p.score as number) : 0))
    .sort((a, b) => a - b);
  const comments = posts
    .map((p) => (Number.isFinite(p.num_comments) ? (p.num_comments as number) : 0))
    .sort((a, b) => a - b);
  const now = Math.floor(Date.now() / 1000);
  const oldest = Math.min(
    ...posts.map((p) =>
      typeof p.created_utc === 'number' ? p.created_utc : now,
    ),
  );
  const actualWindowDays = Math.min(
    WINDOW_DAYS,
    Math.max(0, Math.floor((now - oldest) / (24 * 60 * 60))),
  );
  return {
    median_upvotes: Math.round(median(upvotes) * 10) / 10,
    mean_upvotes: Math.round(meanOf(upvotes) * 10) / 10,
    p75_upvotes: Math.round(percentile(upvotes, 75) * 10) / 10,
    p90_upvotes: Math.round(percentile(upvotes, 90) * 10) / 10,
    median_comments: Math.round(median(comments) * 10) / 10,
    sample_size: posts.length,
    actual_window_days: actualWindowDays,
    confidence: classifyConfidence(posts.length),
  };
}

function shouldRefetch(sub: string, existing: BaselinesPayload | null): boolean {
  if (!existing) return true;
  if (!existing.baselines[sub]) return true;
  if (existing.errors[sub]) return true;
  if (!existing.lastComputedAt) return true;
  const ageMs = Date.now() - new Date(existing.lastComputedAt).getTime();
  return ageMs > BASELINE_STALE_MS;
}

const fetcher: Fetcher = {
  name: 'reddit-baselines',
  schedule: '17 3 * * 1', // matches refresh-reddit-baselines.yml (weekly Mon 03:17 UTC)
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('reddit-baselines dry-run');
      return done(startedAt, 0, false, []);
    }

    const cutoffUtc = Math.floor(Date.now() / 1000) - WINDOW_SECONDS;
    const existing = await readDataStore<BaselinesPayload>('reddit-baselines');
    const baselines: Record<string, SubBaseline> = { ...(existing?.baselines ?? {}) };
    const errors: Record<string, string> = {};
    const runErrors: RunResult['errors'] = [];
    let fetched = 0;
    let skipped = 0;

    for (const sub of SUBREDDITS) {
      if (!shouldRefetch(sub, existing)) {
        skipped += 1;
        continue;
      }
      try {
        const posts = await fetchSubPosts(sub, cutoffUtc);
        baselines[sub] = computeSubBaseline(posts);
        fetched += 1;
        ctx.log.info(
          {
            sub,
            sample: baselines[sub].sample_size,
            confidence: baselines[sub].confidence,
          },
          'sub baseline ok',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors[sub] = message;
        runErrors.push({ stage: `sub-${sub}`, message });
        ctx.log.warn({ sub, message }, 'sub baseline failed');
      }
      await sleep(BASELINE_REQUEST_PAUSE_MS);
    }

    const succeeded = Object.keys(baselines).length;
    const writeNeeded = fetched > 0 || Object.keys(errors).length > 0;
    const payload: BaselinesPayload = {
      lastComputedAt: writeNeeded
        ? new Date().toISOString()
        : (existing?.lastComputedAt ?? new Date().toISOString()),
      windowDays: WINDOW_DAYS,
      subredditsRequested: SUBREDDITS.length,
      subredditsSucceeded: succeeded,
      errors,
      baselines,
    };

    if (succeeded === 0) {
      const msg = 'every subreddit baseline fetch failed';
      runErrors.push({ stage: 'global', message: msg });
      ctx.log.error(msg);
    }

    const result = await writeDataStore('reddit-baselines', payload);
    ctx.log.info(
      {
        fetched,
        skipped,
        errors: Object.keys(errors).length,
        baselines: succeeded,
        redisSource: result.source,
      },
      'reddit-baselines published',
    );
    return done(startedAt, succeeded, result.source === 'redis', runErrors);
  },
};

export default fetcher;

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'reddit-baselines',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
