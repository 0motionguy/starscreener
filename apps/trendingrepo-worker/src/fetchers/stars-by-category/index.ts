// stars-by-category — daily star deltas summed by category across the full
// registry, for the home-page hero "Daily GitHub stars · stacked by category"
// chart. Powers a single 90-day rolling time-series painted as 7 stacked bands:
// AI Agents, MCP, DevTools, Browser, Local LLM, AI/ML, Other.
//
// WHY THIS EXISTS
// The Aurora chart on home wants ONE pre-aggregated payload, not 800 per-repo
// reads at render time. Per-page aggregation across ~800 `star-activity:*`
// slugs would (a) blow the page budget, (b) re-run on every render. Doing it
// once per day in the worker is the right altitude: read all per-repo series,
// classify each repo locally, sum deltas per category per day, persist one
// slug. App reads ONE slug, paints the chart, done.
//
// INPUTS
//   - `repo-registry`               full registry (language, description, etc)
//   - `star-activity:<owner__name>` per-repo daily cumulative star series
//                                   (already backfilled to ≥90 days for the
//                                   trending tier; forward-appended daily by
//                                   `star-activity`)
//
// OUTPUT slug `stars-by-category-daily`
//   {
//     fetchedAt, windowDays, days: [
//       { d: "YYYY-MM-DD", byCategory: { "ai-agents": 312, ... } },
//       … 90 entries
//     ],
//     totalRepos, missingSeries, categories: [{id,label,color}, ...]
//   }
//
// CLASSIFIER
//   App-side classifier (src/lib/pipeline/classification/) can't be imported —
//   the worker `tsconfig` `rootDir: src` makes the package self-contained.
//   We inline a small keyword-rule classifier that targets the 7 hero buckets
//   only. Each repo gets exactly one bucket (or "other"). This is intentionally
//   simpler than the app classifier — for an aggregate chart, false-positives
//   in adjacent buckets (e.g. an "ai-agents" repo classed "ai-ml") move ONE
//   colour band's height by epsilon; the totals stay honest.
//
// SCHEDULE
//   Daily 06:00 UTC — after `star-activity` (04:17) appended today's points
//   and `star-activity-deltas` (05:30) ran. Spread off the bursty :00 by 0:00
//   minute? No — 06:00 lands right after deltas, before cross-source-sweep.
//   Use `0 6 * * *`.
//
// ZERO-WRITE GUARD
//   Same class as other aggregators: a recompute producing 0 days MUST NOT
//   overwrite a populated slug. Uses shouldPreserveCache + satisfies the
//   lint:guards keep-last-50 contract via the cache-merge import.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';
import {
  rankedRegistryFullNames,
  type RegistryPayloadLite,
} from '../../lib/util/registry-candidates.js';

// --- knobs ----------------------------------------------------------------

const WINDOW_DAYS = 90;
const MAX_REPOS = Math.max(
  100,
  Math.min(
    5_000,
    Number.parseInt(process.env.STARS_BY_CATEGORY_LIMIT ?? '2000', 10) || 2000,
  ),
);
const CONCURRENCY = 8;
const DAY_MS = 86_400_000;

// --- 7 hero categories (matches the home-page colour band order) -----------

export const HERO_CATEGORIES = [
  { id: 'ai-agents', label: 'AI Agents', color: '#A855F7' },
  { id: 'devtools', label: 'DevTools', color: '#FB923C' },
  { id: 'mcp', label: 'MCP', color: '#14B8A6' },
  { id: 'ai-ml', label: 'AI/ML', color: '#3ad6c5' },
  { id: 'browser-automation', label: 'Browser', color: '#0EA5E9' },
  { id: 'local-llm', label: 'Local LLM', color: '#6366F1' },
  { id: 'other', label: 'Other', color: '#4b5563' },
] as const;

export type HeroCategoryId = (typeof HERO_CATEGORIES)[number]['id'];

// --- payload shape (app-side mirror lives in src/lib/stars-by-category.ts) ---

export interface ByCategoryDay {
  /** YYYY-MM-DD UTC. */
  d: string;
  /** Sum of per-repo daily star deltas, grouped by category. Always 7 keys. */
  byCategory: Record<HeroCategoryId, number>;
}

export interface StarsByCategoryPayload {
  fetchedAt: string;
  windowDays: number;
  totalRepos: number;
  /** Repos where the star-activity series was missing or empty. */
  missingSeries: number;
  /** 90 entries, oldest → newest. */
  days: ByCategoryDay[];
  /** Mirrored so the chart can render without re-importing the constants. */
  categories: typeof HERO_CATEGORIES;
}

// --- classifier (self-contained, keyword-based, deterministic) -------------

interface RegistryRepoLite {
  fullName: string;
  language: string | null;
  description: string;
}

/**
 * Classify a repo to one of the 7 hero buckets via keyword rules. Order
 * matters: each rule is checked in priority order, FIRST match wins, fallback
 * "other".
 *
 * Pure. Exported for test.
 */
