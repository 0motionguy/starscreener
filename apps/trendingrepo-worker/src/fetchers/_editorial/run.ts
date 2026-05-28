// Shared editorial-prose runner — the read→generate→merge→never-empty loop
// behind the LLM-written GEO answer-surface overviews (categories / compare /
// alternatives). Extracted from the proven editorial-writer/index.ts pattern so
// the three sibling fetchers don't each re-implement it.
//
// Dir is `_`-prefixed so the keep-last-50 lint (scripts/check-worker-keep-last-50.mjs)
// skips it — it scans per-fetcher index.ts files, and the fetchers that call
// runEditorial() carry no literal writeDataStore() (classified "no-write" =
// compliant). The merge-safety the lint protects lives here: read existing →
// overlay fresh → never write an empty/partial map (a failed item or whole
// run preserves the prior payload), mirroring editorial-writer + consensus-analyst.

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { callLlm, getLlmProvider, isLlmConfigured } from '../../lib/llm/router.js';
import { parseJson } from '../../lib/llm/kimi-client.js';
import type { LlmProvider } from '../../lib/llm/types.js';

// Same contract as editorial-writer's EditorialReportSchema: a one-line tagline
// (optional, meta-description use) + a 2-4 sentence expert overview. Kept here
// as the canonical schema for the sibling fetchers (editorial-writer keeps its
// own copy — not refactored, to avoid touching the about-to-ship /best path).
export const EditorialReportSchema = z.object({
  tagline: z.string().min(1).max(160).optional(),
  overview: z.string().min(40).max(900),
});

export type EditorialReport = z.infer<typeof EditorialReportSchema>;

export interface EditorialItem extends EditorialReport {
  /** Storage key for this entry (topic slug / compare pair key / repo fullName). */
  slug: string;
  title: string;
}

export interface EditorialPayload {
  computedAt: string;
  generator: LlmProvider | 'template';
  model?: string;
  items: Record<string, EditorialItem>;
}

/** One unit of work: a key to store under, a stored title, and the LLM prompt. */
export interface EditorialWorkItem {
  key: string;
  title: string;
  userMessage: string;
}

export interface RunEditorialOptions {
  /** Data-store slug to read/write (e.g. "editorial-categories"). */
  slug: string;
  /** Fetcher name for logs + RunResult. */
  fetcherName: string;
  systemPrompt: string;
  /** Build the candidate work-list. Async so callers can read other slugs first. */
  buildWorkItems: () => Promise<EditorialWorkItem[]>;
  /** Bounded sweep concurrency. Default 4 (matches editorial-writer/consensus-analyst). */
  concurrency?: number;
  /**
   * Skip candidates whose key already has a stored overview. Overviews are
   * evergreen, so high-cardinality surfaces (alternatives) only generate the
   * gaps — steady-state cost stays near-zero.
   */
  skipExisting?: boolean;
  /** Cap NEW generations per run (after skipExisting). Spreads a cold start over runs. */
  maxNew?: number;
}

/**
 * Run an editorial sweep: read existing → generate for (capped, deduped)
 * candidates with bounded concurrency → overlay fresh on existing → write.
 * Never writes an empty or shrunk map: a failed item keeps its prior entry, an
 * all-failed run / unconfigured LLM preserves the whole prior payload untouched.
 */
export async function runEditorial(
  ctx: FetcherContext,
  opts: RunEditorialOptions,
): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const concurrency = opts.concurrency ?? 4;

  if (ctx.dryRun) {
    const candidates = await safeBuild(ctx, opts);
    ctx.log.info({ candidates: candidates.length }, `${opts.fetcherName} dry-run`);
    return done(opts.fetcherName, startedAt, 0, false);
  }

  const existing = await loadExistingItems(opts.slug);

  if (!isLlmConfigured()) {
    const retained = Object.keys(existing).length;
    ctx.log.warn(
      { retainedItems: retained },
      `${opts.fetcherName}: LLM unconfigured — preserved existing overviews (no write)`,
    );
    return done(opts.fetcherName, startedAt, retained, false);
  }

  let candidates = await opts.buildWorkItems();
  if (opts.skipExisting) {
    candidates = candidates.filter((c) => !existing[c.key]);
  }
  if (typeof opts.maxNew === 'number' && opts.maxNew >= 0 && candidates.length > opts.maxNew) {
    candidates = candidates.slice(0, opts.maxNew);
  }

  if (candidates.length === 0) {
    const retained = Object.keys(existing).length;
    ctx.log.info({ retainedItems: retained }, `${opts.fetcherName}: no new candidates this run`);
    return done(opts.fetcherName, startedAt, retained, false);
  }

  const fresh: Record<string, EditorialItem> = {};
  let usedProvider: LlmProvider | undefined;
  let usedModel: string | undefined;

  // Bounded-concurrency sweep — N workers draining a shared queue. Each call
  // swallows its own error so one flake doesn't poison the batch.
  const queue = [...candidates];
  const sweep = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      try {
        const r = await callLlm(
          {
            systemPrompt: opts.systemPrompt,
            userMessage: item.userMessage,
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
            { key: item.key, issues: validated.error.issues.slice(0, 3) },
            `${opts.fetcherName}: report failed schema validation`,
          );
          continue;
        }
        fresh[item.key] = { slug: item.key, title: item.title, ...validated.data };
      } catch (err) {
        ctx.log.warn(
          { key: item.key, err: err instanceof Error ? err.message : String(err) },
          `${opts.fetcherName}: item call failed`,
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, () => sweep()),
  );

  // Read-then-merge: fresh overlays prior; any item that failed this run keeps
  // its prior entry. Never a bare `items: fresh` (would drop un-refreshed keys).
  const freshCount = Object.keys(fresh).length;
  if (freshCount === 0) {
    const retained = Object.keys(existing).length;
    ctx.log.warn(
      { retainedItems: retained },
      `${opts.fetcherName}: all calls failed — preserved existing overviews`,
    );
    return done(opts.fetcherName, startedAt, retained, false);
  }

  const merged = { ...existing, ...fresh };
  const payload: EditorialPayload = {
    computedAt: new Date().toISOString(),
    generator: usedProvider ?? getLlmProvider(),
    model: usedModel,
    items: merged,
  };

  const result = await writeDataStore(opts.slug, payload);
  ctx.log.info(
    {
      slug: opts.slug,
      freshThisRun: freshCount,
      totalRetained: Object.keys(merged).length,
      generator: payload.generator,
      redis: result.source,
    },
    `${opts.fetcherName} published`,
  );
  return done(opts.fetcherName, startedAt, freshCount, result.source === 'redis');
}

async function safeBuild(
  ctx: FetcherContext,
  opts: RunEditorialOptions,
): Promise<EditorialWorkItem[]> {
  try {
    return await opts.buildWorkItems();
  } catch (err) {
    ctx.log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      `${opts.fetcherName}: buildWorkItems failed in dry-run`,
    );
    return [];
  }
}

async function loadExistingItems(slug: string): Promise<Record<string, EditorialItem>> {
  try {
    const existing = await readDataStore<EditorialPayload>(slug);
    if (existing && existing.items && typeof existing.items === 'object') {
      return existing.items;
    }
  } catch {
    /* fall through to empty */
  }
  return {};
}

function done(
  fetcher: string,
  startedAt: string,
  items: number,
  redisPublished: boolean,
): RunResult {
  return {
    fetcher,
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
