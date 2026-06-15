/**
 * NanoGPT (Kimi-K2-Instruct) client for category classification.
 *
 * Mirrors the L1 PR #3172 pattern in consensus-analyst/llm.ts: prefer
 * NanoGPT when NANOGPT_API_KEY is set, fall back to Kimi if only Kimi
 * is configured. Non-streamed OpenAI-compatible chat for speed (each
 * batch is small + JSON-only).
 */

import OpenAI from 'openai';
import { loadEnv } from '../../lib/env.js';

const NANOGPT_DEFAULT_BASE = 'https://nano-gpt.com/api/v1';
const NANOGPT_DEFAULT_MODEL = 'moonshotai/Kimi-K2-Instruct';

const KIMI_DEFAULT_BASE = 'https://api.kimi.com/coding/v1';
const KIMI_DEFAULT_MODEL = 'kimi-for-coding';

export type ClassifyProvider = 'nanogpt' | 'kimi';

let cachedClient: { provider: ClassifyProvider; model: string; client: OpenAI } | null = null;

function resolveClient(): { provider: ClassifyProvider; model: string; client: OpenAI } {
  if (cachedClient) return cachedClient;
  const env = loadEnv();
  if (env.NANOGPT_API_KEY) {
    cachedClient = {
      provider: 'nanogpt',
      model: env.NANOGPT_MODEL ?? NANOGPT_DEFAULT_MODEL,
      client: new OpenAI({
        apiKey: env.NANOGPT_API_KEY,
        baseURL: env.NANOGPT_BASE_URL ?? NANOGPT_DEFAULT_BASE,
      }),
    };
    return cachedClient;
  }
  if (env.KIMI_API_KEY) {
    cachedClient = {
      provider: 'kimi',
      model: env.KIMI_MODEL ?? KIMI_DEFAULT_MODEL,
      client: new OpenAI({
        apiKey: env.KIMI_API_KEY,
        baseURL: env.KIMI_BASE_URL ?? KIMI_DEFAULT_BASE,
        defaultHeaders: { 'User-Agent': 'claude-cli/1.0' },
      }),
    };
    return cachedClient;
  }
  throw new Error('No LLM provider configured (NANOGPT_API_KEY or KIMI_API_KEY required)');
}

export function isLlmConfigured(): boolean {
  const env = loadEnv();
  return Boolean(env.NANOGPT_API_KEY || env.KIMI_API_KEY);
}

export function activeProvider(): ClassifyProvider | 'fallback' {
  const env = loadEnv();
  if (env.NANOGPT_API_KEY) return 'nanogpt';
  if (env.KIMI_API_KEY) return 'kimi';
  return 'fallback';
}

export interface CallClassifyOpts {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CallClassifyResult {
  text: string;
  provider: ClassifyProvider;
  model: string;
}

export async function callClassify(opts: CallClassifyOpts): Promise<CallClassifyResult> {
  const { provider, model, client } = resolveClient();

  if (provider === 'kimi') {
    const stream = await client.chat.completions.create({
      model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.2,
      stream: true,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userMessage },
      ],
      response_format: { type: 'json_object' as const },
    });
    let text = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as { content?: string } | undefined;
      if (delta?.content) text += delta.content;
    }
    return { text, provider, model };
  }

  // NanoGPT — non-streamed
  const completion = await client.chat.completions.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.2,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userMessage },
    ],
  });
  const text = completion.choices?.[0]?.message?.content ?? '';
  return { text, provider, model };
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

export function _resetClassifyCacheForTests(): void {
  cachedClient = null;
}
