// StarScreener — AI-focus tag rules.
//
// Tags are flat, multi-label, and intersect with categories. A repo in the
// `ai-agents` category can simultaneously carry `claude-code` + `agent-memory`
// tags. Tags narrow the screener onto the AI-focus universe (Claude Code,
// agent frameworks, memory/skills/plugins, swarm orchestration, local LLM
// inference) without fracturing the existing category taxonomy.
//
// Matching is case-insensitive on topics, keywords, owner prefixes. A repo
// gets a tag if ANY of the three matchers fire. No weighting — the tag is
// either present or absent. Rules are deliberately BROAD so real GitHub
// topics (which vary wildly) still fire.

export interface TagRule {
  tagId: string;
  /** Human-facing label for the chip. */
  label: string;
  /** Short blurb for the chip tooltip. */
  description: string;
  /** Exact topic matches (lowercase). */
  topics: string[];
  /** Substring matches on description + name + fullName (lowercase). */
  keywords: string[];
  /** Owner prefix matches (exact owner name, lowercase). */
  ownerPrefixes: string[];
}

export const TAG_RULES: TagRule[] = [
  {
    tagId: "claude-code",
    label: "Claude Code",
    description: "Anthropic Claude, Claude Code, agent tooling on Claude",
    topics: [
      "claude",
      "claude-code",
      "claude-cli",
      "claude-api",
      "anthropic",
      "anthropic-cli",
      "anthropic-claude",
    ],
    keywords: [
      "claude code",
      "claude cli",
      "anthropic cli",
      "anthropic claude",
      "claude agent",
      "claude plugin",
      "claude skill",
      "claude mcp",
    ],
    ownerPrefixes: ["anthropics", "anthropic"],
  },
  {
    tagId: "agent-memory",
    label: "Agent Memory",
    description: "Memory layers, second brain, long-term context for agents",
    topics: [
      "agent-memory",
      "long-term-memory",
      "memory",
      "memgpt",
      "mem0",
      "letta",
      "zep",
      "second-brain",
      "rag",
      "vector-memory",
    ],
    keywords: [
      "agent memory",
      "long-term memory",
      "persistent memory",
      "second brain",
      "memory store",
      "memory layer",
      "memory system",
      "llm memory",
      "conversational memory",
    ],
    ownerPrefixes: ["mem0ai", "letta-ai"],
  },
  {
    tagId: "agent-skills",
    label: "Skills",
    description: "Skill systems, tool use, function calling, plugin skills",
    topics: [
      "skills",
      "anthropic-skills",
      "agent-skills",
      "skill-library",
      "skill-registry",
      "tool-use",
      "function-calling",
    ],
    keywords: [
      "agent skill",
      "skill library",
      "skill registry",
      "skill system",
      "tool use",
      "function calling",
      "tool calling",
    ],
    ownerPrefixes: [],
  },
  {
    tagId: "mcp",
    label: "MCP",
    description: "Model Context Protocol servers and clients",
    topics: [
      "mcp",
      "model-context-protocol",
      "mcp-server",
      "mcp-client",
      "mcp-tools",
    ],
    keywords: [
      "mcp server",
      "mcp client",
      "model context protocol",
      "model-context-protocol",
    ],
    ownerPrefixes: ["modelcontextprotocol"],
  },
  {
    tagId: "ai-agents",
    label: "Agents",
    description: "Autonomous agents, agent frameworks, multi-step reasoning",
    topics: [
      "ai-agents",
      "agents",
      "agent",
      "autonomous-agent",
      "autonomous-agents",
      "ai-agent",
      "llm-agent",
      "llm-agents",
      "autogpt",
      "babyagi",
      "agentic",
      "agentops",
      "agent-framework",
      "autonomousagents",
      "aiagentframework",
    ],
    keywords: [
      "ai agent",
      "ai agents",
      "autonomous agent",
      "llm agent",
      "agent framework",
      "agentic",
      "agent-based",
    ],
    ownerPrefixes: ["langchain-ai", "crewaiinc", "langgraph-ai"],
  },
  {
    tagId: "swarm-orchestration",
    label: "Swarm",
    description: "Multi-agent coordination, swarm orchestration, agent teams",
    topics: [
      "swarm",
      "multi-agent",
      "multiagent",
      "agent-swarm",
      "autogen",
      "crewai",
      "agent-team",
      "agent-orchestration",
    ],
    keywords: [
      "swarm",
      "multi-agent",
      "multi agent",
      "agent swarm",
      "agent team",
      "agent orchestration",
      "role-playing",
      "collaborative intelligence",
    ],
    ownerPrefixes: ["crewaiinc"],
  },
  {
    tagId: "local-llm",
    label: "Local LLM",
    description: "Run LLMs locally (Ollama, llama.cpp, MLX, GGUF, etc.)",
    topics: [
      "local-llm",
      "ollama",
      "llama-cpp",
      "llama.cpp",
      "gguf",
      "mlx",
      "local-inference",
      "on-device",
      "edge-ai",
    ],
    keywords: [
      "run locally",
      "local inference",
      "on-device",
      "local llm",
      "llama.cpp",
      "ollama",
    ],
    ownerPrefixes: ["ollama", "ggerganov", "ggml-org", "mlc-ai", "ml-explore"],
  },
  {
    tagId: "llm-infra",
    label: "LLM Infra",
    description: "Inference servers, fine-tuning, RLHF, LLM training infra",
    topics: [
      "llm",
      "llms",
      "llm-inference",
      "llm-training",
      "llm-serving",
      "fine-tuning",
      "finetuning",
      "rlhf",
      "vllm",
      "transformers",
      "huggingface",
    ],
    keywords: [
      "inference server",
      "model serving",
      "fine-tuning",
      "fine tune",
      "llm serving",
    ],
    ownerPrefixes: [
      "vllm-project",
      "huggingface",
      "unslothai",
      "axolotl-ai-cloud",
    ],
  },
];

export const TAG_IDS = TAG_RULES.map((r) => r.tagId);

export function getTagRule(tagId: string): TagRule | undefined {
  return TAG_RULES.find((r) => r.tagId === tagId);
}
