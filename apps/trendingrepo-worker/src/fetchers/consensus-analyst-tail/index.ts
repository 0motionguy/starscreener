// consensus-analyst-tail — daily deep-coverage sweep of the consensus-trending
// tail (ranks 31-200), skipping anything already in consensus-verdicts.items.
//
// WHY
//   Primary `consensus-analyst` (./consensus-analyst/index.ts) analyzes the
//   hourly TOP_N=30. consensus-trending publishes 200 items; without this
//   tail fetcher the rank-31..200 band would never get a verdict and the
//   repo-profile pages for those entities fall back to the deterministic
//   why-narrative generator.
//
//   Rather than re-analyze repos every day (Kimi is expensive in wall-time:
//   ~80s/call), this fetcher filters out any fullName that already has an
//   entry in `consensus-verdicts.items`. New items added to consensus-trending
//   get picked up on the next daily run. Over time the full pool converges.
//
// HOW
//   1. Read consensus-trending (top 200 items, already ranked).
//   2. Read consensus-verdicts (current verdicts map keyed by fullName).
//   3. Build the candidate list = items[30..199] MINUS items already in
//      verdicts.items.
//   4. Take the first MAX_TAIL_PER_RUN (default 60). Run Kimi → NanoGPT via
//      the same prompt module, with bounded concurrency.
//   5. Read-then-merge into consensus-verdicts so primary's hourly run sees
//      our additions and never overwrites them with empty data.
//
// CRON
//   '0 5 * * *' — daily at 05:00 UTC. Off-peak. Primary analyst runs hourly
//   on the :00 minute too; the ItemReportSchema reads-then-merges so if both
//   happen to fire at 5:00 the worse case is "primary's :00 run merges with
//   our 5:00 base" — both write distinct keys.
//
// WALL-CLOCK BUDGET
//   60 items × 80s / 4 concurrency = ~20 min. Well inside the slack between
//   05:00 daily and the next hourly :50 analyst tick. Kimi prefix-cache
//   helps amortize the system prompt across calls so subsequent items in
//   the same run cost cached input.

import { randomUUID } from 'node:crypto';
import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { callLlm, getLlmProvider, isLlmConfigured } from '../../lib/llm/router.js';
import { parseJson } from '../../lib/llm/kimi-client.js';
import type { LlmProvider } from '../../lib/llm/types.js';
import {
  ItemReportSchema,
  SYSTEM_PROMPT,
  buildItemUserMessage,
  normalizeItemReport,
  type AnalystUserMessageContext,
  type ItemReport,
} from '../consensus-analyst/prompt.js';
import type {
  ConsensusItem,
  ConsensusTrendingPayload,
} from '../consensus-trending/types.js';

const SKIP_LEADING = 30; // primary covers 0..29
const MAX_TAIL_PER_RUN = Math.max(
  1,
  Math.min(
    120,
    Number.parseInt(process.env.CONSENSUS_TAIL_LIMIT ?? '60', 10) || 60,
  ),
);
const ITEM_CONCURRENCY = 4;

interface VerdictsItemPayload extends ItemReport {
  fullName: string;
}

interface VerdictsPayload {
  computedAt: string;
  generator: LlmProvider | 'template';
  model?: string;
  ribbon: {
    headline: string;
    bullets: string[];
    poolNote?: string;
  };
  items: Record<string, VerdictsItemPayload>;
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedInputTokens: number;
  };
}

