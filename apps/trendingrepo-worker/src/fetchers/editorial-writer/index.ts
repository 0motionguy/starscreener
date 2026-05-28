import { randomUUID } from 'node:crypto';
import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { callLlm, getLlmProvider, isLlmConfigured } from '../../lib/llm/router.js';
import { parseJson } from '../../lib/llm/kimi-client.js';
import type { LlmProvider } from '../../lib/llm/types.js';
import {
  EditorialReportSchema,
  EDITORIAL_BEST_TOPICS,
  SYSTEM_PROMPT,
  buildBestUserMessage,
  type EditorialReport,
} from './prompt.js';

// Slug written to the data-store and read by the app via
// src/lib/editorial-store.ts (refreshEditorialBestFromStore / getEditorialBest).
const SLUG = 'editorial-best';

// 12 topics, each an independent ~1-2s call. Concurrency 4 keeps the whole
// sweep under ~10s wall even on the reasoning model, matching the
// consensus-analyst budget. Evergreen content → daily cadence is plenty.
const TOPIC_CONCURRENCY = 4;

interface EditorialItem extends EditorialReport {
  slug: string;
  title: string;
}

interface EditorialPayload {
  computedAt: string;
  generator: LlmProvider | 'template';
  model?: string;
  items: Record<string, EditorialItem>;
}

const fetcher: Fetcher = {
  name: 'editorial-writer',
  // Daily at 05:40 UTC — off the hourly consensus ticks (:00 / :50) and the
  // 04:33 pool-sweep. Content is evergreen framing, so daily is ample.
  schedule: '40 5 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('editorial-writer dry-run');
      return done(startedAt, 0, false);
    }

    // CRITICAL (keep-last rule): never wipe prior prose. If the LLM is
    // unconfigured/out of quota, carry the existing items forward untouched
    // rather than writing an empty map. Same guard consensus-analyst uses.
    const existing = await loadExistingItems();

    if (!isLlmConfigured()) {
      if (Object.keys(existing).length === 0) {
        ctx.log.warn('editorial-writer: LLM unconfigured and no prior items — nothing to write');
        return done(startedAt, 0, false);
      }
      ctx.log.warn(
        { retainedItems: Object.keys(existing).length },
        'editorial-writer: LLM unconfigured — preserved existing overviews',
      );
      return done(startedAt, Object.keys(existing).length, false);
    }

    const fresh: Record<string, EditorialItem> = {};
    let usedProvider: LlmProvider | undefined;
    let usedModel: string | undefined;

    // Bounded-concurrency sweep — N workers draining a shared queue. Each call
    // swallows its own error so one flake doesn't poison the batch.
    const queue = [...EDITORIAL_BEST_TOPICS];
    const sweep = async (): Promise<void> => {
      while (queue.length > 0) {
        const topic = queue.shift();
        if (!topic) return;
        try {
          const r = await callLlm(
            {
              systemPrompt: SYSTEM_PROMPT,
              userMessage: buildBestUserMessage(topic),
              maxTokens: 2000,
              temperature: 0.5,
              jsonMode: true,
            },
            { feature: 'editorial', task_type: 'summary', request_id: randomUUID() },
          );
          usedProvider = r.meta.provider;
          usedModel = r.meta.model;
          const parsed = parseJson(r.text);
          const validated = EditorialReportSchema.safeParse(parsed);
          if (!validated.success) {
            ctx.log.warn(
              { slug: topic.slug, issues: validated.error.issues.slice(0, 3) },
              'editorial-writer: report failed schema validation',
            );
            continue;
          }
          fresh[topic.slug] = { slug: topic.slug, title: topic.title, ...validated.data };
        } catch (err) {
          ctx.log.warn(
            { slug: topic.slug, err: err instanceof Error ? err.message : String(err) },
            'editorial-writer: topic call failed',
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(TOPIC_CONCURRENCY, EDITORIAL_BEST_TOPICS.length) }, () => sweep()),
    );

    // Read-then-merge: fresh overlays prior, prior survives for any topic that
    // failed this run. Never a bare `items: fresh` (would drop un-refreshed).
    const freshCount = Object.keys(fresh).length;
    if (freshCount === 0) {
      ctx.log.warn(
        { retainedItems: Object.keys(existing).length },
        'editorial-writer: all topic calls failed — preserved existing overviews',
      );
      return done(startedAt, Object.keys(existing).length, false);
    }

    const merged = { ...existing, ...fresh };
    const payload: EditorialPayload = {
      computedAt: new Date().toISOString(),
      generator: usedProvider ?? getLlmProvider(),
      model: usedModel,
      items: merged,
    };

    const result = await writeDataStore(SLUG, payload);
    ctx.log.info(
      {
        freshThisRun: freshCount,
        totalRetained: Object.keys(merged).length,
        generator: payload.generator,
        redis: result.source,
      },
      'editorial-writer published',
    );
    return done(startedAt, freshCount, result.source === 'redis');
  },
};

export default fetcher;

/**
 * Read the current editorial-best payload and return its items map so a run
 * merges fresh prose over it instead of replacing the key. Empty map on
 * missing/malformed — never throws.
 */
async function loadExistingItems(): Promise<Record<string, EditorialItem>> {
  try {
    const existing = await readDataStore<EditorialPayload>(SLUG);
    if (existing && existing.items && typeof existing.items === 'object') {
      return existing.items;
    }
  } catch {
    /* fall through to empty */
  }
  return {};
}

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'editorial-writer',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
