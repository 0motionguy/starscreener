/**
 * category-classify — maps each consensus-trending repo to one of 32 CATEGORIES
 * (the post-C-CAT taxonomy in src/lib/constants.ts) via NanoGPT (Kimi-K2).
 *
 * Without this fetcher the 17 new categories shipped in C-CAT PR #3174 read
 * "0 repos" since nothing tags repos against them. Runs once a day; skips
 * any repo classified within RECLASSIFY_AFTER_DAYS so cost stays bounded.
 *
 * Cost discipline:
 *   ~$0.00003/call * (1000 repos / 20-per-batch) = $0.0015/day at full pool.
 *
 * No-publicly-stale-batches rule:
 *   Payload includes `staleness_seconds`; UI consumers drop the category
 *   facet when staleness > 25h (configurable).
 */

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { callClassify, parseJson, isLlmConfigured, activeProvider } from './llm.js';
import {
  CATEGORY_BRIEFS,
  CHUNK_SIZE,
  EMPTY_PAYLOAD,
  RECLASSIFY_AFTER_DAYS,
  VALID_CATEGORY_IDS,
  type CategoryClassifyPayload,
  type RepoCategoryAssignment,
} from './types.js';
import type {
  ConsensusItem,
  ConsensusTrendingPayload,
} from '../consensus-trending/types.js';

const TOP_N = 1000;
const CHUNK_CONCURRENCY = 3;

const SYSTEM_PROMPT = `You are a precise open-source repo categorizer. Given a list of repos with their names, you assign each to EXACTLY ONE category from the provided taxonomy.

Rules:
- Pick the single best-fitting category id. If a repo could fit two, pick the more specific one.
- Use category id strings VERBATIM from the taxonomy; never invent new ids.
- If a repo's purpose is genuinely unclear from its name, assign category id "devtools" (default) and set confidence to 0.3.
- Output ONLY valid JSON matching the response_format schema. No prose, no markdown fences.

Taxonomy (id → 1-line description):
${VALID_CATEGORY_IDS.map((id) => `- ${id}: ${CATEGORY_BRIEFS[id]}`).join('\n')}`;

function buildChunkUserMessage(repos: ConsensusItem[]): string {
  return `Classify each repo below into EXACTLY ONE category id from the taxonomy.

Repos to classify (${repos.length}):
${repos.map((r) => `- ${r.fullName}`).join('\n')}

Return a JSON object with this shape:
{
  "classifications": [
    {"fullName": "owner/name", "categoryId": "<one of the 32 ids>", "confidence": 0.0-1.0},
    ...
  ]
}`;
}

interface ChunkResultEntry {
  fullName: string;
  categoryId: string;
  confidence?: number;
}

interface ChunkResult {
  classifications?: ChunkResultEntry[];
}

