// Server-only resolver for cross-channel repo mentions.
//
// Why this file exists: RepoMentionBadges is a "use client" component.
// When it directly imported the four lib loaders (hackernews / bluesky /
// lobsters / producthunt), each of those modules statically imports a
// large bundled JSON snapshot — leaking ~500 KB of mention data into
// every client bundle that touched the badge.
//
// Server consumers now call resolveRepoMentions / resolveBatch and pass
// the resolved object down as a prop. RepoMentionBadges then renders
// from props with type-only imports, so no JSON is pulled into client
// bundles. The four lib files are guarded with `import "server-only";`
// to make the boundary a build-time error rather than a silent leak.
import "server-only";

import { getHnMentions, type HnRepoMention } from "@/lib/hackernews";
import { getBlueskyMentions, type BskyRepoMention } from "@/lib/bluesky";
import {
  getLobstersMentions,
  type LobstersRepoMention,
} from "@/lib/lobsters";
import { getLaunchForRepo, type Launch } from "@/lib/producthunt";

export interface RepoMentions {
  hn: HnRepoMention | null;
  bluesky: BskyRepoMention | null;
  lobsters: LobstersRepoMention | null;
  ph: Launch | null;
}

export function resolveRepoMentions(fullName: string): RepoMentions {
  return {
    hn: getHnMentions(fullName) ?? null,
    bluesky: getBlueskyMentions(fullName) ?? null,
    lobsters: getLobstersMentions(fullName) ?? null,
    ph: getLaunchForRepo(fullName) ?? null,
  };
}

/**
 * Batch helper for row-builder pages: pass the full set of fullNames once
 * and the caller plucks per-row mentions out of the returned map.
 * Keys are lowercased to match the per-loader case-insensitive lookup.
 */
export function resolveBatch(
  fullNames: string[],
): Record<string, RepoMentions> {
  const out: Record<string, RepoMentions> = {};
  for (const n of fullNames) {
    if (!n) continue;
    out[n.toLowerCase()] = resolveRepoMentions(n);
  }
  return out;
}
