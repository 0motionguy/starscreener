// category-adapters — map non-repo domain objects (Agents) to the shared
// `Repo` shape so the same `TrendingTable` component can render every
// category surface.
//
// 2026-05-24 refocus: Skills + MCP + HuggingFace stripped (operator: GitHub
// repos are the main seller). The /?cat=llms surface is being replaced by an
// AA leaderboard view in Wave 4 (separate component, separate row shape).

import { getGithubAgentsTrending } from "@/lib/agents-github-trending";
import { decorateWithMentionsRollup } from "@/lib/derived-repos/decorators/mentions-rollup";
import type { CategoryId } from "@/components/trending/TrendingHubHero";
import type { Repo } from "@/lib/types";

export async function refreshCategoryFromStore(_category: CategoryId): Promise<void> {
  // No-ops for repos / agents / llms — repos + agents derive from
  // getDerivedRepos() which is refreshed by refreshTrendingFromStore() at the
  // top of the page handler. llms gets its own AA refresh hook in Wave 4.
}

export function getAgentsAsRepos(): Repo[] {
  return decorateWithMentionsRollup(getGithubAgentsTrending(100));
}

// /?cat=llms is being rebuilt around the Artificial Analysis leaderboard
// (Wave 4). Until that lands, this getter returns an empty list so the page
// renders a placeholder instead of crashing.
export function getLlmsAsRepos(): Repo[] {
  return [];
}
