// Lobsters loader - trending side.
//
// Reads data/lobsters-trending.json (velocity-scored stories, last 72h).
// Split from src/lib/lobsters.ts so terminal rows that only need per-repo
// badges do not pull the larger story snapshot into their bundle.

import lobstersTrendingData from "../../data/lobsters-trending.json";
import type { LobstersStory } from "./lobsters";

export interface LobstersTrendingFile {
  fetchedAt: string;
  windowHours: number;
  scannedTotal: number;
  stories: LobstersStory[];
}

const trendingFile = lobstersTrendingData as unknown as LobstersTrendingFile;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hydrateStory(story: LobstersStory, nowMs: number): LobstersStory {
  if (story.ageHours !== undefined && story.trendingScore !== undefined) {
    return story;
  }

  const ageHours = Math.max(
    0.5,
    (nowMs - story.createdUtc * 1000) / 3_600_000,
  );
  const trendingScore = story.score / Math.pow(ageHours + 2, 1.5);

  return {
    ...story,
    ageHours: story.ageHours ?? round2(ageHours),
    trendingScore: story.trendingScore ?? round2(trendingScore),
  };
}

export function getLobstersTrendingFile(): LobstersTrendingFile {
  return trendingFile;
}

export function getLobstersTopStories(
  limit = 50,
  nowMs: number = Date.now(),
): LobstersStory[] {
  const hydrated = (trendingFile.stories ?? []).map((s) =>
    hydrateStory(s, nowMs),
  );
  hydrated.sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
  if (hydrated.length <= limit) return hydrated;
  return hydrated.slice(0, limit);
}
