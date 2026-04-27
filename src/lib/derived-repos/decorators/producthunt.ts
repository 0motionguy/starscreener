// Tier C cleanup: extracted from src/lib/derived-repos.ts orchestrator
// (was step 3.7). Sparse decorator — only repos whose github.com URL
// appeared in a recent (7d) ProductHunt launch's website/description
// get the `producthunt` field set. Most repos keep it undefined. Used
// by PhBadge and the "Hot launch" cross-signal highlight.

import type { Repo } from "../../types";
import { getLaunchForRepo } from "../../producthunt";

export function decorateWithProductHunt(repos: Repo[]): Repo[] {
  return repos.map((r) => {
    const launch = getLaunchForRepo(r.fullName);
    if (!launch) return r;
    return {
      ...r,
      producthunt: {
        launchedOnPH: true,
        launch: {
          id: launch.id,
          name: launch.name,
          votesCount: launch.votesCount,
          daysSinceLaunch: launch.daysSinceLaunch,
          url: launch.url,
        },
      },
    };
  });
}
