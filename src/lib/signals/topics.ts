// Topic classifier for the cross-source filter bar.
//
// Each topic is a set of regex patterns matched against a signal's title +
// tags. An item belongs to a topic if any of its tags or its title hits a
// pattern. Items can match multiple topics (an "agent that uses a model"
// hits both AGENTS and MODELS) — that's intentional. The filter is
// inclusive: ?topic=models surfaces anything tagged "models", regardless
// of whether it also matches another topic.
//
// Topics are deliberately broad. Granular sub-topic filtering happens via
// the tag-momentum heatmap (#claude-skills, #o3, etc.), not the chips.

import type { SignalItem } from "./types";

export type TopicKey = "agents" | "models" | "devtools" | "research";

interface TopicSpec {
  key: TopicKey;
  label: string;
  patterns: RegExp[];
}

const TOPICS: TopicSpec[] = [
  {
    key: "agents",
    label: "AGENTS",
    patterns: [
      /\bagent(s|ic)?\b/i,
      /\bautoGPT\b/i,
      /\blangchain|langgraph|crewai|autogen|swarm\b/i,
      /\bskills?\b/i,
      /\bmcp\b/i,
      /\btool[- ]?use\b/i,
      /\bworkflow\b/i,
    ],
  },
  {
    key: "models",
    label: "MODELS",
    patterns: [
      /\bgpt[-\s]?\d/i,
      /\bo[123][-\s]?(deep|mini|preview|pro)?\b/i,
      /\bsonnet|opus|haiku\b/i,
      /\bclaude[-\s]?\d/i,
      /\bllama[-\s]?\d/i,
      /\bgemini|mistral|deepseek|qwen|grok|phi[-\s]?\d/i,
      /\bcodestral|starcoder|codellama\b/i,
      /\b(?:base|chat|instruct|reasoning)[-\s]?model\b/i,
      /\bfine[-\s]?tun(e|ing|ed)\b/i,
      /\bdistill(ation|ed)?\b/i,
      /\bquantization|quantized\b/i,
    ],
  },
  {
    key: "devtools",
    label: "DEVTOOLS",
    patterns: [
      /\bcursor|aider|cline|continue|copilot|codeium\b/i,
      /\bvscode|jetbrains|neovim\b/i,
      /\bide\b/i,
      /\bcli|terminal|tmux\b/i,
      /\bbuild|bundler|webpack|vite|turbopack\b/i,
      /\beditor|formatter|linter|lsp\b/i,
      /\bdebugger?|profiler?\b/i,
      /\bdevcontainer|docker|kubernetes\b/i,
      /\bvllm|llama\.cpp|tgi|ollama\b/i,
      /\bsdk|api|library|framework\b/i,
    ],
  },
  {
    key: "research",
    label: "RESEARCH",
    patterns: [
      /\barxiv\b/i,
      /\bpaper\b/i,
      /\bresearch(ers?)?\b/i,
      /\bbenchmark|eval(s|uation)?\b/i,
      /\bswe[-\s]?bench|aime|gpqa|mmlu|humaneval\b/i,
      /\binterpretab|alignment|circuit\b/i,
      /\bdeepmind|openai\s+research|anthropic\s+research\b/i,
      /\bscaling\s+law|emergent\b/i,
      /\bsynthetic\s+data\b/i,
    ],
  },
];

const TOPIC_BY_KEY = new Map(TOPICS.map((t) => [t.key, t]));

export function topicLabel(key: TopicKey): string {
  return TOPIC_BY_KEY.get(key)?.label ?? key.toUpperCase();
}

export function allTopics(): ReadonlyArray<{ key: TopicKey; label: string }> {
  return TOPICS.map(({ key, label }) => ({ key, label }));
}

/**
 * Parse `?topic=X` into a key, or null when missing / "all" / unknown.
 */
export function parseTopic(raw: string | null | undefined): TopicKey | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (t === "" || t === "all") return null;
  return TOPIC_BY_KEY.has(t as TopicKey) ? (t as TopicKey) : null;
}

/**
 * Test a single signal against a topic. Returns true when any of the
 * item's tags or its title matches one of the topic's patterns.
 */
export function matchesTopic(item: SignalItem, topic: TopicKey): boolean {
  const spec = TOPIC_BY_KEY.get(topic);
  if (!spec) return false;

  for (const tag of item.tags) {
    for (const pat of spec.patterns) {
      if (pat.test(tag)) return true;
    }
  }
  for (const pat of spec.patterns) {
    if (pat.test(item.title)) return true;
  }
  return false;
}
