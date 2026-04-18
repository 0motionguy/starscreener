// StarScreener — Curated AI Watchlist (P0.3)
//
// Drives hot-tier refresh. Each slug maps to a repo we want polled on the
// fastest cadence (hot tier → */15 in production via GH Actions cron,
// currently routed to warm until this file goes live — see PR #2 /
// commit 8771186 for the interim routing).
//
// Source: starscreener-inspection/WATCHLIST_SEED.md (122 entries across
// 10 tiers A-J, plus 6 flagged verification candidates not included here).
// Regenerate this file from WATCHLIST_SEED.md when the seed updates —
// don't edit by hand unless adding a single urgent entry.
//
// Membership check: normalizeSlug("owner/Repo") === normalizeSlug(repo.fullName).
// Comparison is case-insensitive to survive GitHub owner/repo rename cases.

const WATCHLIST_SLUGS: readonly string[] = [
  // Tier A — Agent frameworks & orchestration (49)
  "langchain-ai/langchain",
  "langchain-ai/langgraph",
  "langchain-ai/opengpts",
  "langchain-ai/chat-langchain",
  "crewAIInc/crewAI",
  "microsoft/autogen",
  "ag2ai/ag2",
  "Significant-Gravitas/AutoGPT",
  "yoheinakajima/babyagi",
  "reworkd/AgentGPT",
  "TransformerOptimus/SuperAGI",
  "All-Hands-AI/OpenHands",
  "All-Hands-AI/openhands-aci",
  "OpenInterpreter/open-interpreter",
  "assafelovic/gpt-researcher",
  "stanfordnlp/dspy",
  "huggingface/smolagents",
  "pydantic/pydantic-ai",
  "instructor-ai/instructor",
  "transitive-bullshit/agentic",
  "openai/openai-agents-python",
  "openai/swarm",
  "VRSEN/agency-swarm",
  "FoundationAgents/MetaGPT",
  "VoltAgent/voltagent",
  "mastra-ai/mastra",
  "agno-agi/agno",
  "camel-ai/camel",
  "microsoft/JARVIS",
  "langroid/langroid",
  "aiwaves-cn/agents",
  "kyegomez/swarms",
  "block/goose",
  "smol-ai/developer",
  "princeton-nlp/SWE-agent",
  "microsoft/TaskWeaver",
  "InternLM/lagent",
  "openbmb/agentverse",
  "modelscope/agentscope",
  "deepset-ai/haystack",
  "microsoft/semantic-kernel",
  "botpress/botpress",
  "e2b-dev/e2b",
  "dust-tt/dust",
  "MervinPraison/PraisonAI",
  "phidatahq/phidata",
  "strands-agents/sdk-python",
  "upsonic/upsonic",
  "pipecat-ai/pipecat",
  // Tier B — Agent memory & RAG (8)
  "mem0ai/mem0",
  "letta-ai/letta",
  "getzep/zep",
  "cpacker/MemGPT",
  "run-llama/llama_index",
  "microsoft/graphrag",
  "stanford-oval/storm",
  "Arize-ai/phoenix",
  // Tier C — MCP ecosystem (6)
  "modelcontextprotocol/servers",
  "modelcontextprotocol/python-sdk",
  "modelcontextprotocol/typescript-sdk",
  "modelcontextprotocol/inspector",
  "modelcontextprotocol/specification",
  "anthropics/claude-code",
  // Tier D — Claude / Anthropic ecosystem (5)
  "anthropics/anthropic-sdk-python",
  "anthropics/anthropic-sdk-typescript",
  "anthropics/courses",
  "anthropics/prompt-eng-interactive-tutorial",
  "anthropics/anthropic-cookbook",
  // Tier E — Coding agents & AI IDE (12)
  "cline/cline",
  "continuedev/continue",
  "sourcegraph/cody",
  "RooCodeInc/Roo-Code",
  "Aider-AI/aider",
  "Pythagora-io/gpt-pilot",
  "stitionai/devika",
  "OpenBMB/RepoAgent",
  "semanser/codel",
  "sst/opencode",
  "plandex-ai/plandex",
  "Doriandarko/claude-engineer",
  // Tier F — LLM inference, serving, fine-tuning (18)
  "ollama/ollama",
  "ollama/ollama-python",
  "ggerganov/llama.cpp",
  "ggerganov/whisper.cpp",
  "vllm-project/vllm",
  "sgl-project/sglang",
  "mlc-ai/mlc-llm",
  "lm-sys/FastChat",
  "guidance-ai/guidance",
  "outlines-dev/outlines",
  "unslothai/unsloth",
  "axolotl-ai-cloud/axolotl",
  "microsoft/DeepSpeed",
  "triton-lang/triton",
  "meta-llama/llama3",
  "facebookresearch/llama",
  "deepseek-ai/DeepSeek-V3",
  "openai/whisper",
  // Tier G — Foundation models & research (10)
  "pytorch/pytorch",
  "tensorflow/tensorflow",
  "huggingface/transformers",
  "karpathy/nanoGPT",
  "karpathy/llm.c",
  "tatsu-lab/stanford_alpaca",
  "mlfoundations/open_clip",
  "SakanaAI/AI-Scientist",
  "Technion-Kishony-lab/data-to-paper",
  "fetchai/uAgents",
  // Tier H — Chat UIs & LLM front-ends (7)
  "open-webui/open-webui",
  "lobehub/lobe-chat",
  "mckaywrigley/chatbot-ui",
  "danny-avila/LibreChat",
  "Mintplex-Labs/anything-llm",
  "AUTOMATIC1111/stable-diffusion-webui",
  "InvokeAI/InvokeAI",
  // Tier I — Image / multimodal (4)
  "comfyanonymous/ComfyUI",
  "xlang-ai/OpenAgents",
  "steel-dev/steel-browser",
  "ShengranHu/ADAS",
  // Tier J — Enterprise / conversational (3)
  "homanp/superagent",
  "hpcaitech/ColossalAI",
  "nilsherzig/LLocalSearch",
];

// Case-insensitive normalized set for O(1) membership.
const WATCHLIST_SET: Set<string> = new Set(
  WATCHLIST_SLUGS.map((s) => s.toLowerCase()),
);

/**
 * True if the given repo slug (owner/repo) is on the curated AI watchlist.
 * Case-insensitive to survive owner-rename and casing drift (e.g.,
 * All-Hands-AI/OpenHands ↔ all-hands-ai/openhands).
 */
export function isOnWatchlist(fullName: string): boolean {
  return WATCHLIST_SET.has(fullName.toLowerCase());
}

/**
 * Return the curated watchlist as a case-insensitive Set of slug strings.
 * Consumers should prefer isOnWatchlist() unless they need the full set for
 * batch operations.
 */
export function getWatchlistSet(): Set<string> {
  return WATCHLIST_SET;
}

/** Total curated-watchlist size. Used for monitoring / observability. */
export function getWatchlistSize(): number {
  return WATCHLIST_SLUGS.length;
}

/** The raw slug list in canonical casing. Exposed for seed-code merging. */
export function getWatchlistSlugs(): readonly string[] {
  return WATCHLIST_SLUGS;
}
