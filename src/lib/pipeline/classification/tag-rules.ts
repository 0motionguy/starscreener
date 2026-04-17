// StarScreener — AI-focus tag rules.
//
// Tags are flat, multi-label, and intersect with categories. A repo in the
// `ai-agents` category can simultaneously carry `claude-code`, `agent-memory`
// tags. Tags narrow the screener onto the AI-focus universe (Claude Code,
// agent memory / skills / plugins, swarm orchestration) without fracturing
// the existing 10-category taxonomy.
//
// Matching is case-insensitive on topics, keywords, owner prefixes. A repo
// gets a tag if ANY of the three matchers fire. No weighting — the tag is
// either present or absent.
//
// Vocabulary rationale:
//   - 5 tags total. Densest useful set that fits in a chip bar without
//     overwhelming the existing FilterBar hierarchy.
//   - `claude-code`: Anthropic CLI + derived agent tooling.
//   - `agent-memory`: persistent memory stores / second-brain tooling.
//   - `agent-skills`: skill systems, skill marketplaces, Anthropic skills.
//   - `agent-plugins`: plugin frameworks for agents (MCP-adjacent).
//   - `swarm-orchestration`: multi-agent coordination frameworks.

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
    description: "Anthropic CLI and derived agent tooling",
    topics: ["claude-code", "anthropic-cli", "claude-cli"],
    keywords: ["claude code", "anthropic cli", "claude cli"],
    ownerPrefixes: ["anthropics"],
  },
  {
    tagId: "agent-memory",
    label: "Agent Memory",
    description: "Persistent memory stores and second-brain systems for agents",
    topics: [
      "agent-memory",
      "long-term-memory",
      "memgpt",
      "mem0",
      "second-brain",
    ],
    keywords: [
      "agent memory",
      "long-term memory",
      "persistent memory",
      "second brain",
      "memory store",
      "memory layer",
    ],
    ownerPrefixes: [],
  },
  {
    tagId: "agent-skills",
    label: "Agent Skills",
    description: "Skill systems, skill registries, and skill libraries",
    topics: ["agent-skills", "anthropic-skills", "skill-registry"],
    keywords: ["agent skills", "skill library", "skill registry"],
    ownerPrefixes: [],
  },
  {
    tagId: "agent-plugins",
    label: "Agent Plugins",
    description: "Plugin frameworks for agents (MCP-adjacent)",
    topics: ["agent-plugin", "agent-plugins", "mcp-plugin"],
    keywords: ["agent plugin", "agent plugins", "plugin framework"],
    ownerPrefixes: [],
  },
  {
    tagId: "swarm-orchestration",
    label: "Swarm",
    description: "Multi-agent coordination, swarm orchestration, agent teams",
    topics: [
      "swarm",
      "multi-agent",
      "agent-swarm",
      "autogen",
      "crewai",
    ],
    keywords: [
      "swarm",
      "multi-agent",
      "agent swarm",
      "agent team",
      "agent orchestration",
    ],
    ownerPrefixes: ["crewAIInc", "microsoft/autogen"],
  },
];

export const TAG_IDS = TAG_RULES.map((r) => r.tagId);

export function getTagRule(tagId: string): TagRule | undefined {
  return TAG_RULES.find((r) => r.tagId === tagId);
}
