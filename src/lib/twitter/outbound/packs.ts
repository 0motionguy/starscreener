// Themed 5-pack registry for the X content engine (CE-3).
//
// A pack = a hook line + a repo predicate + a ranker. Selection filters the
// already-derived corpus (topics/tags/categoryId/description — zero extra
// IO), guards spam + ledger cooldown, ranks with the same scoring the site
// boards use (TOP composite, or the discovery ranker for fresh finds), and
// returns exactly `size` repos — or [] so the caller falls back to a
// trending single rather than posting a thin pack.
//
// v1 is repo-trending content only (owner directive). Funding / LLM-model /
// model-release packs are registered but `enabled: false` until their data
// surfaces are wired.

import type { Repo } from "@/lib/types";
import { computeTopComposite } from "@/lib/scoring/top-composite";
import { computeDiscoveryScore } from "@/lib/scoring/discovery";
import { isSpamRepo } from "@/lib/ranking/repo-quality";

export interface PackSpec {
  id: string;
  /** Hook line for the tweet (composer upper-cases + ASCII-folds). */
  hook: string;
  enabled: boolean;
  /** Repos on the card (text lists at most 5 regardless). */
  size: number;
  window: "24h" | "7d";
  match: (repo: Repo) => boolean;
  ranker?: "composite" | "discovery";
}

/** Case-insensitive haystack over the fields that carry topicality. */
function hay(repo: Repo): string {
  return [
    repo.fullName,
    repo.description ?? "",
    ...(repo.topics ?? []),
    ...(repo.tags ?? []),
    repo.categoryId ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function anyOf(re: RegExp): (repo: Repo) => boolean {
  return (repo) => re.test(hay(repo));
}

export const PACKS: PackSpec[] = [
  {
    id: "ai-agents",
    hook: "TOP 5 AI AGENT REPOS RIGHT NOW",
    enabled: true,
    size: 5,
    window: "24h",
    match: anyOf(/\bagents?\b|agentic|autonomous|multi-agent|\bcrew\b|swarm/),
  },
  {
    id: "rag",
    hook: "TOP 5 RAG REPOS THIS WEEK",
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/\brag\b|retrieval[- ]augmented|vector (db|database|search|store)|embeddings?\b/),
  },
  {
    id: "mcp-tools",
    hook: "TOP 5 MCP REPOS RIGHT NOW",
    enabled: true,
    size: 5,
    window: "24h",
    match: anyOf(/\bmcp\b|model context protocol|claude (code|skills?)\b/),
  },
  {
    id: "self-hosted",
    hook: "TOP 5 SELF-HOSTED REPOS THIS WEEK",
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/self-?hosted|selfhost|homelab|docker[- ]compose/),
  },
  {
    id: "devtools",
    hook: "TOP 5 DEV TOOL REPOS THIS WEEK",
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/\bcli\b|dev ?tools?\b|developer tool|terminal\b|\beditor\b|debugger|linter|formatter/),
  },
  {
    id: "fresh-finds",
    hook: "5 GITHUB REPOS BLOWING UP BEFORE THE CROWD",
    enabled: true,
    size: 5,
    window: "24h",
    match: () => true,
    ranker: "discovery",
  },
  {
    id: "weekly-top10",
    hook: "TOP 10 GITHUB REPOS THIS WEEK",
    enabled: true,
    size: 10,
    window: "7d",
    match: () => true,
  },
  // --- deferred until their data surfaces ship (owner: repo content first) --
  {
    id: "funding",
    hook: "TOP 5 FUNDED OSS REPOS THIS WEEK",
    enabled: false,
    size: 5,
    window: "7d",
    match: (repo) => Boolean(repo.funding),
  },
  {
    id: "llm-models",
    hook: "TOP 5 NEW LLM MODEL REPOS",
    enabled: false,
    size: 5,
    window: "7d",
    match: anyOf(/\bllm\b|language model|\bweights\b|inference/),
  },
];

export function getPack(id: string): PackSpec | undefined {
  return PACKS.find((p) => p.id === id && p.enabled);
}

/**
 * Pick pack members: predicate -> spam + cooldown guard -> rank -> top N.
 * Returns [] when fewer than `size` qualify (caller falls back to a single),
 * or when the discovery ranker finds nothing genuinely eligible.
 */
export function selectPackRepos(
  repos: Repo[],
  pack: PackSpec,
  cooldownFullNames: Set<string>,
): Repo[] {
  const pool = repos.filter(
    (r) => !isSpamRepo(r) && !cooldownFullNames.has(r.fullName) && pack.match(r),
  );
  if (pool.length < pack.size) return [];

  const scores =
    pack.ranker === "discovery"
      ? computeDiscoveryScore(pool)
      : computeTopComposite(pool, pack.window);
  const ranked = [...pool].sort(
    (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0),
  );
  const picked = ranked.slice(0, pack.size);

  // Discovery scores 0 = ineligible; an all-zero pick means "no real gems
  // today" — skip the pack instead of shipping filler.
  if (picked.every((r) => (scores.get(r.id) ?? 0) <= 0)) return [];
  return picked;
}
