// Shared MCP ranking for /mcp, the homepage MCP panel, and /api/mcp/trending.
//
// The order is built from data the MCP pipeline already publishes:
// source-provided velocity windows first, linked repo velocity fallback second,
// then published source order, source-native ranks, the MCP domain scorer,
// and momentum
// fallbacks. We do not manufacture trend from repo age or raw absolute
// popularity.

import type { EcosystemLeaderboardItem } from "@/lib/ecosystem-leaderboards";
import { getRepoMetadata, type RepoMetadata } from "@/lib/repo-metadata";
import type { Repo } from "@/lib/types";

export function lookupKeyForMcp(
  item: EcosystemLeaderboardItem,
): string | null {
  if (item.linkedRepo) return item.linkedRepo.toLowerCase();
  if (typeof item.url !== "string") return null;
  const m = item.url.match(/github\.com\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return null;
  return `${m[1]}/${m[2].replace(/\.git$/i, "")}`.toLowerCase();
}

export type McpTrendSource =
  | "registry-velocity"
  | "linked-repo-velocity"
  | "domain-scorer"
  | "momentum"
  | "smithery-rank"
  | "source-rank"
  | "none";

export interface RankedMcpEntry {
  item: EcosystemLeaderboardItem;
  linked: Repo | undefined;
  meta: RepoMetadata | null;
  hasFillableData: boolean;
  hasChartData: boolean;
  hasDisplayData: boolean;
  dataTier: number;
  trendRank: number;
  trendSource: McpTrendSource;
  trendLabel: string;
  velocityRank: number;
}

export interface McpUsageMetric {
  value: number;
  label: string;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finitePositive(
  value: number | null | undefined,
  minExclusive = 0,
): boolean {
  const n = finiteNumber(value);
  return n !== null && n > minExclusive;
}

function firstPositive(
  candidates: Array<[number | null | undefined, string, number?]>,
): McpUsageMetric | null {
  for (const [value, label, minExclusive = 0] of candidates) {
    if (finitePositive(value, minExclusive)) {
      return { value: Number(value), label };
    }
  }
  return null;
}

export function mcpUsageMetric(
  item: EcosystemLeaderboardItem,
): McpUsageMetric | null {
  const npmDownloads = item.mcp?.npmDownloads7d ?? 0;
  const pypiDownloads = item.mcp?.pypiDownloads7d ?? 0;
  const splitDownloads =
    npmDownloads > 0 || pypiDownloads > 0 ? npmDownloads + pypiDownloads : null;

  return firstPositive([
    [item.mcp?.useCount, "connections"],
    [item.mcp?.visitors4w, "4w visitors"],
    [item.mcp?.downloadsCombined7d, "7d downloads"],
    [splitDownloads, "7d downloads"],
    [item.mcp?.npmDependents, "npm dependents"],
    [item.mcp?.installsTotal, "installs", 1],
    [item.mcp?.starsTotal, "registry stars"],
  ]);
}

function mcpRegistryVelocity(item: EcosystemLeaderboardItem): number {
  const d24 = item.mcp?.installs24h ?? item.installsDelta1d ?? 0;
  const d7 = item.mcp?.installs7d ?? item.installsDelta7d ?? 0;
  const d30 = item.mcp?.installs30d ?? item.installsDelta30d ?? 0;
  return Math.max(0, d24) * 5 + Math.max(0, d7) + Math.max(0, d30) * 0.2;
}

function linkedRepoVelocity(linked: Repo | undefined): number {
  if (!linked) return 0;
  return (
    Math.max(0, linked.starsDelta24h ?? 0) * 5 +
    Math.max(0, linked.starsDelta7d ?? 0) +
    Math.max(0, linked.starsDelta30d ?? 0) * 0.2
  );
}

function smitheryRankScore(item: EcosystemLeaderboardItem): number {
  const rank = finiteNumber(item.mcp?.smitheryRank);
  const total = finiteNumber(item.mcp?.smitheryTotal);
  if (rank === null || total === null || total <= 0) return 0;
  return Math.max(0, (1 - rank / total) * 100);
}

function sourceRankScore(item: EcosystemLeaderboardItem): number {
  const rank = finiteNumber(item.rank);
  if (rank === null || rank <= 0) return 0;
  return Math.max(0, 100 - Math.log2(rank + 1) * 10);
}

function trendDetails(
  item: EcosystemLeaderboardItem,
  linked: Repo | undefined,
): Pick<
  RankedMcpEntry,
  "trendRank" | "trendSource" | "trendLabel" | "velocityRank"
> {
  const registryVelocity = mcpRegistryVelocity(item);
  if (registryVelocity > 0) {
    const trendRank = Math.max(151, registryVelocity);
    return {
      trendRank,
      trendSource: "registry-velocity",
      trendLabel:
        "Registry velocity is the primary trend signal: installs_24h x5 + installs_7d + installs_30d x0.2.",
      velocityRank: trendRank,
    };
  }

  const repoVelocity = linkedRepoVelocity(linked);
  if (repoVelocity > 0) {
    const trendRank = Math.max(101, repoVelocity);
    return {
      trendRank,
      trendSource: "linked-repo-velocity",
      trendLabel:
        "Linked GitHub repo velocity is the fallback trend signal: stars_24h x5 + stars_7d + stars_30d x0.2.",
      velocityRank: trendRank,
    };
  }

  const smithery = smitheryRankScore(item);
  if (smithery > 0) {
    return {
      trendRank: smithery,
      trendSource: "smithery-rank",
      trendLabel: "Smithery source rank inverse.",
      velocityRank: 0,
    };
  }

  const source = sourceRankScore(item);
  if (source > 0) {
    return {
      trendRank: source,
      trendSource: "source-rank",
      trendLabel: "Published source order fallback.",
      velocityRank: 0,
    };
  }

  const hotness = finiteNumber(item.hotness);
  if (hotness !== null && hotness > 0) {
    return {
      trendRank: hotness,
      trendSource: "domain-scorer",
      trendLabel:
        "MCP domain scorer: downloads, installs/stars fallback, uptime, tools, Smithery rank, dependents, source count, latency, release recency.",
      velocityRank: 0,
    };
  }

  const momentum = finiteNumber(item.signalScore);
  if (momentum !== null && momentum > 0) {
    return {
      trendRank: momentum,
      trendSource: "momentum",
      trendLabel: "Cross-domain momentum percentile from the MCP scorer.",
      velocityRank: 0,
    };
  }

  return {
    trendRank: 0,
    trendSource: "none",
    trendLabel: "No source trend signal published yet.",
    velocityRank: 0,
  };
}

export function mcpTrendRank(
  item: EcosystemLeaderboardItem,
  linked: Repo | undefined,
): number {
  return trendDetails(item, linked).trendRank;
}

function hasNonZeroMcpDelta(item: EcosystemLeaderboardItem): boolean {
  return Boolean(
    (item.installsDelta1d ?? 0) !== 0 ||
      (item.installsDelta7d ?? 0) !== 0 ||
      (item.installsDelta30d ?? 0) !== 0 ||
      (item.mcp?.installs24h ?? 0) !== 0 ||
      (item.mcp?.installs7d ?? 0) !== 0 ||
      (item.mcp?.installs30d ?? 0) !== 0,
  );
}

function hasRealRepoDelta(linked: Repo | undefined): boolean {
  return Boolean(
    linked &&
      ((linked.starsDelta24h ?? 0) !== 0 ||
        (linked.starsDelta7d ?? 0) !== 0 ||
        (linked.starsDelta30d ?? 0) !== 0),
  );
}

function mcpDataTier(
  item: EcosystemLeaderboardItem,
  linked: Repo | undefined,
  meta: RepoMetadata | null,
): number {
  const hasWindowVelocity = hasNonZeroMcpDelta(item) || hasRealRepoDelta(linked);
  const hasSourceEngagement = Boolean(
    finitePositive(item.mcp?.useCount) ||
      finitePositive(item.mcp?.visitors4w) ||
      finitePositive(item.mcp?.downloadsCombined7d) ||
      finitePositive(item.mcp?.npmDownloads7d) ||
      finitePositive(item.mcp?.pypiDownloads7d) ||
      finitePositive(item.mcp?.npmDependents),
  );
  const hasSourceQuality = Boolean(
    finiteNumber(item.mcp?.uptime7d) !== null ||
      finitePositive(item.mcp?.toolCount) ||
      finiteNumber(item.mcp?.p50LatencyMs) !== null ||
      finiteNumber(item.mcp?.smitheryRank) !== null,
  );
  if (hasWindowVelocity || hasSourceEngagement || hasSourceQuality) return 3;

  const hasAbsoluteSourceData = Boolean(
    finitePositive(item.mcp?.installsTotal, 1) ||
      finitePositive(item.mcp?.starsTotal) ||
      finitePositive(item.popularity, 1),
  );
  const hasRepoData = Boolean(
    (linked && linked.stars > 0) ||
      (meta && meta.stars > 0) ||
      item.mcp?.lastReleaseAt ||
      linked?.lastCommitAt ||
      meta?.pushedAt ||
      meta?.updatedAt,
  );
  const hasRealSparkline = Boolean(
    linked?.sparklineData && linked.sparklineData.length > 1,
  );
  if (hasAbsoluteSourceData || hasRepoData || hasRealSparkline) return 2;

  const hasWeakPresence = Boolean(
    (item.crossSourceCount ?? 1) >= 2 ||
      (item.signalScore ?? 0) > 0 ||
      (item.hotness ?? 0) > 0 ||
      item.verified ||
      finiteNumber(item.rank) !== null,
  );
  return hasWeakPresence ? 1 : 0;
}

function sourceRankSort(item: EcosystemLeaderboardItem): number {
  const smithery = finiteNumber(item.mcp?.smitheryRank);
  if (smithery !== null && smithery > 0) return smithery;
  const rank = finiteNumber(item.rank);
  return rank !== null && rank > 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function sortNumberDesc(
  a: number | null | undefined,
  b: number | null | undefined,
) {
  return (b ?? 0) - (a ?? 0);
}

function rankPriority(entry: RankedMcpEntry): number {
  if (entry.trendSource === "registry-velocity") return 6;
  if (entry.trendSource === "linked-repo-velocity") return 5;
  if (entry.trendSource === "domain-scorer") return 4;
  if (entry.dataTier >= 2) return 3;
  if (entry.trendSource === "momentum") return 2;
  if (
    entry.trendSource === "smithery-rank" ||
    entry.trendSource === "source-rank"
  ) {
    return 1;
  }
  return 0;
}

export function rankMcpItems(
  items: EcosystemLeaderboardItem[],
  repoByFullName: Map<string, Repo>,
): RankedMcpEntry[] {
  const enriched: RankedMcpEntry[] = items.map((item) => {
    const lookup = lookupKeyForMcp(item);
    const linked = lookup ? repoByFullName.get(lookup) : undefined;
    const metaFullName = item.linkedRepo ?? lookup ?? null;
    const meta = metaFullName ? getRepoMetadata(metaFullName) : null;
    const dataTier = mcpDataTier(item, linked, meta);
    const hasRealSparkline = Boolean(
      linked?.sparklineData && linked.sparklineData.length > 1,
    );
    const hasDeltaSparklineFallback = Boolean(
      mcpUsageMetric(item) && hasNonZeroMcpDelta(item),
    );
    const details = trendDetails(item, linked);

    return {
      item,
      linked,
      meta,
      hasFillableData: dataTier >= 2,
      hasChartData: hasRealSparkline || hasDeltaSparklineFallback,
      hasDisplayData: dataTier > 0,
      dataTier,
      ...details,
    };
  });

  return enriched
    .filter((e) => e.hasDisplayData)
    .sort((a, b) => {
      const priorityDelta = rankPriority(b) - rankPriority(a);
      if (priorityDelta !== 0) return priorityDelta;

      if (a.trendRank !== b.trendRank) {
        return b.trendRank - a.trendRank;
      }

      if (a.dataTier !== b.dataTier) return b.dataTier - a.dataTier;

      const momentumDelta = sortNumberDesc(a.item.signalScore, b.item.signalScore);
      if (momentumDelta !== 0) return momentumDelta;

      const usageDelta = sortNumberDesc(
        mcpUsageMetric(a.item)?.value,
        mcpUsageMetric(b.item)?.value,
      );
      if (usageDelta !== 0) return usageDelta;

      if (a.hasChartData !== b.hasChartData) {
        return a.hasChartData ? -1 : 1;
      }
      const sourceRankDelta = sourceRankSort(a.item) - sourceRankSort(b.item);
      if (sourceRankDelta !== 0) return sourceRankDelta;

      return a.item.title.localeCompare(b.item.title);
    });
}
