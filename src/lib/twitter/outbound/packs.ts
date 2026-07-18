// Themed pack registry for the X content engine (CE-3).
//
// A pack = a hook line + a repo predicate + a ranker. Selection filters the
// already-derived corpus (topics/tags/categoryId/description — zero extra
// IO), guards spam + ledger cooldown, ranks with the same scoring the site
// boards use (TOP composite, or the discovery ranker for fresh finds), and
// returns up to `size` repos — or [] when fewer than `minSize` qualify, so
// the caller falls back to a trending single rather than posting a thin pack.
// Hooks are functions of the actual member count, so headline numbers always
// match what the card renders.
//
// v1+ is repo-trending content (owner directive). The llm-models pack runs
// off the same derived corpus (no extra data surface; its predicate also
// drives the hf_models card archetype, CE-5). Funding stays `enabled: false`
// until its data surface ships.

import type { Repo } from "@/lib/types";
import { computeTopComposite } from "@/lib/scoring/top-composite";
import { computeDiscoveryScore } from "@/lib/scoring/discovery";
import { isSpamRepo } from "@/lib/ranking/repo-quality";

export interface PackSpec {
  id: string;
  /** Hook line for the tweet, given the actual member count (composer upper-cases + ASCII-folds). */
  hook: (n: number) => string;
  enabled: boolean;
  /** Repos on the card (text lists at most 5 regardless). */
  size: number;
  /** Publish floor: post with fewer than `size` members down to this count (default: `size`). */
  minSize?: number;
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

/**
 * LLM / model-weights predicate — exported because the hf_models OG card
 * archetype (CE-5) shares it, so pack membership and card styling never
 * disagree about what counts as a model repo.
 */
export function isLlmModelRepo(repo: Repo): boolean {
  return /\bllm\b|language model|\bweights\b|inference/.test(hay(repo));
}

export const PACKS: PackSpec[] = [
  {
    id: "ai-agents",
    hook: (n) => `TOP ${n} AI AGENT REPOS RIGHT NOW`,
    enabled: true,
    size: 10,
    minSize: 5,
    window: "24h",
    match: anyOf(/\bagents?\b|agentic|autonomous|multi-agent|\bcrew\b|swarm/),
  },
  {
    id: "rag",
    hook: (n) => `TOP ${n} RAG REPOS THIS WEEK`,
    enabled: true,
    size: 10,
    minSize: 5,
    window: "7d",
    match: anyOf(/\brag\b|retrieval[- ]augmented|vector (db|database|search|store)|embeddings?\b/),
  },
  {
    id: "mcp-tools",
    hook: (n) => `TOP ${n} MCP REPOS RIGHT NOW`,
    enabled: true,
    size: 10,
    minSize: 5,
    window: "24h",
    match: anyOf(/\bmcp\b|model context protocol|claude (code|skills?)\b/),
  },
  {
    id: "self-hosted",
    hook: (n) => `TOP ${n} SELF-HOSTED REPOS THIS WEEK`,
    enabled: true,
    size: 10,
    minSize: 5,
    window: "7d",
    match: anyOf(/self-?hosted|selfhost|homelab|docker[- ]compose/),
  },
  {
    id: "devtools",
    hook: (n) => `TOP ${n} DEV TOOL REPOS THIS WEEK`,
    enabled: true,
    size: 10,
    minSize: 5,
    window: "7d",
    match: anyOf(/\bcli\b|dev ?tools?\b|developer tool|terminal\b|\beditor\b|debugger|linter|formatter/),
  },
  // --- five-slot calendar packs (ecosystem rotation; hay() includes
  // categoryId, so a classified repo rides without keyword copy) ---
  {
    id: "local-llm",
    hook: (n) => `TOP ${n} LOCAL LLM REPOS THIS WEEK`,
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/local[- ]llm|ollama|llama\.cpp|on-device (ai|llm)|local inference/),
  },
  {
    id: "browser-automation",
    hook: (n) => `TOP ${n} BROWSER AUTOMATION REPOS THIS WEEK`,
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/browser[- ]automation|playwright|puppeteer|selenium|web scraping|headless browser/),
  },
  {
    id: "security",
    hook: (n) => `TOP ${n} SECURITY REPOS THIS WEEK`,
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/\bsecurity\b|appsec|vulnerability|pentest|malware/),
  },
  {
    id: "infrastructure",
    hook: (n) => `TOP ${n} INFRASTRUCTURE REPOS THIS WEEK`,
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/infrastructure|devops|kubernetes|terraform|self-?hosted|homelab/),
  },
  {
    id: "data",
    hook: (n) => `TOP ${n} DATA AND DATABASE REPOS THIS WEEK`,
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/database|data[- ]engineering|analytics|vector (db|database)|etl\b|olap/),
  },
  {
    id: "web-mobile",
    hook: (n) => `TOP ${n} WEB AND MOBILE REPOS THIS WEEK`,
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/web[- ]framework|\bmobile\b|react native|flutter|swiftui|android|ios\b/),
  },
  {
    id: "web3",
    hook: (n) => `TOP ${n} WEB3 REPOS THIS WEEK`,
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/web3|blockchain|solana|ethereum|smart contract|defi\b/),
  },
  {
    id: "rust",
    hook: (n) => `TOP ${n} RUST REPOS THIS WEEK`,
    enabled: true,
    size: 5,
    window: "7d",
    match: (repo) => repo.language?.toLowerCase() === "rust" || anyOf(/rust[- ]ecosystem/)(repo),
  },
  {
    id: "design-engineering",
    hook: (n) => `TOP ${n} DESIGN ENGINEERING REPOS THIS WEEK`,
    enabled: true,
    size: 5,
    window: "7d",
    match: anyOf(/design[- ]engineering|design system|component library|ui kit|storybook/),
  },
  {
    id: "fresh-finds",
    hook: (n) => `${n} GITHUB REPOS BLOWING UP BEFORE THE CROWD`,
    enabled: true,
    size: 10,
    minSize: 5,
    window: "24h",
    match: () => true,
    ranker: "discovery",
  },
  {
    id: "weekly-top10",
    hook: (n) => `TOP ${n} GITHUB REPOS THIS WEEK`,
    enabled: true,
    size: 10,
    minSize: 5,
    window: "7d",
    match: () => true,
  },
  {
    id: "llm-models",
    hook: (n) => `TOP ${n} NEW LLM MODEL REPOS`,
    enabled: true,
    size: 5,
    minSize: 3,
    window: "7d",
    match: isLlmModelRepo,
  },
  // --- deferred until its data surface ships (owner: repo content first) ---
  {
    id: "funding",
    hook: (n) => `TOP ${n} FUNDED OSS REPOS THIS WEEK`,
    enabled: false,
    size: 5,
    window: "7d",
    match: (repo) => Boolean(repo.funding),
  },
];

