// StarScreener — Small helpers shared by the three agent-facing tools.

import type { Repo } from "../lib/types";
import type { RepoCard } from "./types";

export function toRepoCard(repo: Repo): RepoCard {
  return {
    full_name: repo.fullName,
    owner: repo.owner,
    name: repo.name,
    description: repo.description,
    url: repo.url,
    language: repo.language,
    stars: repo.stars,
    stars_delta_24h: repo.starsDelta24h,
    stars_delta_7d: repo.starsDelta7d,
    stars_delta_30d: repo.starsDelta30d,
    momentum_score: repo.momentumScore,
    movement_status: repo.movementStatus,
    category_id: repo.categoryId,
    topics: repo.topics ?? [],
  };
}

/** GitHub-handle validator — lowercase alnum + hyphen, 1..39 chars, no leading/trailing hyphen. */
export function isValidHandle(handle: unknown): handle is string {
  if (typeof handle !== "string") return false;
  if (handle.length < 1 || handle.length > 39) return false;
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(handle);
}
