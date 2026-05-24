// category-adapters — map non-repo domain objects (Agents, LLMs/HF models)
// to the shared `Repo` shape so the same `TrendingTable` component can render
// every category surface.
//
// 2026-05-24 refocus: Skills + MCP categories removed (operator: GitHub repos
// are the main seller). LLMs still backed by HuggingFace here; the AA-leader
// board replacement lands in the W4 work that follows the HF strip.

import {
  refreshHfModelsFromStore,
  getHfModelsTrending,
  type HfModelTrending,
} from "@/lib/huggingface";
import { getGithubAgentsTrending } from "@/lib/agents-github-trending";
import { decorateWithMentionsRollup } from "@/lib/derived-repos/decorators/mentions-rollup";
import type { CategoryId } from "@/components/trending/TrendingHubHero";
import type { Repo, RepoMentionsRollup } from "@/lib/types";

// ---------------------------------------------------------------------------
// Public API — consumed by page.tsx
// ---------------------------------------------------------------------------

export async function refreshCategoryFromStore(category: CategoryId): Promise<void> {
  if (category === "agents") {
    // No-op: agents now derive from getDerivedRepos() which is refreshed by
    // refreshTrendingFromStore() at the top of the page handler.
    return;
  }
  if (category === "llms") {
    await refreshHfModelsFromStore();
    return;
  }
  // category === "repos" — handled by the existing trending readers.
}

export function getAgentsAsRepos(): Repo[] {
  // Operator decision 2026-05-21: agents tab is "ALL AGENTS repos like
  // Hermes, OpenClaw" — agent-runtime / framework repos sourced from the
  // derived-repos corpus, NOT the x402-payments agent-commerce stack.
  return decorateWithMentionsRollup(getGithubAgentsTrending(100));
}

export function getLlmsAsRepos(): Repo[] {
  return decorateWithMentionsRollup(getHfModelsTrending(100).map(llmToRepo));
}

// ---------------------------------------------------------------------------
// Per-domain mappers
// ---------------------------------------------------------------------------

const EMPTY_MENTIONS: RepoMentionsRollup = {
  total24h: 0,
  total7d: 0,
  perSource: {
    twitter: { count24h: 0, count7d: 0 },
    reddit: { count24h: 0, count7d: 0 },
    hackernews: { count24h: 0, count7d: 0 },
    github: { count24h: 0, count7d: 0 },
    devto: { count24h: 0, count7d: 0 },
    bluesky: { count24h: 0, count7d: 0 },
    producthunt: { count24h: 0, count7d: 0 },
    lobsters: { count24h: 0, count7d: 0 },
    npm: { count24h: 0, count7d: 0 },
    huggingface: { count24h: 0, count7d: 0 },
    arxiv: { count24h: 0, count7d: 0 },
    funding: { count24h: 0, count7d: 0 },
    tavily: { count24h: 0, count7d: 0 },
  },
};

const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

function splitFullName(input: string | null | undefined): { owner: string; name: string } {
  if (!input) return { owner: "", name: "" };
  const trimmed = input.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0) return { owner: "", name: trimmed };
  return { owner: trimmed.slice(0, slash), name: trimmed.slice(slash + 1) };
}

function emptyMentions(): RepoMentionsRollup {
  return {
    total24h: 0,
    total7d: 0,
    perSource: { ...EMPTY_MENTIONS.perSource },
  };
}

function formatRelativeDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const days = Math.round((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function llmToRepo(item: HfModelTrending): Repo {
  const { owner, name } = splitFullName(item.id);
  const safeOwner = owner || item.author || "huggingface";
  const safeName = name || item.id;
  return {
    id: `llm-${item.id}`,
    fullName: item.id,
    name: safeName,
    owner: safeOwner,
    ownerAvatarUrl: `https://huggingface.co/${encodeURIComponent(safeOwner)}/avatar`,
    description: item.explanation ?? "",
    url: item.url,
    language: null,
    topics: item.tags ?? [],
    categoryId: "llms",
    stars: Math.max(0, item.downloads ?? 0),
    popularityLabel: "Downloads",
    categoryColumns: [
      { label: "Task", value: item.pipelineTag || "—" },
      {
        label: "Likes",
        value:
          typeof item.likes === "number" && item.likes > 0
            ? Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
                item.likes,
              )
            : "—",
      },
      { label: "Updated", value: formatRelativeDate(item.lastModified) ?? "—" },
    ],
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: item.lastModified ?? item.createdAt ?? EPOCH_ZERO,
    lastReleaseAt: item.lastModified ?? null,
    lastReleaseTag: null,
    createdAt: item.createdAt ?? EPOCH_ZERO,
    starsDelta24h: item.downloadsDelta24h ?? 0,
    starsDelta7d: item.downloadsDelta7d ?? 0,
    starsDelta30d: item.downloadsDelta30d ?? 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: Math.round(item.momentum ?? 0),
    movementStatus: "stable",
    rank: item.rank ?? 0,
    categoryRank: item.rank ?? 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    mentions: emptyMentions(),
    channelsFiring: 0,
    crossSignalScore: 0,
    tags: item.tags ?? [],
  };
}