export function classifyForHero(repo: RegistryRepoLite): HeroCategoryId {
  const text = `${repo.fullName} ${repo.description ?? ''}`.toLowerCase();
  const owner = (repo.fullName.split('/')[0] ?? '').toLowerCase();
  const name = (repo.fullName.split('/')[1] ?? '').toLowerCase();

  // 1) MCP — most specific keyword, check first.
  if (
    text.includes('model context protocol') ||
    /\bmcp\b/.test(text) ||
    /\bmcp[-_]/.test(name)
  ) {
    return 'mcp';
  }

  // 2) Browser automation — distinct enough to win over generic "agent".
  if (
    /\b(playwright|puppeteer|browser-use|browseruse|stagehand|selenium)\b/.test(
      text,
    ) ||
    text.includes('browser automation') ||
    text.includes('web automation') ||
    /\bbrowser[-_]agent/.test(text)
  ) {
    return 'browser-automation';
  }

  // 3) Local LLM — on-device inference / quantization / local runtimes.
  if (
    /\b(llama\.cpp|ollama|gguf|llamafile|exo|vllm|mlx|ggml|koboldcpp|llamaindex|exllama|aphrodite)\b/.test(
      text,
    ) ||
    /\blocal[-_ ]?llm/.test(text) ||
    /\bon[-_ ]?device/.test(text) ||
    text.includes('local inference')
  ) {
    return 'local-llm';
  }

  // 4) AI Agents — agent frameworks, autonomous loops, copilots.
  if (
    /\b(autogen|crewai|langgraph|swarm|llamaindex|smolagents|haystack)\b/.test(
      text,
    ) ||
    /\bai[-_ ]agent/.test(text) ||
    /\bautonomous agent/.test(text) ||
    /\bcoding agent/.test(text) ||
    /\bmulti[-_ ]?agent/.test(text) ||
    /\bagent[-_ ]?framework/.test(text) ||
    /\bagent[-_ ]?skills?/.test(text) ||
    name.endsWith('-agent') ||
    name.endsWith('-agents') ||
    name === 'agents' ||
    text.includes('autonomous workflow') ||
    text.includes(' copilot')
  ) {
    return 'ai-agents';
  }

  // 5) AI/ML — models, training, inference servers, fine-tuning.
  if (
    /\b(transformers?|pytorch|tensorflow|jax|llm|fine[-_ ]?tun|rag|embedding|vector[-_ ]db|whisper|stable[-_ ]?diffusion|comfyui|diffusion|lora)\b/.test(
      text,
    ) ||
    /\b(machine learning|deep learning|neural network)\b/.test(text) ||
    owner === 'huggingface' ||
    owner === 'openai' ||
    owner === 'anthropics' ||
    owner === 'meta-llama' ||
    owner === 'deepseek-ai'
  ) {
    return 'ai-ml';
  }

  // 6) DevTools — broadest catch for tooling, must come AFTER agents/llm.
  if (
    /\b(linter|formatter|bundler|compiler|debugger|cli|terminal|editor|ide|devtool|build tool|sdk|framework)\b/.test(
      text,
    ) ||
    /\b(vscode|neovim|emacs|nvim)\b/.test(text) ||
    repo.language === 'Rust' ||
    repo.language === 'Go' ||
    repo.language === 'Zig'
  ) {
    return 'devtools';
  }

  return 'other';
}

// --- IO helpers ------------------------------------------------------------

function payloadSlug(fullName: string): string {
  return `star-activity:${fullName.toLowerCase().replace('/', '__')}`;
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build an array of the last `windowDays` YYYY-MM-DD strings ending TODAY
 * (UTC), oldest → newest. Pure.
 */
export function rollingWindow(windowDays: number, now: Date = new Date()): string[] {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const out: string[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    out.push(utcDayKey(d));
  }
  return out;
}

interface StarPoint {
  d: string;
  s: number;
  delta?: number;
}

interface StarActivityLite {
  points?: StarPoint[];
}

/**
 * Given a per-repo cumulative-stars series, return a map of day→delta covering
 * the rolling window. A day with no observation OR with cumulative-decrease
 * (yanked stars) is reported as 0 — not negative — so one repo can't drag a
 * category band below zero in the visual.
 *
 * Pure. Exported for test.
 */
export function deltasInWindow(
  series: StarActivityLite | null,
  windowDays: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of windowDays) out.set(d, 0);
  const points = Array.isArray(series?.points) ? series!.points! : [];
  if (points.length < 2) return out;
  // Walk every pair (prev → curr); credit (curr.s - prev.s) to curr.d when
  // curr.d falls in-window. Negative deltas clamped to 0.
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;
    if (!out.has(curr.d)) continue;
    const raw = curr.s - prev.s;
    if (raw > 0) out.set(curr.d, (out.get(curr.d) ?? 0) + raw);
  }
  return out;
}

