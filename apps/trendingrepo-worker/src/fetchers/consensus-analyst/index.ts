import { randomUUID } from 'node:crypto';
import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { callLlm, parseJson, isLlmConfigured, getLlmProvider } from './llm.js';
import { flushLlmEvents } from '../../lib/llm/usage-recorder.js';
import {
  ItemReportSchema,
  RibbonSchema,
  SYSTEM_PROMPT,
  RIBBON_SYSTEM_PROMPT,
  buildItemUserMessage,
  buildRibbonUserMessage,
  type AnalystUserMessageContext,
  type ItemReport,
  type Ribbon,
} from './prompt.js';
import type {
  ConsensusItem,
  ConsensusTrendingPayload,
} from '../consensus-trending/types.js';

const TOP_N = 14;
// Kimi K2.6 reasoning model is ~80s per call. Sequential 14-item sweep =
// 18min, blowing the hourly slot. Concurrency 4 brings it to ~5min wall
// while staying conservative on the subscription's likely concurrency cap.
const ITEM_CONCURRENCY = 4;

interface VerdictsItemPayload extends ItemReport {
  fullName: string;
}

interface VerdictsPayload {
  computedAt: string;
  generator: ReturnType<typeof getLlmProvider> | 'template';
  model?: string;
  ribbon: Ribbon;
  items: Record<string, VerdictsItemPayload>;
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedInputTokens: number;
  };
}

const fetcher: Fetcher = {
  name: 'consensus-analyst',
  // Runs 10 minutes after consensus-trending (which is at :50). Top 14 sweep
  // benefits from Kimi auto-prefix-caching: identical system prompt across
  // calls reuses cached prefix tokens.
  schedule: '0 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('consensus-analyst dry-run');
      return done(startedAt, 0, false);
    }

    const consensusPayload = await readDataStore<ConsensusTrendingPayload>('consensus-trending');
    if (!consensusPayload || !Array.isArray(consensusPayload.items) || consensusPayload.items.length === 0) {
      ctx.log.warn('consensus-analyst: no consensus-trending payload yet, skipping');
      return done(startedAt, 0, false);
    }

    if (!isLlmConfigured()) {
      // Template-only fallback so the page still renders sensibly without LLM creds.
      const fallback = buildTemplatePayload(consensusPayload);
      const result = await writeDataStore('consensus-verdicts', fallback);
      ctx.log.warn(
        { redis: result.source },
        'consensus-analyst: KIMI_API_KEY missing — wrote template-only verdicts',
      );
      return done(startedAt, Object.keys(fallback.items).length, result.source === 'redis');
    }

    const ctxMsg: AnalystUserMessageContext = {
      poolSize: consensusPayload.itemCount,
      bandCounts: consensusPayload.bandCounts,
      sourceStats: consensusPayload.sourceStats,
      weights: consensusPayload.weights,
    };
    const topItems = consensusPayload.items.slice(0, TOP_N);

    const items: Record<string, VerdictsItemPayload> = {};
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;

    // Bounded-concurrency sweep — N workers pulling from a shared queue.
    // Preserves per-call retry semantics (each item swallows its own errors)
    // so a single Kimi flake doesn't poison the whole batch.
    const queue: ConsensusItem[] = [...topItems];
    const sweepItem = async (): Promise<void> => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        try {
          const r = await callLlm(
            {
              systemPrompt: SYSTEM_PROMPT,
              userMessage: buildItemUserMessage(item, ctxMsg),
              // K2.6 is a reasoning model — burns ~2-4k tokens on internal CoT
              // before emitting the final JSON. Headroom for reasoning + answer.
              maxTokens: 5000,
              temperature: 0.4,
              jsonMode: true,
            },
            { feature: 'ai_analyst', task_type: 'item', request_id: randomUUID() },
          );
          totalInput += r.usage.inputTokens;
          totalOutput += r.usage.outputTokens;
          totalCached += r.usage.cachedInputTokens;

          const parsed = parseJson(r.text);
          const validated = ItemReportSchema.safeParse(parsed);
          if (!validated.success) {
            ctx.log.warn(
              { fullName: item.fullName, issues: validated.error.issues.slice(0, 3) },
              'consensus-analyst: item report failed schema validation',
            );
            continue;
          }
          items[item.fullName] = { fullName: item.fullName, ...validated.data };
        } catch (err) {
          ctx.log.warn(
            { fullName: item.fullName, err: err instanceof Error ? err.message : String(err) },
            'consensus-analyst: item call failed',
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(ITEM_CONCURRENCY, topItems.length) }, () => sweepItem()),
    );

    let ribbon: Ribbon = templateRibbon(consensusPayload);
    try {
      const r = await callLlm(
        {
          systemPrompt: RIBBON_SYSTEM_PROMPT,
          userMessage: buildRibbonUserMessage(topItems, ctxMsg),
          maxTokens: 3500,
          temperature: 0.5,
          jsonMode: true,
        },
        { feature: 'ai_analyst', task_type: 'ribbon', request_id: randomUUID() },
      );
      totalInput += r.usage.inputTokens;
      totalOutput += r.usage.outputTokens;
      totalCached += r.usage.cachedInputTokens;
      const parsed = parseJson(r.text);
      const validated = RibbonSchema.safeParse(parsed);
      if (validated.success) {
        ribbon = validated.data;
      } else {
        ctx.log.warn({ issues: validated.error.issues.slice(0, 3) }, 'consensus-analyst: ribbon schema invalid');
      }
    } catch (err) {
      ctx.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'consensus-analyst: ribbon call failed — using template',
      );
    }

    const env = loadEnvFromProcess();
    const payload: VerdictsPayload = {
      computedAt: new Date().toISOString(),
      generator: getLlmProvider(),
      model: env.model,
      ribbon,
      items,
      usage: {
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalCachedInputTokens: totalCached,
      },
    };

    // Force-flush any queued LLM telemetry before the fetcher returns. Cron
    // workers may exit immediately after run() resolves; the recorder's
    // flush-on-exit hook isn't guaranteed to fire under all process managers.
    await flushLlmEvents().catch((err: unknown) => {
      ctx.log.warn({ err: err instanceof Error ? err.message : String(err) }, 'consensus-analyst: llm telemetry flush failed');
    });

    const result = await writeDataStore('consensus-verdicts', payload);
    ctx.log.info(
      {
        itemCount: Object.keys(items).length,
        ribbonBullets: ribbon.bullets.length,
        usage: payload.usage,
        cacheHitRate:
          totalCached + totalInput > 0
            ? Number((totalCached / (totalCached + totalInput)).toFixed(3))
            : 0,
        redis: result.source,
      },
      'consensus-analyst published',
    );
    return done(startedAt, Object.keys(items).length, result.source === 'redis');
  },
};

