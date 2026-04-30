// TrendingRepo — Tier List preset templates
//
// Templates are pre-loaded item pools the user ranks — never pre-ranked.
// Each entry below is a curated repoId list grouped by theme. The UI lets
// the user pick one; the editor appends those repos to the unranked pool
// (skipping any already present).
//
// All repos here should resolve via `getDerivedRepoByFullName` so the editor
// + OG renderer can attach avatars automatically. If a repo is added that
// isn't in the derived set, the monogram fallback kicks in.

export interface TierListTemplate {
  slug: string;
  name: string;
  description: string;
  /** Repo full names ("owner/name"), order preserved. */
  repos: string[];
}

export const TIER_LIST_TEMPLATES: ReadonlyArray<TierListTemplate> = [
  {
    slug: "ai-agent-frameworks",
    name: "AI Agent Frameworks",
    description: "Rank the agent stacks shipping in 2026.",
    repos: [
      "langchain-ai/langchain",
      "microsoft/autogen",
      "crewAIInc/crewAI",
      "BerriAI/litellm",
      "simonw/llm",
      "huggingface/smolagents",
      "openai/swarm",
      "Significant-Gravitas/AutoGPT",
      "stanfordnlp/dspy",
      "joaomdmoura/crewAI",
      "langfuse/langfuse",
      "deepset-ai/haystack",
    ],
  },
  {
    slug: "code-editor-agents",
    name: "Code-Editor Agents",
    description: "Coding copilots and CLI agents.",
    repos: [
      "anthropics/claude-code",
      "openai/codex",
      "cursor-ai/cursor",
      "continuedev/continue",
      "cline/cline",
      "Aider-AI/aider",
      "RooVetGit/Roo-Cline",
      "block/goose",
      "sourcegraph/cody",
      "kubernetes/kubectl-ai",
      "All-Hands-AI/OpenHands",
      "google-gemini/gemini-cli",
    ],
  },
  {
    slug: "rag-stacks",
    name: "RAG Stacks",
    description: "Vector stores + retrieval pipelines.",
    repos: [
      "chroma-core/chroma",
      "weaviate/weaviate",
      "qdrant/qdrant",
      "pgvector/pgvector",
      "lancedb/lancedb",
      "milvus-io/milvus",
      "facebookresearch/faiss",
      "run-llama/llama_index",
      "neo4j/neo4j",
      "asg017/sqlite-vec",
      "elastic/elasticsearch",
      "typesense/typesense",
    ],
  },
  {
    slug: "local-inference",
    name: "Local Inference Tools",
    description: "Run models on your own hardware.",
    repos: [
      "ollama/ollama",
      "ggerganov/llama.cpp",
      "vllm-project/vllm",
      "lm-sys/FastChat",
      "Mozilla-Ocho/llamafile",
      "huggingface/text-generation-inference",
      "ggerganov/whisper.cpp",
      "LostRuins/koboldcpp",
      "oobabooga/text-generation-webui",
      "exo-explore/exo",
      "mlc-ai/mlc-llm",
      "Lightning-AI/litgpt",
    ],
  },
];

export function getTemplate(slug: string): TierListTemplate | null {
  return TIER_LIST_TEMPLATES.find((t) => t.slug === slug) ?? null;
}
