import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';

/**
 * Minimal shape of a Hugging Face model record as returned by
 * `https://huggingface.co/api/models`. We only depend on `pipeline_tag`
 * here; the wider fetcher implementation (A6) is responsible for the rest
 * of the field surface and the actual HTTP call.
 *
 * `pipeline_tag` is `string | null` — null typically appears on entries
 * that are miscategorised (datasets/spaces leaking into the models index)
 * or on legacy uploads without task metadata.
 */
export interface HuggingFaceModel {
  pipeline_tag?: string | null;
  [key: string]: unknown;
}

/**
 * The LLMs tab on trendingrepo's homepage must only surface foundation
 * models with text output: text-only LLMs AND multimodal LLMs (vision /
 * video / any-to-any with a text head). Embedding models,
 * image-classification, ASR, sentence-similarity, text-to-image, TTS, etc.
 * are EXCLUDED. Models with no `pipeline_tag` are also excluded — they're
 * typically datasets/spaces miscategorised as models.
 *
 * 2026-05 audit of HF top-100 trending: 29× image-text-to-text,
 * 17× text-generation, 7× text-to-image, 7× text-to-speech, 5× image-to-
 * video, 3× translation, 3× ASR, 2× any-to-any, etc. The narrower set
 * (text-generation + conversational only) dropped yield to 17/100 and
 * lost most current multimodal foundation models (Qwen-VL, LLaVA,
 * DeepSeek-VL, Nemotron-VL, GPT-4o-class).
 *
 * Kept in sync with `src/lib/huggingface.ts:LLM_PIPELINE_TAGS` (reader
 * side uses the camelCase `pipelineTag` variant of the same set).
 */
export const LLM_PIPELINE_TAGS: ReadonlySet<string> = new Set([
  'text-generation',
  'conversational',
  'image-text-to-text',
  'any-to-any',
  'video-text-to-text',
]);

/**
 * Returns true if the given HF model is an LLM (text-generation or
 * conversational). False for embeddings, vision, ASR, null tags, etc.
 *
 * Pure function — no I/O. Apply BEFORE writing to Redis so the LLMs tab
 * surface only ever ingests clean LLM data.
 */
export function isLlmModel(model: HuggingFaceModel): boolean {
  const tag = model.pipeline_tag;
  return typeof tag === 'string' && LLM_PIPELINE_TAGS.has(tag);
}

/**
 * Filter helper: keep only LLM models from a batch. Other categories
 * (datasets, spaces) flowing through this fetcher must NOT be passed
 * through here — see docstring on `isLlmModel`.
 */
export function filterLlmModels<T extends HuggingFaceModel>(models: readonly T[]): T[] {
  return models.filter(isLlmModel);
}

const fetcher: Fetcher = {
  name: 'huggingface',
  schedule: '0 */4 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    ctx.log.warn('huggingface not yet implemented - skip (see ~/.claude/plans/huggingface-fetcher-plan.md)');
    return empty('huggingface', startedAt);
  },
};

export default fetcher;

function empty(name: string, startedAt: string): RunResult {
  return {
    fetcher: name,
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: 0,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished: false,
    errors: [],
  };
}