export default fetcher;

function loadEnvFromProcess(): { model: string } {
  return { model: process.env.KIMI_MODEL ?? 'kimi-k2-0711-preview' };
}

function buildTemplatePayload(p: ConsensusTrendingPayload): VerdictsPayload {
  return {
    computedAt: new Date().toISOString(),
    generator: 'template',
    ribbon: templateRibbon(p),
    items: {},
    usage: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedInputTokens: 0,
    },
  };
}

function templateRibbon(p: ConsensusTrendingPayload): Ribbon {
  const top = p.items[0];
  const earlies = p.items.filter((i: ConsensusItem) => i.verdict === 'early_call').slice(0, 3);
  const divs = p.items.filter((i: ConsensusItem) => i.verdict === 'divergence').slice(0, 2);
  const headline = top
    ? `${p.bandCounts.strong_consensus} strong consensus picks today; ${top.fullName} leads at score ${top.consensusScore.toFixed(1)}.`
    : `Pool of ${p.itemCount} candidates — awaiting fresh data.`;
  const bullets: string[] = [];
  if (top) bullets.push(`Lead: ${top.fullName} — ${top.sourceCount}/8 sources, confidence ${top.confidence}%.`);
  if (earlies.length > 0) {
    bullets.push(`Early calls: ${earlies.map((e: ConsensusItem) => e.fullName).join(', ')}.`);
  }
  if (divs.length > 0) {
    bullets.push(`Divergence watch: ${divs.map((d: ConsensusItem) => `${d.fullName} (gap ${d.maxRankGap})`).join(', ')}.`);
  }
  bullets.push(`Pool: ${p.itemCount} candidates · ${p.bandCounts.external_only} external-only · ${p.bandCounts.single_source} single-source.`);
  return { headline, bullets };
}

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'consensus-analyst',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
