// filterReposBySources - URL-driven source filter for cockpit-style pages.
//
// Bridges the 30-slug filter rail UI (used by /market-signals, /tools and
// any future cockpit) with the 8-value SocialPlatform mention spine on
// derived Repo records. Slugs that map cleanly to SocialPlatform filter
// by `repo.mentions.perSource[platform].count24h > 0`; the rest fall back
// to topic / tag / collection / fullName / description substring matching
// so AI-lab and data-source filters stay useful even though the underlying
// Repo type has no per-lab mention bucket.
//
// Contract:
// - Empty `selected` set OR a set containing every known slug behaves as
//   "all sources on" — returns the input array unchanged. Callers always
//   pass the raw URL-derived set; this helper handles the "no filter"
//   short-circuit so pages don't have to.
// - Unknown slugs are ignored silently. The filter rail enforces the
//   slug whitelist; the helper trusts that contract and never throws.

import type { Repo, SocialPlatform } from "@/lib/types";

/**
 * Map from filter-rail slug → SocialPlatform key on `repo.mentions.perSource`.
 * Only slugs with a direct mention-bucket analog are listed here.
 */
const SLUG_TO_PLATFORM: Partial<Record<string, SocialPlatform>> = {
  github: "github",
  hn: "hackernews",
  reddit: "reddit",
  x: "twitter",
  bsky: "bluesky",
  ph: "producthunt",
  devto: "devto",
  lobsters: "lobsters",
};

/**
 * Slugs with no SocialPlatform analog. Filtered via topic / tag membership
 * so the user still sees a useful reaction when toggling "OpenAI" or "npm".
 *
 * The needles match against the repo's lowercased haystack
 * (fullName + owner + name + description + topics + tags + collectionNames).
 * Keep needles short and high-precision — "ai" alone would match too much.
 */
const SLUG_TOPIC_NEEDLES: Partial<Record<string, string[]>> = {
  // Data feeds
  arxiv: ["arxiv", "paper", "research", "survey"],
  npm: ["npm", "node", "javascript", "typescript"],
  "hf-models": ["huggingface", "hf-models", "transformers", "model"],
  "hf-datasets": ["huggingface", "dataset", "datasets"],
  "hf-spaces": ["huggingface", "space", "spaces", "gradio"],
  skills: ["skill", "agent-skill", "claude-skill"],
  mcp: ["mcp", "model-context-protocol"],
  "agent-repos": ["agent", "autonomous", "agentic"],
  funding: ["funding", "yc", "ycombinator", "seed", "series-a"],
  revenue: ["mrr", "saas", "revenue", "stripe"],
  pypi: ["pypi", "python", "pydantic", "langgraph", "llamaindex"],
  openrouter: ["openrouter", "llm", "router"],
  // AI labs (publishing-side; matches repos that name-drop these in topics/desc)
  openai: ["openai", "gpt", "chatgpt"],
  anthropic: ["anthropic", "claude"],
  google: ["google", "gemini", "deepmind"],
  meta: ["meta", "llama", "facebook"],
  mistral: ["mistral", "mixtral"],
  cohere: ["cohere"],
  deepseek: ["deepseek"],
  xai: ["xai", "grok"],
  perplexity: ["perplexity"],
  qwen: ["qwen", "alibaba"],
};

/**
 * Full slug whitelist — kept in sync with SourceFilterRail's groups.
 * Used to detect the "all sources selected" no-op case so the helper
 * doesn't filter when every toggle is on.
 */
const ALL_SLUGS: ReadonlySet<string> = new Set([
  ...Object.keys(SLUG_TO_PLATFORM),
  ...Object.keys(SLUG_TOPIC_NEEDLES),
]);

function repoMatchesTopic(repo: Repo, needles: string[]): boolean {
  if (needles.length === 0) return false;
  const haystack = [
    repo.fullName,
    repo.owner,
    repo.name,
    repo.description ?? "",
    ...(repo.topics ?? []),
    ...(repo.tags ?? []),
    ...(repo.collectionNames ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function repoMatchesPlatform(repo: Repo, platform: SocialPlatform): boolean {
  const bucket = repo.mentions?.perSource?.[platform];
  return (bucket?.count24h ?? 0) > 0;
}

/**
 * Return only repos that have signal in at least one of `selected` sources.
 *
 * If `selected` is empty OR contains every known slug, return `repos`
 * unchanged (no filter). This lets the caller pass the raw URL-derived
 * set without first checking emptiness.
 */
export function filterReposBySources(
  repos: Repo[],
  selected: ReadonlySet<string>,
): Repo[] {
  if (selected.size === 0) return repos;

  // "All on" — every known slug is selected. The rail's "Reset sources" link
  // produces an empty set, but a user could also tick every box manually;
  // treat both as no-filter so the cockpit doesn't hide every repo.
  let allOn = true;
  for (const slug of ALL_SLUGS) {
    if (!selected.has(slug)) {
      allOn = false;
      break;
    }
  }
  if (allOn) return repos;

  // Partition selection into platform filters vs topic-needle filters once,
  // then filter the repo list in a single pass.
  const platforms: SocialPlatform[] = [];
  const topicGroups: string[][] = [];
  for (const slug of selected) {
    const platform = SLUG_TO_PLATFORM[slug];
    if (platform) {
      platforms.push(platform);
      continue;
    }
    const needles = SLUG_TOPIC_NEEDLES[slug];
    if (needles && needles.length > 0) topicGroups.push(needles);
  }

  if (platforms.length === 0 && topicGroups.length === 0) return repos;

  return repos.filter((repo) => {
    for (const platform of platforms) {
      if (repoMatchesPlatform(repo, platform)) return true;
    }
    for (const needles of topicGroups) {
      if (repoMatchesTopic(repo, needles)) return true;
    }
    return false;
  });
}

export { SLUG_TO_PLATFORM, SLUG_TOPIC_NEEDLES };
