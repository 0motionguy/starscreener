// category-adapters — map non-repo domain objects (Agents) to the shared
// `Repo` shape so the same `TrendingTable` component can render every
// category surface.
//
// Skills returned in 2026-07 as a strict GitHub-repo view. This does not
// restore the retired third-party Skills/MCP/HuggingFace leaderboard stack.

import { getGithubAgentsTrending } from "@/lib/agents-github-trending";
import { getGithubSkillsTrending } from "@/lib/skills-github-trending";
import { decorateWithMentionsRollup } from "@/lib/derived-repos/decorators/mentions-rollup";
import type { CategoryId } from "@/components/trending/TrendingHubHero";
import type { Repo } from "@/lib/types";

export async function refreshCategoryFromStore(category: CategoryId): Promise<void> {
  void category;
  // No-ops for repos / agents / skills / llms — GitHub-backed categories derive from
  // getDerivedRepos() which is refreshed by refreshTrendingFromStore() at the
  // top of the page handler. llms gets its own AA refresh hook in Wave 4.
}

export function getAgentsAsRepos(): Repo[] {
  return decorateWithMentionsRollup(getGithubAgentsTrending(100));
}

export function getSkillsAsRepos(): Repo[] {
  return decorateWithMentionsRollup(getGithubSkillsTrending(100));
}

// /?cat=llms is being rebuilt around the Artificial Analysis leaderboard
// (Wave 4). Until that lands, this getter returns an empty list so the page
// renders a placeholder instead of crashing.
export function getLlmsAsRepos(): Repo[] {
  return [];
}