const fetcher: Fetcher = {
  name: 'category-classify',
  // Daily at 03:17 UTC — well off the hour peaks where other fetchers run.
  schedule: '17 3 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('category-classify dry-run');
      return done(startedAt, 0, false);
    }

    const provider = activeProvider();
    if (!isLlmConfigured()) {
      ctx.log.warn(
        'category-classify: no LLM provider configured (NANOGPT_API_KEY/KIMI_API_KEY missing), skipping',
      );
      return done(startedAt, 0, false);
    }

    const consensus = await readDataStore<ConsensusTrendingPayload>('consensus-trending');
    if (!consensus || !Array.isArray(consensus.items) || consensus.items.length === 0) {
      ctx.log.warn('category-classify: no consensus-trending payload yet, skipping');
      return done(startedAt, 0, false);
    }

    const existing = (await readDataStore<CategoryClassifyPayload>('repo-categories')) ?? EMPTY_PAYLOAD;
    const now = Date.now();
    const reclassifyThresholdMs = RECLASSIFY_AFTER_DAYS * 24 * 3600 * 1000;

    const topRepos = consensus.items.slice(0, TOP_N);
    const toClassify: ConsensusItem[] = [];
    for (const r of topRepos) {
      const prev = existing.assignments[r.fullName];
      if (!prev) {
        toClassify.push(r);
        continue;
      }
      const prevAt = Date.parse(prev.classifiedAt);
      if (!Number.isFinite(prevAt) || now - prevAt > reclassifyThresholdMs) {
        toClassify.push(r);
      }
    }

    if (toClassify.length === 0) {
      const merged = freshenPayload(existing, now);
      const result = await writeDataStore('repo-categories', merged);
      ctx.log.info(
        { totalAssignments: Object.keys(merged.assignments).length, redis: result.source },
        'category-classify: no repos due for re-classification',
      );
      return done(startedAt, 0, result.source === 'redis');
    }

    const chunks: ConsensusItem[][] = [];
    for (let i = 0; i < toClassify.length; i += CHUNK_SIZE) {
      chunks.push(toClassify.slice(i, i + CHUNK_SIZE));
    }

    ctx.log.info(
      { provider, chunks: chunks.length, toClassify: toClassify.length, total: topRepos.length },
      'category-classify: starting batched classification',
    );

    const validIdSet = new Set<string>(VALID_CATEGORY_IDS);
    const assignments: Record<string, RepoCategoryAssignment> = { ...existing.assignments };
    const unclassified: string[] = [];
    let resolvedModel: string | undefined;

    const queue: ConsensusItem[][] = [...chunks];
    const sweep = async (): Promise<void> => {
      while (queue.length > 0) {
        const chunk = queue.shift();
        if (!chunk) return;
        try {
          const r = await callClassify({
            systemPrompt: SYSTEM_PROMPT,
            userMessage: buildChunkUserMessage(chunk),
            maxTokens: 1500,
            temperature: 0.2,
          });
          resolvedModel = r.model;
          const parsed = parseJson(r.text) as ChunkResult | null;
          const classifications = parsed?.classifications;
          if (!classifications || !Array.isArray(classifications)) {
            ctx.log.warn(
              { chunkSize: chunk.length, preview: r.text.slice(0, 200) },
              'category-classify: chunk returned no classifications array',
            );
            for (const item of chunk) unclassified.push(item.fullName);
            continue;
          }
          const seen = new Set<string>();
          for (const c of classifications) {
            if (!c || typeof c.fullName !== 'string') continue;
            if (!validIdSet.has(c.categoryId)) {
              unclassified.push(c.fullName);
              continue;
            }
            assignments[c.fullName] = {
              fullName: c.fullName,
              categoryId: c.categoryId,
              confidence:
                typeof c.confidence === 'number' && c.confidence >= 0 && c.confidence <= 1
                  ? c.confidence
                  : 0.5,
              classifiedAt: new Date().toISOString(),
              generator: r.provider,
            };
            seen.add(c.fullName);
          }
          for (const item of chunk) {
            if (!seen.has(item.fullName) && !assignments[item.fullName]) {
              unclassified.push(item.fullName);
            }
          }
        } catch (err) {
          ctx.log.warn(
            { err: err instanceof Error ? err.message : String(err), chunkSize: chunk.length },
            'category-classify: chunk call failed',
          );
          for (const item of chunk) unclassified.push(item.fullName);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, () => sweep()),
    );

    const computedAt = new Date().toISOString();
    const payload: CategoryClassifyPayload = {
      computedAt,
      staleness_seconds: 0,
      itemCount: Object.keys(assignments).length,
      assignments,
      unclassified,
      generator: provider === 'fallback' ? 'fallback' : provider,
      model: resolvedModel,
    };

    const result = await writeDataStore('repo-categories', payload);
    ctx.log.info(
      {
        newClassifications: toClassify.length - unclassified.length,
        unclassified: unclassified.length,
        totalAssignments: payload.itemCount,
        provider,
        model: resolvedModel,
        redis: result.source,
      },
      'category-classify published',
    );
    return done(startedAt, toClassify.length - unclassified.length, result.source === 'redis');
  },
};

function freshenPayload(payload: CategoryClassifyPayload, nowMs: number): CategoryClassifyPayload {
  const computedAt = payload.computedAt || new Date(nowMs).toISOString();
  const computedMs = Date.parse(computedAt);
  const staleness = Number.isFinite(computedMs) ? Math.max(0, Math.floor((nowMs - computedMs) / 1000)) : 0;
  return { ...payload, staleness_seconds: staleness };
}

function done(startedAt: string, items: number, persisted: boolean): RunResult {
  return {
    fetcher: 'category-classify',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: items,
    metricsWritten: 0,
    redisPublished: persisted,
    errors: [],
  };
}

export default fetcher;
