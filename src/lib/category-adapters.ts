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
  // Operator directive 2026-05-23: "they don't have stars, rank by installs".
  // claude-skills (GitHub-topic source) carries only `stars` — it is NOT an
  // install signal. Filter those items out so the skills surface ranks on
  // real install / activation counts from skills.sh / lobehub / smithery /
  // skillsmp. Detection: items whose source label resolves to "GitHub topics"
  // / "GitHub" / claude-skills, OR whose only metric is `stars`.
  const installItems = skillsBoard.items
    .filter(isInstallShapedSkill)
    .map(skillToRepo)
    // Re-sort by absolute install number desc so the highest install count
    // surfaces first (not the upstream merger's stars-tainted rank).
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
  return decorateWithMentionsRollup(installItems);
}

function isInstallShapedSkill(item: EcosystemLeaderboardItem): boolean {
  // The popularityLabel set upstream tells us what unit `popularity` is in.
  // Reject "GitHub stars" rows (claude-skills) — those are not installs.
  // Accept everything else: "Installs" (skills.sh, lobehub), "Activations"
  // (smithery). Items without a popularityLabel are likely skillsmp
  // (trending_score) — keep them as D-tier but downrank.
  const label = (item.popularityLabel || "").toLowerCase();
  if (label.includes("github") || label.includes("star")) return false;
  // Also reject items whose sourceLabel is clearly the GitHub-topic feed
  const source = (item.sourceLabel || "").toLowerCase();
  if (source.includes("github topic")) return false;
  return true;
}

export function getMcpAsRepos(): Repo[] {
  if (!mcpBoard) return [];
  // Operator directive 2026-05-23: "MCP not by lifetime connection".
  // Don't filter (would empty the page until snapshot/visitors data flows).
  // Instead: tiered composite score that downweights lifetime-only items.
  //   visitors_4w (PulseMCP/Glama active visitors)  → weight 1.0  [B-tier]
  //   downloads_7d                                   → weight 0.7  [B-tier]
  //   use_count (Smithery lifetime, operator-rejected) → weight 0.4 [C-tier]
  //   hotness composite                              → weight 0.2  [D-tier]
  // Items with multiple signals get a weighted SUM with a 0.6 saturating
  // coefficient (per the approved InstallSignal plan). Corroboration across
  // sources boosts ranking; a lone strong signal can't dominate a multi-
  // source moderate signal.
  const scored = mcpBoard.items.map((item) => ({
    item,
    score: scoreMcpItem(item),
  }));
  scored.sort((a, b) => b.score - a.score);
  return decorateWithMentionsRollup(scored.map((s) => mcpToRepo(s.item)));
}

