import type { Repo } from "./types";

/**
 * Best-effort fallback for unresolved compare IDs.
 *
 * This cannot restore dots or original casing. Prefer
 * `resolveCompareFullNames` with live Repo records whenever possible.
 */
export function compareIdToFallbackFullName(id: string): string {
  const idx = id.indexOf("--");
  if (idx === -1) return id;
  return `${id.slice(0, idx)}/${id.slice(idx + 2)}`;
}

export function resolveCompareFullNames(
  repoIds: string[],
  repos: Pick<Repo, "id" | "fullName">[],
): string[] {
  const byId = new Map(repos.map((repo) => [repo.id, repo.fullName]));
  return repoIds.map((id) => byId.get(id) ?? compareIdToFallbackFullName(id));
}
