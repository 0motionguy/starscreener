import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { fetchGitHubRepoLiveWithinBudget } from "@/lib/github-live";
import type { Repo } from "@/lib/types";

export interface RepoProfileInput {
  repo: Repo;
  isLiveFetched: boolean;
}

export async function resolveRepoProfileInput(
  owner: string,
  name: string,
): Promise<RepoProfileInput | null> {
  const fullName = `${owner}/${name}`;
  const derived = getDerivedRepoByFullName(fullName);
  if (derived) return { repo: derived, isLiveFetched: false };

  const live = await fetchGitHubRepoLiveWithinBudget(owner, name);
  return live ? { repo: live, isLiveFetched: true } : null;
}
