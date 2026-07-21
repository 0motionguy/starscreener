// X engagement — target config (operator-editable seed).
//
// `loadTargets()` returns the curated account list; `loadTopicQueries()`
// returns the topic searches. Both prefer an env-provided JSON override so the
// operator (or the parallel research agent) can inject the real curated list
// WITHOUT a code change — the placeholders below are a safe, obvious default.
//
// Pure module (no I/O beyond reading env) — safe to unit test.

import type { EngagementTarget } from "./types";

// ---------------------------------------------------------------------------
// PLACEHOLDER curated list — ~6 obvious AI / dev-tooling accounts the
// trendingrepo brand cares about (AI agents, LLMs, open-source dev tools).
//
// OPERATOR: curated list wired in at integration — a parallel research agent
// produces the real vetted list and injects it via ENGAGE_TARGETS_JSON (or by
// replacing this constant). Keep entries to accounts whose posts we can add
// genuine, data-driven value under; never engagement-farm.
// ---------------------------------------------------------------------------
export const PLACEHOLDER_TARGETS: readonly EngagementTarget[] = [
  {
    handle: "langchainai",
    reason: "LLM agent framework — trending-repo audience overlap",
    topics: ["ai agents", "llm", "rag"],
  },
  {
    handle: "llama_index",
    reason: "RAG / data framework for LLM apps",
    topics: ["rag", "llm", "data"],
  },
  {
    handle: "ollama",
    reason: "run open-source LLMs locally — dev-tool audience",
    topics: ["local llm", "open source", "inference"],
  },
  {
    handle: "huggingface",
    reason: "open-source model + dataset hub",
    topics: ["open source", "models", "ml"],
  },
  {
    handle: "vercel",
    reason: "developer tooling + AI SDK",
    topics: ["devtools", "ai sdk", "frontend"],
  },
  {
    handle: "github",
    reason: "home of open source — core trendingrepo topic",
    topics: ["open source", "devtools", "github"],
  },
];

// ---------------------------------------------------------------------------
// Topic searches — surface fresh AI/dev-tool conversation the brand can add a
// data point to, beyond the curated handles. Env-overridable via
// ENGAGE_TOPIC_QUERIES (JSON string array).
// ---------------------------------------------------------------------------
export const DEFAULT_TOPIC_QUERIES: readonly string[] = [
  '"open source" (AI agent OR LLM) tool',
  'new (LLM OR "AI agent") framework github',
  '"just shipped" (developer tool OR CLI OR SDK) open source',
];

function parseTargetsJson(raw: string): EngagementTarget[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: EngagementTarget[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const obj = entry as Record<string, unknown>;
      const handle =
        typeof obj.handle === "string" ? obj.handle.trim().replace(/^@+/, "") : "";
      if (!handle) continue;
      const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
      const topics = Array.isArray(obj.topics)
        ? obj.topics.filter((t): t is string => typeof t === "string").map((t) => t.trim())
        : [];
      out.push({ handle, reason: reason || "operator-curated", topics });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Curated engagement targets. Prefers ENGAGE_TARGETS_JSON (the injection point
 * for the real curated list); falls back to PLACEHOLDER_TARGETS.
 */
export function loadTargets(
  env: Record<string, string | undefined> = process.env,
): EngagementTarget[] {
  const raw = env.ENGAGE_TARGETS_JSON?.trim();
  if (raw) {
    const parsed = parseTargetsJson(raw);
    if (parsed) return parsed;
  }
  return [...PLACEHOLDER_TARGETS];
}

/**
 * Topic search queries. Prefers ENGAGE_TOPIC_QUERIES (JSON string array);
 * falls back to DEFAULT_TOPIC_QUERIES.
 */
export function loadTopicQueries(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const raw = env.ENGAGE_TOPIC_QUERIES?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const out = parsed
          .filter((q): q is string => typeof q === "string")
          .map((q) => q.trim())
          .filter(Boolean);
        if (out.length > 0) return out;
      }
    } catch {
      // fall through to defaults
    }
  }
  return [...DEFAULT_TOPIC_QUERIES];
}
