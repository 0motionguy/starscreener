// Build a Top10Bundle from an arbitrary list of repo slugs — used by the
// Builder feature (`?my=slug1,slug2,…`) so the same page + OG rendering
// pipeline can serve a user-composed list with zero special-cased code.
//
// Slugs that don't resolve to a live derived-repo are silently dropped, so
// partial / typo-tolerant lists still render the resolvable subset.

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import type { Repo } from "@/lib/types";

import { buildMeta, repoToItem, windowLabel } from "./builders";
import type { Top10Bundle, Top10Window } from "./types";

/** Resolve slugs → live Repo objects (case-insensitive), dropping misses
 *  and de-duplicating. Caps at 10 results. */
export function resolveSlugsToRepos(slugs: string[]): Repo[] {
  const resolved: Repo[] = [];
  const seen = new Set<string>();
  for (const raw of slugs) {
    const slug = raw.trim();
    if (!slug) continue;
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    const repo = getDerivedRepoByFullName(slug);
    if (repo) {
      resolved.push(repo);
      seen.add(key);
    }
    if (resolved.length >= 10) break;
  }
  return resolved;
}

/** Build a Top10Bundle from slugs, preserving the user-provided order.
 *  Unlike the category builders, this one does NOT re-rank — slot N in the
 *  output is always the Nth resolvable slug. */
export function buildCustomBundleFromSlugs(
  slugs: string[],
  window: Top10Window = "7d",
): Top10Bundle {
  const repos = resolveSlugsToRepos(slugs);
  const items = repos.map((repo, i) => repoToItem(repo, i + 1, window));
  return {
    items,
    meta: buildMeta(items, windowLabel(window)),
    supportedWindows: ["24h", "7d", "30d", "ytd"],
    window,
  };
}
