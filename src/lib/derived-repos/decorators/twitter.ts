// Tier C cleanup: extracted from src/lib/derived-repos.ts orchestrator
// (was step 3.6). Attaches the latest Twitter/X row rollup from
// .data/twitter-repo-signals onto each Repo. Keeps the client terminal
// free of server-only storage imports while letting rows render the
// same X mention counts as /twitter.

import type { Repo } from "../../types";
import { getTwitterSignalSync } from "../../twitter";

export function decorateWithTwitter(repos: Repo[]): Repo[] {
  return repos.map((r) => {
    const signal = getTwitterSignalSync(r.fullName);
    if (!signal) {
      return { ...r, twitter: null };
    }
    return {
      ...r,
      twitter: {
        mentionCount24h: signal.metrics.mentionCount24h,
        uniqueAuthors24h: signal.metrics.uniqueAuthors24h,
        finalTwitterScore: signal.score.finalTwitterScore,
        badgeState: signal.badge.state,
        topPostUrl: signal.metrics.topPostUrl,
        lastScannedAt: signal.updatedAt,
      },
    };
  });
}
