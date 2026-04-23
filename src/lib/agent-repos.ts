import type { Repo } from "./types";

// Seeded from GitHub searches for `openclaw`, `agent framework`, and the
// `ai-agent` topic page, then intersected with the repos we already track.
// Scope: agent runtimes, frameworks, orchestrators, and OpenClaw-like
// systems. Skills packs, tutorials, awesome-lists, and plugins stay in the
// general repo index, not this dedicated board.
export const AGENT_REPO_FULL_NAMES = [
  "openclaw/openclaw",
  "NousResearch/hermes-agent",
  "anthropics/claude-code",
  "openai/codex",
  "obra/superpowers",
  "anomalyco/opencode",
  "karpathy/autoresearch",
  "bytedance/deer-flow",
  "paperclipai/paperclip",
  "code-yeongyu/oh-my-openagent",
  "TauricResearch/TradingAgents",
  "crewAIInc/crewAI",
  "HKUDS/nanobot",
  "badlogic/pi-mono",
  "wshobson/agents",
  "ruvnet/ruflo",
  "Yeachan-Heo/oh-my-claudecode",
  "AstrBotDevs/AstrBot",
  "zeroclaw-labs/zeroclaw",
  "langchain-ai/langgraph",
  "openai/openai-agents-python",
  "agentscope-ai/agentscope",
  "QwenLM/qwen-code",
  "langchain-ai/deepagents",
  "coleam00/Archon",
  "multica-ai/multica",
  "snarktank/ralph",
  "RightNow-AI/openfang",
  "jackwener/OpenCLI",
  "microsoft/agent-framework",
  "google/adk-go",
  "NVIDIA/OpenShell",
  "sipeed/picoclaw",
  "qwibitai/nanoclaw",
  "NVIDIA/NemoClaw",
  "nearai/ironclaw",
  "nullclaw/nullclaw",
  "memovai/mimiclaw",
  "moltis-org/moltis",
  "unitedbyai/droidclaw",
  "qhkm/zeptoclaw",
  "brendanhogan/hermitclaw",
  "princezuda/safeclaw",
  "yogesharc/babyclaw",
  "tnm/zclaw",
] as const;

export const AGENT_REPO_TARGET_COUNT = AGENT_REPO_FULL_NAMES.length;

export const AGENT_REPO_SET = new Set(
  AGENT_REPO_FULL_NAMES.map((fullName) => fullName.toLowerCase()),
);

export function isAgentRepoFullName(fullName: string): boolean {
  return AGENT_REPO_SET.has(fullName.trim().toLowerCase());
}

export function selectAgentRepos(repos: Repo[]): Repo[] {
  return repos
    .filter((repo) => AGENT_REPO_SET.has(repo.fullName.toLowerCase()))
    .slice()
    .sort((a, b) => b.stars - a.stars);
}
