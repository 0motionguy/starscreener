// NanoGPT wrapper — OpenAI-compatible API (https://nano-gpt.com/api/v1).
//
// Used as the Kimi fallback (see ./router.ts). NanoGPT exposes 400+ models
// through one OpenAI-compatible endpoint; an active subscription covers a
// curated set at ZERO per-token cost. NANOGPT_MODEL MUST be one of those
// subscription-included ids — verify the live list via
//   GET https://nano-gpt.com/api/subscription/v1/models
// Default `moonshotai/kimi-k2.6` is subscription-included and is the exact
// model the consensus analyst is tuned for, so output quality is unchanged
// while Kimi-for-coding billing is restored.
//
// Unlike the Kimi-for-coding endpoint there is NO User-Agent allowlist, so we
// send the SDK default. Streaming + JSON mode mirror the Kimi/OpenRouter
// clients; the return value uses the shared LlmCallResult shape (with `meta`)
// so the router records telemetry uniformly across providers.

import OpenAI from 'openai';
import { FatalConfigError } from '../errors.js';
import { loadEnv } from '../env.js';
import type { LlmCallOptions, LlmCallResult } from './shared.js';
import {
  createStreamIdleTimeout,
  toIdleTimeoutError,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
} from './stream-timeout.js';

const DEFAULT_BASE_URL = 'https://nano-gpt.com/api/v1';
const DEFAULT_MODEL = 'moonshotai/kimi-k2.6';

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const env = loadEnv();
  if (!env.NANOGPT_API_KEY) {
    throw new FatalConfigError('NANOGPT_API_KEY not set — NanoGPT caller cannot run');
  }
  cachedClient = new OpenAI({
    apiKey: env.NANOGPT_API_KEY,
    baseURL: env.NANOGPT_BASE_URL ?? DEFAULT_BASE_URL,
  });
  return cachedClient;
}

export function isNanoGptConfigured(): boolean {
  return Boolean(loadEnv().NANOGPT_API_KEY);
}

export async function callNanoGpt(opts: LlmCallOptions): Promise<LlmCallResult> {
  const env = loadEnv();
  const model = opts.model ?? env.NANOGPT_MODEL ?? DEFAULT_MODEL;
  const client = getClient();
  const startedAt = Date.now();
  let ttftMs: number | null = null;

  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;

  // Idle-timeout guard — mirror the Kimi client so a stalled NanoGPT stream
  // (the fallback provider) can't pin the worker either.
  const idle = createStreamIdleTimeout();
  try {
    // Stream like the Kimi/OpenRouter paths — reasoning-class models (kimi-k2.6,
    // glm-*) can stall non-stream requests, and streaming gives us TTFT.
    const stream = await client.chat.completions.create(
      {
        model,
        max_tokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0.4,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userMessage },
        ],
        ...(opts.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      },
      { signal: idle.signal },
    );

    for await (const chunk of stream) {
      idle.reset();
      const delta = chunk.choices?.[0]?.delta as
        | { content?: string; reasoning_content?: string }
        | undefined;
      // Accumulate visible content only — reasoning_content is the model's CoT
      // scratchpad and must not pollute the JSON payload we parse downstream.
      if (delta?.content) {
        if (ttftMs === null) ttftMs = Date.now() - startedAt;
        text += delta.content;
      }
      const usage = chunk.usage as
        | {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
          }
        | undefined;
      if (usage) {
        inputTokens = usage.prompt_tokens ?? inputTokens;
        outputTokens = usage.completion_tokens ?? outputTokens;
        cachedInputTokens = usage.prompt_tokens_details?.cached_tokens ?? cachedInputTokens;
      }
    }
  } catch (err) {
    throw idle.timedOut
      ? toIdleTimeoutError('nanogpt', DEFAULT_STREAM_IDLE_TIMEOUT_MS, err)
      : err;
  } finally {
    idle.clear();
  }

  return {
    text,
    usage: { inputTokens, outputTokens, cachedInputTokens },
    meta: {
      provider: 'nanogpt',
      model,
      generationId: null,
      latencyMs: Date.now() - startedAt,
      ttftMs,
    },
  };
}
