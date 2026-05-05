import type { Repo } from "@/lib/types";
import type { GitHubRepoFetchOutcome } from "@/lib/pipeline/types";

export type CleanupMode = "archived" | "deleted" | "all";
export type CleanupChange = "archived" | "deleted" | "revived" | "none";

export interface CleanupDecision {
  change: CleanupChange;
  nextRepo: Repo | null;
}

export function decideCleanupChange(
  repo: Repo,
  outcome: GitHubRepoFetchOutcome,
  mode: CleanupMode,
): CleanupDecision {
  if (outcome.status === "not_found") {
    if (mode === "deleted" || mode === "all") {
      return {
        change: "deleted",
        nextRepo: { ...repo, deleted: true },
      };
    }
    return { change: "none", nextRepo: null };
  }

  if (outcome.status === "unavailable") {
    return { change: "none", nextRepo: null };
  }

  const raw = outcome.repo;
  const isArchived = raw.archived === true || raw.disabled === true;
  if (isArchived) {
    if (mode === "archived" || mode === "all") {
      return {
        change: "archived",
        nextRepo: { ...repo, archived: true, deleted: false },
      };
    }
    return { change: "none", nextRepo: null };
  }

  if (repo.archived || repo.deleted) {
    return {
      change: "revived",
      nextRepo: { ...repo, archived: false, deleted: false },
    };
  }

  return { change: "none", nextRepo: null };
}
