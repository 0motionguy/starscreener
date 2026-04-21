// StarScreener — `maintainer_profile` agent tool.
//
// Minimal-viable compose over the in-memory repo index: for a given GitHub
// handle, return the repos TrendingRepo knows about that this handle
// owns, aggregated. Honest NOT_FOUND when the handle has zero owned repos
// in the index. No live GitHub calls — keeps latency under the p95 budget
// and avoids extra rate-limit pressure.
//
// The returned type is deliberately named `MaintainerProfileMinimal` so a
// future `MaintainerProfileFull` can ship with live contributor data
// without breaking existing clients.

import { repoStore } from "../lib/pipeline/storage/singleton";
import type { Repo } from "../lib/types";
import { NotFoundError, ParamError } from "./errors";
import { isValidHandle, toRepoCard } from "./shared";
import type { MaintainerProfileMinimal } from "./types";

const TOP_REPOS_CAP = 5;

export interface MaintainerProfileParams {
  handle: string;
}

export function parseMaintainerProfileParams(
  raw: unknown,
): MaintainerProfileParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (!isValidHandle(r.handle)) {
    throw new ParamError(
      "handle must be a GitHub username (alnum + hyphen, 1..39 chars, no leading/trailing hyphen)",
    );
  }
  return { handle: r.handle };
}

function countBy<T, K extends string>(
  items: T[],
  key: (item: T) => K | null | undefined,
): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const k = key(item);
    if (k == null) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function sortedKeysDesc<K extends string>(counts: Map<K, number>): K[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);
}

export function maintainerProfile(raw: unknown): MaintainerProfileMinimal {
  const { handle } = parseMaintainerProfileParams(raw);
  const handleLc = handle.toLowerCase();

  const owned: Repo[] = repoStore
    .getActive()
    .filter((r) => r.owner.toLowerCase() === handleLc);

  if (owned.length === 0) {
    throw new NotFoundError(
      `No repos owned by '${handle}' in the TrendingRepo index`,
    );
  }

  const totalStars = owned.reduce((sum, r) => sum + r.stars, 0);
  const totalStarsDelta7d = owned.reduce((sum, r) => sum + r.starsDelta7d, 0);

  const languages = sortedKeysDesc(
    countBy(owned, (r) => r.language ?? undefined),
  );
  const categoryIds = sortedKeysDesc(countBy(owned, (r) => r.categoryId));

  const topRepos = [...owned]
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, TOP_REPOS_CAP)
    .map(toRepoCard);

  return {
    handle,
    repo_count: owned.length,
    total_stars: totalStars,
    total_stars_delta_7d: totalStarsDelta7d,
    languages,
    category_ids: categoryIds,
    top_repos: topRepos,
    scope_note:
      "Derived only from repos in the TrendingRepo index where owner matches the handle. Cross-repo contributor activity is out of scope for v0.1 and may appear in v0.2 as MaintainerProfileFull.",
  };
}

export const MAINTAINER_PROFILE_PORTAL_PARAMS = {
  handle: {
    type: "string",
    required: true,
    description: "GitHub username (the 'owner' part of owner/repo).",
  },
} as const;

export const MAINTAINER_PROFILE_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["handle"],
  properties: {
    handle: {
      type: "string",
      minLength: 1,
      maxLength: 39,
      pattern: "^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$",
      description: "GitHub username (the 'owner' part of owner/repo).",
    },
  },
} as const;

export const MAINTAINER_PROFILE_DESCRIPTION =
  "Aggregate profile for a GitHub handle, composed from repos TrendingRepo already tracks where owner == handle. Returns total stars, weekly velocity, languages, and top-momentum repos. NOT_FOUND when the handle has no owned repos in the index. Does not make live GitHub API calls.";