function scoreMcpItem(item: EcosystemLeaderboardItem): number {
  const v4w = typeof item.mcp?.visitors4w === "number" ? item.mcp.visitors4w : 0;
  const d7d = typeof item.mcp?.downloadsCombined7d === "number" ? item.mcp.downloadsCombined7d : 0;
  const uc = typeof item.mcp?.useCount === "number" ? item.mcp.useCount : 0;
  const hot = typeof item.hotness === "number" ? item.hotness : 0;
  // log10-scale each signal so a 2M lifetime doesn't drown a 50K active-visitor item.
  const sV = v4w > 0 ? Math.log10(1 + v4w) * 1.0 : 0;
  const sD = d7d > 0 ? Math.log10(1 + d7d) * 0.7 : 0;
  const sU = uc > 0 ? Math.log10(1 + uc) * 0.4 : 0;
  const sH = hot > 0 ? Math.log10(1 + hot) * 0.2 : 0;
  // Weighted SUM × 0.6 saturating coefficient (per InstallSignal plan).
  // Single signal: ~0.6x its log-scaled grade weight.
  // Two corroborating signals: ~1.2x — rewards multi-source presence.
  return 0.6 * (sV + sD + sU + sH);
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

function skillToRepo(item: EcosystemLeaderboardItem): Repo {
  const { owner, name } = splitFullName(item.linkedRepo ?? item.id);
  const safeOwner = owner || item.author || "skill";
  const safeName = name || item.title || item.id;
  const fullName = item.linkedRepo ?? `${safeOwner}/${safeName}`;
  // Source-native popularity picked upstream by coerceSkillsShItem /
  // coerceGithubSkillItem (installs / activations / GitHub stars depending
  // on which signal the row's source ships). Falls back to hotness only
  // when the upstream rows lack any popularity signal.
  const stars = item.popularity ?? Math.round(item.hotness ?? 0);
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
    popularityLabel: item.popularityLabel || undefined,
    categoryColumns: [
      { label: "Source", value: item.sourceLabel || "—" },
      { label: "Author", value: item.author || safeOwner || "—" },
      { label: "Updated", value: formatRelativeDate(item.lastPushedAt) ?? "—" },
    ],
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
  // Many MCP server ids are UUID-shaped (e.g. ethanhenrickson/a6d27e72-aa71-...)
  // because upstream registries key on internal UUIDs. Prefer linkedRepo
  // (real GitHub slug) → item.title (human name like "math-mcp") → id-parsed
  // (UUID fallback only when nothing better exists).
  const idLooksLikeUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(item.id);
  const parsedFromTitle = item.title ? splitFullName(item.title) : { owner: "", name: "" };
  const parsedFromId = splitFullName(item.id);
  const { owner: linkedOwner, name: linkedName } = splitFullName(item.linkedRepo ?? "");
  const owner = linkedOwner || parsedFromId.owner || item.author || parsedFromTitle.owner;
  const name = linkedName || (idLooksLikeUuid ? (item.title || parsedFromId.name) : (parsedFromId.name || item.title));
  const safeOwner = owner || "mcp";
  const safeName = name || item.title || item.id;
  const fullName = item.linkedRepo ?? `${safeOwner}/${safeName}`;
  // Operator directive 2026-05-23: "MCP not by lifetime connection".
  // Prefer 4-week active visitors (pulsemcp / glama) over lifetime
  // use_count. Falls back through: visitors_4w (active) → downloads_7d
  // (recent) → use_count (lifetime, operator-rejected but kept as
  // last-resort signal so items with no velocity data still rank) →
  // hotness composite.
  const visitors4w = item.mcp?.visitors4w ?? null;
  const downloads7d = item.mcp?.downloadsCombined7d ?? null;
  const useCount = item.mcp?.useCount ?? null;
  const stars =
    visitors4w ?? downloads7d ?? useCount ?? Math.round(item.hotness ?? 0);
  // Honest label per which signal actually drove `stars`
  const popularityLabel =
    visitors4w !== null
      ? "Active · 4w"
      : downloads7d !== null
        ? "Downloads · 7d"
        : useCount !== null
          ? "Use count"
          : "Score";
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
    popularityLabel,
    categoryColumns: [
      {
        // Primary registry source — first entry in item.mcp.sources
        // (smithery / pulsemcp / glama / official) so the card's source
        // attribution pill shows the actual registry brand color.
        label: "Source",
        value: item.mcp?.sources?.[0] ?? "MCP registry",
      },
      {
        label: "Sources",
        value: item.crossSourceCount > 0 ? `${item.crossSourceCount}× registry` : "—",
      },
      {
        label: "Uptime",
        value:
          typeof item.liveness?.uptime7d === "number"
            ? `${Math.round(item.liveness.uptime7d * 100)}%`
            : "—",
      },
      {
        label: "Tools",
        value:
          typeof item.mcp?.toolCount === "number" && item.mcp.toolCount > 0
            ? item.mcp.toolCount
            : "—",
      },
      {
        label: "Released",
        value: formatRelativeDate(item.mcp?.lastReleaseAt) ?? "—",
      },
    ],
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
    // Downloads deltas populated by the hf-downloads-snapshot reader when
    // the slot keys are present (24h on day 2, 7d on day 8, 30d on day 31).
    // The 0 default keeps tiebreaker semantics on /cat=llms — sort falls
    // through to absolute downloads when deltas are unavailable.
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
// touch 1779537737
