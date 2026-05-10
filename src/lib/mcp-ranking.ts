// Shared MCP ranking — used by /mcp's full table AND the home page hero
// top-5 panel so both surfaces present the same five servers in the same
// order. Logic mirrors src/app/mcp/page.tsx: data-richness first, then the
// source-native registry rank comparator used by the full MCP page.

import {
  compareBySourceNativeRank,
  type EcosystemLeaderboardItem,
} from "@/lib/ecosystem-leaderboards";
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

export interface RankedMcpEntry {
  item: EcosystemLeaderboardItem;
  linked: Repo | undefined;
  meta: RepoMetadata | null;
  hasFillableData: boolean;
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
    const hasPopularity = (item.popularity ?? 0) > 0;
    const hasLinkedStars = Boolean(
      (linked && linked.stars > 0) || (meta && meta.stars > 0),
    );
    const hasReleaseDate = Boolean(
      item.mcp?.lastReleaseAt ||
        linked?.lastCommitAt ||
        meta?.pushedAt ||
        meta?.updatedAt,
    );
    const hasFillableData = hasPopularity || hasLinkedStars || hasReleaseDate;
    return { item, linked, meta, hasFillableData };
  });

  return enriched
    .filter((e) => {
      if (e.hasFillableData) return true;
      if ((e.item.crossSourceCount ?? 1) >= 2) return true;
      if ((e.item.signalScore ?? 0) > 0) return true;
      if (e.item.verified) return true;
      return false;
    })
    .sort((a, b) => {
      if (a.hasFillableData !== b.hasFillableData) {
        return a.hasFillableData ? -1 : 1;
      }
      return compareBySourceNativeRank(a.item, b.item);
    });
}
