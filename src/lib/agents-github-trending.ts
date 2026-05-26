// Agent-runtime trending — filters the derived-repos corpus down to repos
// that look like AI agent runtimes / frameworks (OpenClaw, Hermes, Claude
// Code, Codex, CrewAI, LangGraph, AutoGen, etc.) rather than memory libs,
// trading bots, skills packs, or the agent-commerce / x402 payments stack.
//
// Selection rules (in order of precedence):
//   1. Whitelist hit — sourced from the canonical `AGENT_REPO_SET` in
//      `agent-repos.ts` (single source of truth shared with /tools/top-10
//      agent board and sidebar source counts).
//   2. Description / name regex hit — agent / agentic / autonomous / crew /
//      orchestrator / swarm etc., minus the EXCLUDE_RE blocklist below.
//   3. Sort: whitelisted repos first (by momentumScore desc), then regex
//      matches by momentumScore desc. Top `limit` returned. The page-level
//      `sortRepos` reranks via the TOP composite when ranker=top.
//
// This module reads from `getDerivedRepos()` — every row already carries the
// full Repo shape (stars, deltas, sparkline, mentions, momentumScore,
// crossSignalScore), so we don't re-map from raw OSSInsight rows.

import { AGENT_REPO_SET } from "@/lib/agent-repos";
import { getDerivedRepos } from "@/lib/derived-repos";
import type { Repo } from "@/lib/types";

// Canonical agent-runtime whitelist — single source of truth.
// Includes OpenClaw, Hermes, Claude Code, Codex, Superpowers, LangGraph,
// CrewAI, etc. Curated specifically to exclude memory DBs, trading bots,
// skills packs, awesome-lists, and tutorials.
const AGENT_WHITELIST: ReadonlySet<string> = AGENT_REPO_SET;

const AGENT_RE =
  /\b(agents?|agentic|autonomous|crew|orchestrator|swarm|multi[\s-]agents?|llm[\s-]agents?|ai[\s-]agents?|agent[\s-]framework|agent[\s-]runtime)\b/i;

// Repos that match the agent regex but aren't agent runtimes.
// Memory DBs, trading bots, vibe-trading, quant platforms, skills packs,
// curated lists, tutorials, datasets — operator-rejected on 2026-05-24
// for surfacing on /?cat=agents.
const EXCLUDE_RE =
  /\b(x402|stablecoin|defi|nft|wallet|airdrop|crypto[\s-]payment|onchain[\s-]payment|memor(y|ies)|trading|trader|vibe[\s-]?trading|quant|brain|skills?|awesome-|cookbook|tutorial|course|lessons|guide|roadmap|examples|cheatsheet|notebook|dataset|hello[\s-])\b|教程|实战|入门|从零/i;

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
