// Provider router + telemetry surface.
//
// One choke point for every LLM call in the worker. Reads LLM_PROVIDER from
// env, dispatches to the matching client, and emits a uniform LlmEvent to
// the recorder before returning.
//
// Adopters call:
//   const r = await callLlm({ systemPrompt, userMessage, ... }, {
//     feature: 'ai_analyst',
//     task_type: 'item',
//     request_id: crypto.randomUUID(),
//   });
//
// Telemetry is required at the call site so blank events can never reach
// the stream — the type makes that a compile error.

import { loadEnv } from '../env.js';
import type { LlmCallOptions, LlmCallResult } from './shared.js';
import { callKimi } from './kimi-client.js';
import { callOpenRouter, LlmCallError } from './openrouter-client.js';
import { hashUserId, recordLlmEvent } from './usage-recorder.js';
import type { LlmErrorCode, LlmEvent, LlmTelemetry } from './types.js';

export function getLlmProvider(): 'kimi' | 'openrouter' {
  return loadEnv().LLM_PROVIDER ?? 'kimi';
}

export async function callLlm(
  opts: LlmCallOptions,
  telemetry: LlmTelemetry,
): Promise<LlmCallResult> {
  const provider = getLlmProvider();
  const startedAt = Date.now();
  try {
    const result = provider === 'openrouter'
      ? await callOpenRouter(opts)
      : await callKimi(opts);

    const event: LlmEvent = {
      request_id: telemetry.request_id,
      openrouter_generation_id: result.meta.generationId,
      user_id_hash: hashUserId(telemetry.user_id ?? null),
      workspace_id: telemetry.workspace_id ?? null,
      feature: telemetry.feature,
      task_type: telemetry.task_type,
      model: result.meta.model,
      provider: result.meta.provider,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.inputTokens + result.usage.outputTokens,
      cached_input_tokens: result.usage.cachedInputTokens,
      // For OpenRouter we leave cost null and let the aggregator reconcile
      // via gen-meta; for Kimi-direct cost is unknown until pricing is
      // wired into model-metadata, so the aggregator will estimate.
      cost_usd: null,
      cost_estimated: false,
      latency_ms: result.meta.latencyMs,
      ttft_ms: result.meta.ttftMs,
      status: 'ok',
      error_code: null,
      created_at: new Date(startedAt).toISOString(),
    };
    recordLlmEvent(event);
    return result;
  } catch (err) {
    const errorCode: LlmErrorCode =
      err instanceof LlmCallError ? err.code : 'unknown';
    const event: LlmEvent = {
      request_id: telemetry.request_id,
      openrouter_generation_id: null,
      user_id_hash: hashUserId(telemetry.user_id ?? null),
      workspace_id: telemetry.workspace_id ?? null,
      feature: telemetry.feature,
      task_type: telemetry.task_type,
      model: opts.model ?? '',
      provider,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cached_input_tokens: 0,
      cost_usd: 0,
      cost_estimated: false,
      latency_ms: Date.now() - startedAt,
      ttft_ms: null,
      status: 'error',
      error_code: errorCode,
      created_at: new Date(startedAt).toISOString(),
    };
    recordLlmEvent(event);
    throw err;
  }
}
