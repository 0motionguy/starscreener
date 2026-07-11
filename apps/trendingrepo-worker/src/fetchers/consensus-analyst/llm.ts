// LLM provider wrapper for the consensus-analyst fetcher.
//
// Resolution order (first match wins):
//   1. NANOGPT_API_KEY set         → NanoGPT (Kimi-K2-Instruct), default base
//      https://nano-gpt.com/api/v1. Standard OpenAI-compatible chat with
//      response_format json_object. Non-streamed (faster + simpler for the
//      14-item sweep). This is the prod path after the Kimi For Coding
//      quota became unreliable for server-side use.
//   2. KIMI_API_KEY set            → Kimi For Coding subscription, streamed,
//      User-Agent gate. Same API surface as before — kept as a fallback so
//      operators with the coding subscription can still use it.
//   3. neither                     → caller short-circuits to template
//
// The generator tag in consensus-verdicts payload reflects which provider
// produced the data ('nanogpt' | 'kimi' | 'template').

import OpenAI from 'openai';
import { loadEnv } from '../../lib/env.js';

const NANOGPT_DEFAULT_BASE = 'https://nano-gpt.com/api/v1';
const NANOGPT_DEFAULT_MODEL = 'moonshotai/Kimi-K2-Instruct';

const KIMI_DEFAULT_BASE = 'https://api.kimi.com/coding/v1';
const KIMI_DEFAULT_MODEL = 'kimi-for-coding';
const KIMI_USER_AGENT = 'claude-cli/1.0';

export type LlmProvider = 'nanogpt' | 'kimi';

let cachedClient: { provider: LlmProvider; model: string; client: OpenAI } | null = null;

export interface LlmCallOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface LlmCallResult {
  text: string;
  provider: LlmProvider;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  };
}

function resolveClient(): { provider: LlmProvider; model: string; client: OpenAI } {
  if (cachedClient) return cachedClient;
  const env = loadEnv();
  if (env.NANOGPT_API_KEY) {
    const model = env.NANOGPT_MODEL ?? NANOGPT_DEFAULT_MODEL;
    cachedClient = {
      provider: 'nanogpt',
      model,
      client: new OpenAI({
        apiKey: env.NANOGPT_API_KEY,
        baseURL: env.NANOGPT_BASE_URL ?? NANOGPT_DEFAULT_BASE,
      }),
    };
    return cachedClient;
  }
  if (env.KIMI_API_KEY) {
    const model = env.KIMI_MODEL ?? KIMI_DEFAULT_MODEL;
    cachedClient = {
      provider: 'kimi',
      model,
      client: new OpenAI({
        apiKey: env.KIMI_API_KEY,
        baseURL: env.KIMI_BASE_URL ?? KIMI_DEFAULT_BASE,
        defaultHeaders: { 'User-Agent': KIMI_USER_AGENT },
      }),
    };
    return cachedClient;
  }
  throw new Error('No LLM provider configured (NANOGPT_API_KEY or KIMI_API_KEY must be set)');
}

export function isLlmConfigured(): boolean {
  const env = loadEnv();
  return Boolean(env.NANOGPT_API_KEY || env.KIMI_API_KEY);
}

export function activeProvider(): LlmProvider | 'template' {
  const env = loadEnv();
  if (env.NANOGPT_API_KEY) return 'nanogpt';
  if (env.KIMI_API_KEY) return 'kimi';
  return 'template';
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  const { provider, model, client } = resolveClient();

  if (provider === 'kimi') {
    // Kimi For Coding requires stream:true — non-stream hangs for K2.6.
    const stream = await client.chat.completions.create({
      model: opts.model ?? model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.4,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userMessage },
      ],
      ...(opts.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    });
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInputTokens = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as { content?: string } | undefined;
      if (delta?.content) text += delta.content;
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
    return {
      text,
      provider,
      model: opts.model ?? model,
      usage: { inputTokens, outputTokens, cachedInputTokens },
    };
  }

  // NanoGPT — non-streamed OpenAI-compatible call.
  const completion = await client.chat.completions.create({
    model: opts.model ?? model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.4,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userMessage },
    ],
    ...(opts.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
  });
  const text = completion.choices?.[0]?.message?.content ?? '';
  const usage = completion.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      }
    | undefined;
  return {
    text,
    provider,
    model: opts.model ?? model,
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
}

export function parseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

// Back-compat — older imports expect a literal `LLM_PROVIDER`. Now resolved at
// call time so this is dynamic, but the union type covers the same generator
// strings the consumers compare against.
export const LLM_PROVIDER: LlmProvider | 'template' = activeProvider();

export function _resetLlmCacheForTests(): void {
  cachedClient = null;
}
