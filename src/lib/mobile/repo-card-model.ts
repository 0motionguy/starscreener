// RepoCardModel — the slim, serializable view model the mobile Radar feed
// consumes. Built server-side from the SAME sorted Repo[] the desktop table
// renders (no duplicate fetch, no re-sort), then handed to the client feed as
// props — so we ship ~15 lean rows, not 15 full Repo objects with every field.

import type { Repo } from "@/lib/types";
import type { WindowId } from "@/components/trending/TrendingHubHero";

export type RepoSignal = "new" | "hot" | null;

export interface RepoCardModel {
  id: string;
  rank: number;
  fullName: string;
  owner: string;
  name: string;
  href: string;
  avatarUrl: string | null;
  description: string | null;
  stars: number;
  delta: number;
  deltaPct: number | null;
  windowLabel: string;
  sparkline: number[];
  signal: RepoSignal;
  sources: string[];
  mentions: number;
  category: string;
}

function deltaForWindow(r: Repo, w: WindowId): number {
  if (w === "7d") return r.starsDelta7d ?? 0;
  if (w === "30d") return r.starsDelta30d ?? 0;
  // No dedicated 1h delta on the model; 24h is the finest bucket we carry.
  return r.starsDelta24h ?? 0;
}

// channelStatus → SourceLogo names. github is implicit for every repo row.
const CHANNEL_SOURCES: Array<[string, string]> = [
  ["hn", "hackernews"],
  ["reddit", "reddit"],
  ["bluesky", "bluesky"],
  ["devto", "devto"],
  ["producthunt", "producthunt"],
];

function sourcesFor(r: Repo): string[] {
  const out = ["github"];
  const cs = r.channelStatus as Record<string, boolean | undefined> | undefined;
  if (cs) {
    for (const [key, name] of CHANNEL_SOURCES) {
      if (cs[key] && !out.includes(name)) out.push(name);
    }
  }
  return out.slice(0, 5);
}

export function toRepoCardModel(
  r: Repo,
  index: number,
  w: WindowId,
  newSet: Set<string>,
): RepoCardModel {
  const stars = r.stars ?? 0;
  const delta = deltaForWindow(r, w);
  const signal: RepoSignal = newSet.has(r.fullName)
    ? "new"
    : (r.crossSignalScore ?? 0) >= 3
      ? "hot"
      : null;
  return {
    id: r.id,
    rank: index + 1,
    fullName: r.fullName,
    owner: r.owner,
    name: r.name,
    href: `/repo/${r.owner}/${r.name}`,
    avatarUrl: r.ownerAvatarUrl ?? null,
    description: r.description ?? null,
    stars,
    delta,
    // Percent of the pre-delta base, matching the home page's percentDelta.
    deltaPct:
      stars > 0 && delta !== 0
        ? Math.round((delta / Math.max(1, stars - delta)) * 100)
        : null,
    windowLabel: w,
    sparkline: Array.isArray(r.sparklineData) ? r.sparklineData.slice(-30) : [],
    signal,
    sources: sourcesFor(r),
    mentions: r.mentionCount24h ?? 0,
    category: r.categoryId ?? r.language ?? "repo",
  };
}

export function toRepoCardModels(
  repos: Repo[],
  w: WindowId,
  newSet: Set<string>,
  limit = 20,
): RepoCardModel[] {
  return repos.slice(0, limit).map((r, i) => toRepoCardModel(r, i, w, newSet));
}