const fetcher: Fetcher = {
  name: 'consensus-analyst-tail',
  schedule: '0 5 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('consensus-analyst-tail dry-run');
      return done(startedAt, 0, false);
    }

    const consensusPayload =
      await readDataStore<ConsensusTrendingPayload>('consensus-trending');
    if (
      !consensusPayload ||
      !Array.isArray(consensusPayload.items) ||
      consensusPayload.items.length <= SKIP_LEADING
    ) {
      ctx.log.warn(
        { itemCount: consensusPayload?.items?.length ?? 0 },
        'consensus-analyst-tail: no tail to analyze (consensus-trending has ≤30 items)',
      );
      return done(startedAt, 0, false);
    }

    if (!isLlmConfigured()) {
      ctx.log.warn(
        'consensus-analyst-tail: LLM unconfigured, no-op (primary handles template fallback)',
      );
      return done(startedAt, 0, false);
    }

    // Build candidate set = tail of consensus-trending MINUS already-verdicted.
    const existingItems = await loadExistingItems();
    const existingKeys = new Set(Object.keys(existingItems));
    const tail = consensusPayload.items
      .slice(SKIP_LEADING)
      .filter((it) => !existingKeys.has(it.fullName));
    if (tail.length === 0) {
      ctx.log.info(
        { existingCount: existingKeys.size },
        'consensus-analyst-tail: no new tail items — every consensus-trending entry already verdicted',
      );
      return done(startedAt, 0, false);
    }
    const candidates = tail.slice(0, MAX_TAIL_PER_RUN);

    const ctxMsg: AnalystUserMessageContext = {
      poolSize: consensusPayload.itemCount,
      bandCounts: consensusPayload.bandCounts,
      sourceStats: consensusPayload.sourceStats,
      weights: consensusPayload.weights,
    };

    const items: Record<string, VerdictsItemPayload> = {};
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;
    let usedProvider: LlmProvider | undefined;
    let usedModel: string | undefined;
    let repairedItems = 0;

    const queue: ConsensusItem[] = [...candidates];
    const sweepItem = async (): Promise<void> => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        try {
          const r = await callLlm(
            {
              systemPrompt: SYSTEM_PROMPT,
              userMessage: buildItemUserMessage(item, ctxMsg),
              maxTokens: 5000,
              temperature: 0.4,
              jsonMode: true,
            },
            {
              // Reuses the existing `ai_analyst` feature literal so telemetry
              // aggregates with the primary fetcher. task_type stays 'item'
              // for the same reason.
              feature: 'ai_analyst',
              task_type: 'item',
              request_id: randomUUID(),
            },
          );
          usedProvider = r.meta.provider;
          usedModel = r.meta.model;
          totalInput += r.usage.inputTokens;
          totalOutput += r.usage.outputTokens;
          totalCached += r.usage.cachedInputTokens;

          const parsed = parseJson(r.text);
          const validated = ItemReportSchema.safeParse(parsed);
          if (!validated.success) {
            repairedItems += 1;
            ctx.log.warn(
              {
                fullName: item.fullName,
                issues: validated.error.issues.slice(0, 3),
              },
              'consensus-analyst-tail: repaired item report with deterministic consensus facts',
            );
          }
          items[item.fullName] = {
            fullName: item.fullName,
            ...normalizeItemReport(parsed, item),
          };
        } catch (err) {
          ctx.log.warn(
            {
              fullName: item.fullName,
              err: err instanceof Error ? err.message : String(err),
            },
            'consensus-analyst-tail: item call failed',
          );
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(ITEM_CONCURRENCY, candidates.length) },
        () => sweepItem(),
      ),
    );

    const freshCount = Object.keys(items).length;
    if (freshCount === 0) {
      ctx.log.warn(
        { candidates: candidates.length },
        'consensus-analyst-tail: every call failed — skipping write to preserve existing verdicts',
      );
      return done(startedAt, 0, false);
    }

    // Re-read existing verdicts JUST before write to absorb any primary run
    // that may have completed in our wall-clock window. Then merge.
    const latestExisting = await loadExistingItems();
    const latestPayload = await readDataStore<VerdictsPayload>('consensus-verdicts');
    const mergedItems = { ...latestExisting, ...items };
    const generator = repairedItems === freshCount
      ? 'template'
      : (usedProvider ?? getLlmProvider());
    const payload: VerdictsPayload = {
      computedAt: new Date().toISOString(),
      generator,
      ...(generator !== 'template' && usedModel ? { model: usedModel } : {}),
      // Preserve the latest ribbon/usage from the existing payload — the tail
      // fetcher's job is item-coverage only, not ribbon regeneration.
      ribbon: latestPayload?.ribbon ?? {
        headline: '',
        bullets: [],
      },
      items: mergedItems,
      usage: {
        totalInputTokens: (latestPayload?.usage?.totalInputTokens ?? 0) + totalInput,
        totalOutputTokens:
          (latestPayload?.usage?.totalOutputTokens ?? 0) + totalOutput,
        totalCachedInputTokens:
          (latestPayload?.usage?.totalCachedInputTokens ?? 0) + totalCached,
      },
    };

    const result = await writeDataStore('consensus-verdicts', payload);
    ctx.log.info(
      {
        freshThisRun: freshCount,
        repairedItems,
        candidates: candidates.length,
        totalRetained: Object.keys(mergedItems).length,
        usage: { totalInput, totalOutput, totalCached },
        redis: result.source,
      },
      'consensus-analyst-tail published',
    );
    return done(startedAt, freshCount, result.source === 'redis');
  },
};

export default fetcher;

async function loadExistingItems(): Promise<Record<string, VerdictsItemPayload>> {
  try {
    const existing = await readDataStore<VerdictsPayload>('consensus-verdicts');
    if (existing && existing.items && typeof existing.items === 'object') {
      return existing.items;
    }
  } catch {
    /* fall through to empty */
  }
  return {};
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
): RunResult {
  return {
    fetcher: 'consensus-analyst-tail',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
