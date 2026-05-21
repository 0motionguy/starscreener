// category-adapters — map non-repo domain objects (Skills, MCP servers,
// Agents, LLMs/HF models) to the shared `Repo` shape so the same
// `TrendingTable` component can render every category surface.
//
// Mapping is best-effort and type-safe. Where a field doesn't exist in the
// source domain object, we default to an empty / zero value rather than
// fabricate plausible data. The primary metric per category is parked on
// `stars` so the existing rank logic in the table renders the right thing
// without forking the schema.
//
// Refresh strategy: the existing skills/mcp readers are async-only
// (`getSkillsSignalData`, `getMcpSignalData`) — they perform the
// data-store read themselves. We wrap them with a 30s rate-limit + in-
// flight dedupe and a small module-local cache so the sync getters below
// can return the latest known board without re-fetching on every call.
// HF + agent-commerce already follow the standard refresh-then-get
// pattern; we just delegate to those.

import {
  getSkillsSignalData,
  getMcpSignalData,
  type EcosystemBoard,
  type EcosystemLeaderboardItem,
} from "@/lib/ecosystem-leaderboards";
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
// Module-local cache for the async ecosystem reads. Mirrors the in-flight
// + rate-limit pattern used by refreshHfModelsFromStore et al.
// ---------------------------------------------------------------------------

const MIN_REFRESH_INTERVAL_MS = 30_000;

let skillsBoard: EcosystemBoard | null = null;
let skillsLastRefreshMs = 0;
let skillsInflight: Promise<void> | null = null;

let mcpBoard: EcosystemBoard | null = null;
let mcpLastRefreshMs = 0;
let mcpInflight: Promise<void> | null = null;

async function refreshSkillsBoard(): Promise<void> {
  if (skillsInflight) return skillsInflight;
  const sinceLast = Date.now() - skillsLastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && skillsLastRefreshMs > 0) return;
  skillsInflight = (async () => {
    try {
      const data = await getSkillsSignalData();
      skillsBoard = data.combined;
    } catch {
      // Never throw — keep last-known board.
    } finally {
      skillsLastRefreshMs = Date.now();
    }
  })().finally(() => {
    skillsInflight = null;
  });
  return skillsInflight;
}

async function refreshMcpBoard(): Promise<void> {
  if (mcpInflight) return mcpInflight;
  const sinceLast = Date.now() - mcpLastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && mcpLastRefreshMs > 0) return;
  mcpInflight = (async () => {
    try {
      const data = await getMcpSignalData();
      mcpBoard = data.board;
    } catch {
      // Never throw — keep last-known board.
    } finally {
      mcpLastRefreshMs = Date.now();
    }
  })().finally(() => {
    mcpInflight = null;
  });
  return mcpInflight;
}

// ---------------------------------------------------------------------------
// Public API — consumed by page.tsx
// ---------------------------------------------------------------------------