// --- fetcher ---------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'stars-by-category',
  schedule: '0 6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('stars-by-category dry-run');
      return done(startedAt, 0, false, errors);
    }

    const registry = await readDataStore<RegistryPayloadLite & {
      repos?: Record<string, { fullName?: string; language?: string | null; description?: string }>;
    }>('repo-registry').catch(() => null);

    const candidates = rankedRegistryFullNames(registry, MAX_REPOS, 'desc');
    if (candidates.length === 0) {
      ctx.log.warn('stars-by-category: no registry candidates');
      return done(startedAt, 0, false, errors);
    }

    // Materialise the small repo-lite records by looking up each candidate
    // in the registry; we need language + description for the classifier.
    const reposByFull = registry?.repos ?? {};
    const repos: RegistryRepoLite[] = candidates
      .map((full) => {
        const entry = reposByFull[full.toLowerCase()];
        return {
          fullName: full,
          language: entry?.language ?? null,
          description: entry?.description ?? '',
        };
      })
      .filter((r) => r.fullName.includes('/'));

    const window = rollingWindow(WINDOW_DAYS);
    const dayIndex = new Map<string, number>(window.map((d, i) => [d, i]));

    // Accumulator: 7 categories × WINDOW_DAYS, all initialised to 0.
    const totals: Record<HeroCategoryId, number[]> = Object.fromEntries(
      HERO_CATEGORIES.map((c) => [c.id, new Array(WINDOW_DAYS).fill(0)]),
    ) as Record<HeroCategoryId, number[]>;

    let missingSeries = 0;
    let processed = 0;

    // Bounded concurrency over per-repo Redis reads. Failure on a single repo
    // is tolerated (counts as missing) — we'd rather paint 798 / 800 than zero.
    const queue = [...repos];
    async function worker() {
      while (queue.length > 0) {
        const repo = queue.shift();
        if (!repo) return;
        try {
          const series = await readDataStore<StarActivityLite>(
            payloadSlug(repo.fullName),
          ).catch(() => null);
          if (!series || !Array.isArray(series.points) || series.points.length < 2) {
            missingSeries += 1;
            processed += 1;
            continue;
          }
          const bucket = classifyForHero(repo);
          const deltas = deltasInWindow(series, window);
          for (const [d, v] of deltas) {
            if (v <= 0) continue;
            const idx = dayIndex.get(d);
            if (idx === undefined) continue;
            totals[bucket][idx] = (totals[bucket][idx] ?? 0) + v;
          }
          processed += 1;
        } catch (err) {
          const message = (err as Error).message;
          errors.push({ stage: 'read-repo', message });
          processed += 1;
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    const days: ByCategoryDay[] = window.map((d, i) => ({
      d,
      byCategory: Object.fromEntries(
        HERO_CATEGORIES.map((c) => [c.id, totals[c.id][i] ?? 0]),
      ) as Record<HeroCategoryId, number>,
    }));

    // Zero-write guard. If no repo yielded any delta in the window, the
    // payload would be 90 days of zeros — preserve the prior cache.
    const grand = days.reduce(
      (s, d) => s + Object.values(d.byCategory).reduce((a, b) => a + b, 0),
      0,
    );
    const existing = await readDataStore<StarsByCategoryPayload>(
      'stars-by-category-daily',
    ).catch(() => null);
    const existingDays = existing?.days ?? [];
    if (
      shouldPreserveCache({
        fresh: grand > 0 ? days : [],
        existing: existingDays,
      })
    ) {
      ctx.log.warn(
        { existingDays: existingDays.length, processed, missingSeries },
        'stars-by-category: empty aggregate — preserving last-known-good cache',
      );
      return done(startedAt, 0, false, [
        ...errors,
        { stage: 'aggregate', message: 'zero deltas; cache preserved' },
      ]);
    }

    const payload: StarsByCategoryPayload = {
      fetchedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      totalRepos: processed,
      missingSeries,
      days,
      categories: HERO_CATEGORIES,
    };

    let writeResult: Awaited<ReturnType<typeof writeDataStore>>;
    try {
      writeResult = await writeDataStore('stars-by-category-daily', payload);
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.warn({ err: message }, 'stars-by-category: writeDataStore failed');
      return done(startedAt, processed, false, [
        ...errors,
        { stage: 'write', message },
      ]);
    }

    ctx.log.info(
      {
        slug: 'stars-by-category-daily',
        days: days.length,
        totalRepos: processed,
        missingSeries,
        grandTotal: grand,
        redisSource: writeResult.source,
      },
      'stars-by-category published',
    );

    return {
      fetcher: 'stars-by-category',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: processed,
      itemsUpserted: 0,
      metricsWritten: days.length,
      redisPublished: writeResult.source === 'redis',
      errors,
    };
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
    fetcher: 'stars-by-category',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
