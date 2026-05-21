// Agent-runtime trending — filters the derived-repos corpus down to repos
// that look like AI agent runtimes / frameworks (AutoGen, CrewAI, Open
// Interpreter, OpenDevin, LangGraph, Hermes, AutoGPT, etc.) rather than the
// agent-commerce / x402 payments stack.
//
// Selection rules (in order of precedence):
//   1. Whitelist hit  — canonical agent-runtime repos always included if
//      they're present in the corpus.
//   2. Description regex hit — `\b(agent|agentic|autonomous|crew|orchestrator
//      |multi-agent)\b` (case-insensitive). Excludes payments / wallet / x402
//      / defi keywords to keep the agent-commerce stack out.
//   3. Sort: whitelisted repos first (in original momentum order), then
//      regex-matched repos by `momentumScore` desc. Top `limit` returned.
//
// This module reads from `getDerivedRepos()` — every row already carries the
// full Repo shape (stars, deltas, sparkline, mentions, momentumScore,
// crossSignalScore), so we don't re-map from raw OSSInsight rows.

import { getDerivedRepos } from "@/lib/derived-repos";
import type { Repo } from "@/lib/types";

// Canonical agent-runtime repos. Lowercase. Keep this list short and
// curated — it's the override layer for "include even if their description
// doesn't say 'agent' literally."
const AGENT_WHITELIST: ReadonlySet<string> = new Set(
  [
    "microsoft/autogen",
    "joaomdmoura/crewai",
    "openinterpreter/open-interpreter",
    "opendevin/opendevin",
    "all-hands-ai/openhands",
    "langchain-ai/langgraph",
    "langchain-ai/langchain",
    "significant-gravitas/autogpt",
    "geekan/metagpt",
    "vinetwigs/hermesai",
    "nousresearch/hermes-agent",
    "frdel/agent-zero",
    "eosphoros-ai/db-gpt",
    "smol-ai/developer",
    "stitionai/devika",
    "princeton-nlp/swe-agent",
    "huggingface/smolagents",
    "block/goose",
    "browser-use/browser-use",
    "skyvern-ai/skyvern",
    "tencentqqgylab/appagent",
    "modelscope/agentscope",
    "phidatahq/phidata",
    "agno-agi/agno",
    "humanlayer/humanlayer",
    "blacklotuslabs/blacklotus",
    "letta-ai/letta",
    "transformeroptimus/superagi",
    "kyegomez/swarms",
    "memodb-io/memobase",
    "promptfoo/promptfoo",
    "lablab-ai/openclaw",
    "openclaw/openclaw",
    "aymeric-ai/awesome-agents",
    "tauricresearch/tradingagents",
  ].map((s) => s.toLowerCase()),
);

const AGENT_RE =
  /\b(agents?|agentic|autonomous|crew|orchestrator|swarm|multi[\s-]agents?|llm[\s-]agents?|ai[\s-]agents?|agent[\s-]framework|agent[\s-]runtime)\b/i;

const EXCLUDE_RE =
  /\b(x402|stablecoin|defi|nft|wallet|airdrop|crypto[\s-]payment|onchain[\s-]payment|skills?|awesome-|cookbook|tutorial|course|lessons|guide|roadmap|examples|cheatsheet|notebook)\b/i;

interface RankedAgent {
  repo: Repo;
  whitelisted: boolean;
}

export function getGithubAgentsTrending(limit = 100): Repo[] {
  const all = getDerivedRepos();
  const ranked: RankedAgent[] = [];

  for (const repo of all) {
    const key = repo.fullName.toLowerCase();
    const desc = repo.description || "";
    const name = repo.name || "";
    const whitelisted = AGENT_WHITELIST.has(key);
    // Test exclude against BOTH description and name — a repo called
    // `awesome-claude-skills` is a curated list, not an agent runtime, even
    // if its description says "agentic AI tooling for skills".
    if (!whitelisted && (EXCLUDE_RE.test(desc) || EXCLUDE_RE.test(name))) {
      continue;
    }
    if (!whitelisted && !AGENT_RE.test(desc) && !AGENT_RE.test(name)) {
      continue;
    }
    ranked.push({ repo, whitelisted });
  }

  // Whitelisted repos come first (preserving their corpus momentum order);
  // regex-only matches follow by momentumScore desc. Within the whitelist
  // bucket we also fall back to momentumScore so a matched-but-quiet repo
  // doesn't outrank a matched-and-hot one.
  ranked.sort((a, b) => {
    if (a.whitelisted !== b.whitelisted) return a.whitelisted ? -1 : 1;
    return (b.repo.momentumScore ?? 0) - (a.repo.momentumScore ?? 0);
  });

  return ranked.slice(0, limit).map((r) => r.repo);
}

export function getGithubAgentsTrendingCount(): number {
  return getGithubAgentsTrending(10_000).length;
}
