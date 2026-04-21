// Canonical topic discovery registry for non-Reddit social/dev-media sources.
//
// Purpose:
//   - keep Bluesky query families and DEV discovery slices in one place
//   - make the watched surface explicit and reviewable
//   - mirror the same "curated channels" discipline we already apply to
//     Reddit subreddits
//
// Notes from current platform behavior:
//   - Bluesky is best treated as search/feed/list/custom-feed territory, not
//     a subreddit-style channel product. We therefore track query families.
//   - DEV is tag-first and its public API supports popularity-ranked
//     discovery plus `state=fresh|rising`. We therefore track tag/state
//     slices instead of one generic feed.

export const SOURCE_DISCOVERY_VERSION = "2026-04-21";

export const BLUESKY_QUERY_FAMILIES = [
  {
    id: "agents",
    label: "AI agents",
    queries: ['lang:en "ai agent"', "lang:en agentic", 'lang:en "multi agent"'],
  },
  {
    id: "llms",
    label: "LLMs",
    queries: ["lang:en llm", 'lang:en "local llm"'],
  },
  {
    id: "coding-agents",
    label: "Coding agents",
    queries: [
      'lang:en "claude code"',
      "lang:en codex",
      "lang:en cursor",
      "lang:en cline",
    ],
  },
  {
    id: "mcp",
    label: "MCP",
    queries: ['lang:en "mcp server"', 'lang:en "model context protocol"'],
  },
  {
    id: "retrieval",
    label: "RAG and retrieval",
    queries: ["lang:en rag"],
  },
  {
    id: "workflow",
    label: "Workflow and automation",
    queries: [
      "lang:en workflow",
      "lang:en automation",
      "lang:en cli",
      "lang:en devtools",
    ],
  },
  {
    id: "context",
    label: "Context, prompts, memory",
    queries: [
      'lang:en "context engineering"',
      'lang:en "prompt engineering"',
      'lang:en "agent memory"',
    ],
  },
  {
    id: "skills",
    label: "AI skills",
    queries: [
      'lang:en "claude skill"',
      'lang:en "claude skills"',
      'lang:en "ai skills"',
    ],
  },
  {
    id: "open-source-ai",
    label: "Open source AI",
    queries: ['lang:en "open source ai"'],
  },
];

export const BLUESKY_TRENDING_QUERIES = BLUESKY_QUERY_FAMILIES.flatMap(
  (family) =>
    family.queries.map((query) => ({
      familyId: family.id,
      familyLabel: family.label,
      query,
    })),
);

export const DEVTO_PRIORITY_TAGS = [
  "ai",
  "artificialintelligence",
  "agents",
  "agentic",
  "claudecode",
  "claude",
  "codex",
  "cursor",
  "llm",
  "llms",
  "mcp",
  "rag",
  "promptengineering",
  "workflow",
  "workflows",
  "automation",
  "cli",
  "tooling",
  "devtools",
  "langchain",
  "n8n",
  "opensource",
];

export const DEVTO_DISCOVERY_SLICES = [
  {
    id: "global-top-7d",
    label: "Global top (7d)",
    top: 7,
  },
  {
    id: "global-rising",
    label: "Global rising",
    state: "rising",
  },
  {
    id: "global-fresh",
    label: "Global fresh",
    state: "fresh",
  },
  ...DEVTO_PRIORITY_TAGS.map((tag) => ({
    id: `tag-${tag}-top-7d`,
    label: `#${tag} top (7d)`,
    tag,
    top: 7,
  })),
];