export function getPack(id: string): PackSpec | undefined {
  return PACKS.find((p) => p.id === id && p.enabled);
}

/**
 * Pick pack members: predicate -> spam + cooldown guard -> rank -> top `size`.
 * Publishes with as few as `minSize` members (default: `size`) — the hook and
 * card adapt to the actual count. Returns [] when fewer than `minSize`
 * qualify (caller falls back to a single), or when the ranker finds nothing
 * genuinely eligible.
 */
export function selectPackRepos(
  repos: Repo[],
  pack: PackSpec,
  cooldownFullNames: Set<string>,
): Repo[] {
  const minSize = pack.minSize ?? pack.size;
  const seenFullNames = new Set<string>();
  const pool = repos.filter((r) => {
    const fullName = r.fullName.toLowerCase();
    // Cooldown + dedupe are case-insensitive; repos with zero movement,
    // mentions and buzz never ride a pack (static filler reads like a bot).
    const eligible =
      !isSpamRepo(r) &&
      !cooldownFullNames.has(fullName) &&
      ((r.starsDelta7d ?? 0) > 0 ||
        (r.starsDelta24h ?? 0) > 0 ||
        (r.mentionCount24h ?? 0) > 0 ||
        (r.socialBuzzScore ?? 0) > 0) &&
      pack.match(r);
    if (!eligible || seenFullNames.has(fullName)) return false;
    seenFullNames.add(fullName);
    return true;
  });
  if (pool.length < minSize) return [];

  const scores =
    pack.ranker === "discovery"
      ? computeDiscoveryScore(pool)
      : computeTopComposite(pool, pack.window);
  const ranked = [...pool].sort(
    (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0),
  );

  // Discovery scores 0 = ineligible — drop them before slicing so a wide
  // `size` never pads positions 6-10 with filler.
  const eligible =
    pack.ranker === "discovery"
      ? ranked.filter((r) => (scores.get(r.id) ?? 0) > 0)
      : ranked;
  if (eligible.length < minSize) return [];
  const picked = eligible.slice(0, pack.size);

  // An all-zero pick means "no real movement today" — skip the pack instead
  // of shipping filler.
  if (picked.every((r) => (scores.get(r.id) ?? 0) <= 0)) return [];
  return picked;
}
