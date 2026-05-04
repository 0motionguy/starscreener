// OpenRouter generation-metadata reconcile.
//
// OpenRouter populates `cost` for a generation asynchronously after the
// stream finishes. We schedule a best-effort fetch a few seconds after the
// call returns and XADD the result to LLM_GEN_META_STREAM. The aggregator
// joins by `generation_id` to upgrade event records from estimated cost to
// authoritative cost.
//
// All failures are swallowed. Cost tracking is a nice-to-have, not a
// blocker on the LLM caller.

import { recordLlmGenMeta } from './usage-recorder.js';
import { loadEnv } from '../env.js';

const RECONCILE_DELAY_MS = 5_000;
const RECONCILE_TIMEOUT_MS = 10_000;

interface OpenRouterGenerationResponse {
  data?: {
    id?: string;
    total_cost?: number;
    cost?: number;
    native_tokens_prompt?: number;
    native_tokens_completion?: number;
  };
}

/**
 * Schedule an async fetch of the generation's metadata. Non-blocking; the
 * caller has already returned the LlmCallResult to the user.
 */
export function scheduleGenMetaReconcile(generationId: string): void {
  if (!generationId) return;
  const env = loadEnv();
  if (!env.OPENROUTER_API_KEY) return;

  const t = setTimeout(() => {
    void fetchGenerationMeta(generationId).catch((err: unknown) => {
      console.warn('[llm-genmeta] fetch failed:', err);
    });
  }, RECONCILE_DELAY_MS);
  if (typeof t.unref === 'function') t.unref();
}

async function fetchGenerationMeta(generationId: string): Promise<void> {
  const env = loadEnv();
  if (!env.OPENROUTER_API_KEY) return;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), RECONCILE_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        },
        signal: ac.signal,
      },
    );
    if (!res.ok) {
      // OpenRouter returns 404 for a few seconds while the generation is
      // still settling — a single retry isn't worth the complexity for v1.
      // The aggregator will still estimate cost from model metadata.
      return;
    }
    const json = (await res.json()) as OpenRouterGenerationResponse;
    const data = json.data;
    if (!data?.id) return;
    recordLlmGenMeta({
      generation_id: data.id,
      cost_usd: typeof data.total_cost === 'number'
        ? data.total_cost
        : (typeof data.cost === 'number' ? data.cost : null),
      native_tokens_input: data.native_tokens_prompt ?? null,
      native_tokens_output: data.native_tokens_completion ?? null,
      fetched_at: new Date().toISOString(),
    });
  } finally {
    clearTimeout(timer);
  }
}