export async function refreshCategoryFromStore(category: CategoryId): Promise<void> {
  if (category === "skills") {
    await refreshSkillsBoard();
    return;
  }
  if (category === "mcp") {
    await refreshMcpBoard();
    return;
  }
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

// Mention overlay: every category surface gets the same cross-source rollup
// decoration that repo rows get. Lookups inside the decorator are keyed by
// `r.fullName` by default — each per-domain mapper sets `fullName` to the most
// repo-like slug it can resolve (linkedRepo where known, else owner/name from
// curated metadata, else the HF id for LLMs), so loaders that index by repo
// keys still fire when the underlying entity links back to a tracked repo.

export function getSkillsAsRepos(): Repo[] {
  if (!skillsBoard) return [];
  return decorateWithMentionsRollup(skillsBoard.items.map(skillToRepo));
}

export function getMcpAsRepos(): Repo[] {
  if (!mcpBoard) return [];
  return decorateWithMentionsRollup(mcpBoard.items.map(mcpToRepo));
}

export function getAgentsAsRepos(): Repo[] {
  // Operator decision 2026-05-21: agents tab is "ALL AGENTS repos like
  // Hermes, OpenClaw" — agent-runtime / framework repos sourced from the
  // derived-repos corpus, NOT the x402-payments agent-commerce stack.
  // The github-agents-trending filter keeps the curated whitelist + a
  // description regex; mention rollup decoration runs the same as
  // any other category surface.
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

function ghAvatar(owner: string): string {
  return owner ? `https://github.com/${owner}.png` : "";
}

function emptyMentions(): RepoMentionsRollup {
  // Fresh object per row so callers can't mutate the shared default.
  return {
    total24h: 0,
    total7d: 0,
    perSource: { ...EMPTY_MENTIONS.perSource },
  };
}

function skillToRepo(item: EcosystemLeaderboardItem): Repo {
  const { owner, name } = splitFullName(item.linkedRepo ?? item.id);
  const safeOwner = owner || item.author || "skill";
  const safeName = name || item.title || item.id;
  const fullName = item.linkedRepo ?? `${safeOwner}/${safeName}`;
  // Primary metric for skills: install count if known, otherwise hotness.
  const installs = item.installs7d ?? 0;
  const stars = installs > 0 ? installs : Math.round(item.hotness ?? 0);
  return {
    id: `skill-${item.id}`,
    fullName,
    name: safeName,
    owner: safeOwner,
    ownerAvatarUrl: ghAvatar(safeOwner),
    description: item.description ?? "",
    url: item.url,
    language: null,
    topics: item.tags ?? [],
    categoryId: "skills",
    stars,
    forks: item.forks ?? 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: item.lastPushedAt ?? item.lastRefreshedAt ?? EPOCH_ZERO,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: item.createdAt ?? EPOCH_ZERO,
    starsDelta24h: item.installsDelta1d ?? 0,
    starsDelta7d: item.installsDelta7d ?? 0,
    starsDelta30d: item.installsDelta30d ?? 0,
    forksDelta7d: item.forkVelocity7d ?? 0,
    contributorsDelta30d: 0,
    momentumScore: Math.round(item.hotness ?? 0),
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

function mcpToRepo(item: EcosystemLeaderboardItem): Repo {
  const { owner, name } = splitFullName(item.linkedRepo ?? item.id);
  const safeOwner = owner || item.author || "mcp";
  const safeName = name || item.title || item.id;
  const fullName = item.linkedRepo ?? `${safeOwner}/${safeName}`;
  // Primary metric for MCP: uptime percent (0-100), falling back to
  // downloads count or hotness.
  const uptimePct =
    typeof item.liveness?.uptime7d === "number"
      ? Math.round(item.liveness.uptime7d * 100)
      : null;
  const downloads = item.mcp?.downloadsCombined7d ?? null;
  const installs = item.mcp?.installs7d ?? null;
  const stars =
    uptimePct !== null
      ? uptimePct
      : downloads !== null
        ? downloads
        : installs !== null
          ? installs
          : Math.round(item.hotness ?? 0);
  return {
    id: `mcp-${item.id}`,
    fullName,
    name: safeName,
    owner: safeOwner,
    ownerAvatarUrl: ghAvatar(safeOwner),
    description: item.description ?? "",
    url: item.url,
    language: null,
    topics: item.tags ?? [],
    categoryId: "mcp",
    stars,
    forks: item.forks ?? 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: item.lastPushedAt ?? item.lastRefreshedAt ?? EPOCH_ZERO,
    lastReleaseAt: item.mcp?.lastReleaseAt ?? null,
    lastReleaseTag: null,
    createdAt: item.createdAt ?? EPOCH_ZERO,
    starsDelta24h: item.mcp?.installs24h ?? 0,
    starsDelta7d: item.mcp?.installs7d ?? 0,
    starsDelta30d: item.mcp?.installs30d ?? 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: Math.round(item.hotness ?? 0),
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

function llmToRepo(item: HfModelTrending): Repo {
  const { owner, name } = splitFullName(item.id);
  const safeOwner = owner || item.author || "huggingface";
  const safeName = name || item.id;
  return {
    id: `llm-${item.id}`,
    fullName: item.id,
    name: safeName,
    owner: safeOwner,
    // HF model orgs don't necessarily map 1:1 to GitHub orgs; the table
    // falls back to initials when this 404s. Use the HF avatar service.
    ownerAvatarUrl: `https://huggingface.co/${encodeURIComponent(safeOwner)}/avatar`,
    description: item.explanation ?? "",
    url: item.url,
    language: null,
    topics: item.tags ?? [],
    categoryId: "llms",
    stars: Math.max(0, item.downloads ?? 0),
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: item.lastModified ?? item.createdAt ?? EPOCH_ZERO,
    lastReleaseAt: item.lastModified ?? null,
    lastReleaseTag: null,
    createdAt: item.createdAt ?? EPOCH_ZERO,
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
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
