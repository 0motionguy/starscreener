// Thin shim delegating to the unified LLM router.
//
// The actual provider implementations live in apps/trendingrepo-worker/src/lib/llm/.
// This file remains as the existing import path so consensus-analyst code
// doesn't have to reach across the worker tree for every call.

import { loadEnv } from '../../lib/env.js';
import { getLlmProvider } from '../../lib/llm/router.js';

export { callLlm } from '../../lib/llm/router.js';
export { parseJson } from '../../lib/llm/kimi-client.js';
export type { LlmCallOptions, LlmCallResult } from '../../lib/llm/shared.js';
export { getLlmProvider };

/**
 * True when the currently selected provider has its required credentials.
 * Used by the fetcher to decide between live LLM mode and template fallback.
 */
export function isLlmConfigured(): boolean {
  const env = loadEnv();
  const provider = getLlmProvider();
  if (provider === 'openrouter') return Boolean(env.OPENROUTER_API_KEY);
  return Boolean(env.KIMI_API_KEY);
}
