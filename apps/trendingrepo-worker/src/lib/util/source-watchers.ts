// Canonical topic discovery registry for non-Reddit social/dev-media sources.
// Mirrors scripts/_source-watchers.mjs.

export const SOURCE_DISCOVERY_VERSION = '2026-04-21';

export interface BlueskyQueryFamily {
  id: string;
  label: string;
  queries: string[];
}

export const BLUESKY_QUERY_FAMILIES: BlueskyQueryFamily[] = [
  {
    id: 'agents',
    label: 'AI agents',
    queries: ['lang:en "ai agent"', 'lang:en agentic', 'lang:en "multi agent"'],
  },
  {
    id: 'llms',
    label: 'LLMs',
    queries: ['lang:en llm', 'lang:en "local llm"'],
  },
  {
    id: 'coding-agents',
    label: 'Coding agents',
    queries: [
      'lang:en "claude code"',
      'lang:en codex',
      'lang:en cursor',
      'lang:en cline',
    ],
  },
  {
    id: 'mcp',
    label: 'MCP',
    queries: ['lang:en "mcp server"', 'lang:en "model context protocol"'],
  },
  {
    id: 'retrieval',
    label: 'RAG and retrieval',
    queries: ['lang:en rag'],
  },
  {
    id: 'workflow',
    label: 'Workflow and automation',
    queries: [
      'lang:en workflow',
      'lang:en automation',
      'lang:en cli',
      'lang:en devtools',
    ],
  },
  {
    id: 'context',
    label: 'Context, prompts, memory',
    queries: [
      'lang:en "context engineering"',
      'lang:en "prompt engineering"',
      'lang:en "agent memory"',
    ],
  },
  {
    id: 'skills',
    label: 'AI skills',
    queries: [
      'lang:en "claude skill"',
      'lang:en "claude skills"',
      'lang:en "ai skills"',
    ],
  },
  {
    id: 'open-source-ai',
    label: 'Open source AI',
    queries: ['lang:en "open source ai"'],
  },
];

export interface BlueskyTrendingQuery {
  familyId: string;
  familyLabel: string;
  query: string;
}

export const BLUESKY_TRENDING_QUERIES: BlueskyTrendingQuery[] =
  BLUESKY_QUERY_FAMILIES.flatMap((family) =>
    family.queries.map((query) => ({
      familyId: family.id,
      familyLabel: family.label,
      query,
    })),
  );

export const DEVTO_PRIORITY_TAGS: string[] = [
  'ai',
  'artificialintelligence',
  'agents',
  'agentic',
  'claudecode',
  'claude',
  'codex',
  'cursor',
  'llm',
  'llms',
  'mcp',
  'rag',
  'promptengineering',
  'workflow',
  'workflows',
  'automation',
  'cli',
  'tooling',
  'devtools',
  'langchain',
  'n8n',
  'opensource',
];

export interface DevtoDiscoverySlice {
  id: string;
  label: string;
  tag?: string;
  top?: number;
  state?: 'rising' | 'fresh';
}

export const DEVTO_DISCOVERY_SLICES: DevtoDiscoverySlice[] = [
  { id: 'global-top-7d', label: 'Global top (7d)', top: 7 },
  { id: 'global-rising', label: 'Global rising', state: 'rising' },
  { id: 'global-fresh', label: 'Global fresh', state: 'fresh' },
  ...DEVTO_PRIORITY_TAGS.map((tag) => ({
    id: `tag-${tag}-top-7d`,
    label: `#${tag} top (7d)`,
    tag,
    top: 7,
  })),
];

// Subreddit list mirrors scripts/_reddit-shared.mjs SUBREDDITS.
export const SUBREDDITS: string[] = [
  // Core: LLM-specific
  'ClaudeAI',
  'ChatGPT',
  'OpenAI',
  'LocalLLaMA',
  'GeminiAI',
  'DeepSeek',
  'Perplexity_AI',
  'MistralAI',
  'grok',
  // Core: Agent & automation
  'AI_Agents',
  'AgentsOfAI',
  'LLMDevs',
  'ClaudeCode',
  'aiagents',
  // Extended: General AI
  'ArtificialInteligence',
  'MachineLearning',
  'artificial',
  'singularity',
  'datascience',
  // Extended: Coding & tools
  'vibecoding',
  'cursor',
  'ChatGPTCoding',
  'ChatGPTPromptGenius',
  // Extended: Prompts & building
  'PromptEngineering',
  'AIToolTesting',
  'AIBuilders',
  'AIAssisted',
  // Extended: Learning & research
  'learnmachinelearning',
  'deeplearning',
  'LocalLLM',
  'GoogleGeminiAI',
  // Extended: Frameworks & automation
  'n8n',
  'automation',
  'LangChain',
  'generativeAI',
  'Rag',
  // Extended: Content & distribution
  'SEO',
  'WritingWithAI',
  'SaaS',
  'machinelearningnews',
  // Extended: Coding agents & tools
  'ollama',
  'LLM',
  'CLine',
  'windsurf',
  'nocode',
];
