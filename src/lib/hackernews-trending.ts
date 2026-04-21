// Hacker News loader — trending side.
//
// Reads data/hackernews-trending.json (velocity-scored stories, last 72h).
//
// Split from src/lib/hackernews.ts so client components that only need
// per-repo mention badges don't pull this 316KB JSON file into their
// bundle. The future /hackernews trending page imports from here.
//
// Lazy-hydrates derived velocity fields (ageHours, velocity, trendingScore)
// for stories produced by older scraper builds that didn't persist them —
// mirrors the hydrateRedditPost backwards-compat philosophy.

import hnTrendingData from "../../data/hackernews-trending.json";
import type { HnStory, HnTrendingFile } from "./hackernews";

const trendingFile = hnTrendingData as unknown as HnTrendingFile;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeStoryVelocity(
  score: number,
  createdUtc: number,
  nowMs: number,
): Pick<HnStory, "ageHours" | "velocity" | "trendingScore"> {
  const nowSec = Math.floor(nowMs / 1000);
  const ageSec = Math.max(0, nowSec - createdUtc);
  const ageHours = Math.max(0.5, ageSec / 3600);
  const velocity = score / ageHours;
  const logMagnitude = Math.log10(Math.max(1, score));
  return {
    ageHours: round2(ageHours),
    velocity: round2(velocity),
    trendingScore: round2(velocity * logMagnitude),
  };
}

function hydrateHnStory(story: HnStory, nowMs: number): HnStory {
  if (
    story.ageHours !== undefined &&
    story.velocity !== undefined &&
    story.trendingScore !== undefined
  ) {
    return story;
  }
  const computed = computeStoryVelocity(story.score, story.createdUtc, nowMs);
  return {
    ...story,
    ageHours: story.ageHours ?? computed.ageHours,
    velocity: story.velocity ?? computed.velocity,
    trendingScore: story.trendingScore ?? computed.trendingScore,
  };
}

export function getHnTrendingFile(): HnTrendingFile {
  return trendingFile;
}

export function getHnTopStories(
  limit = 50,
  nowMs: number = Date.now(),
): HnStory[] {
  const hydrated = trendingFile.stories.map((s) => hydrateHnStory(s, nowMs));
  hydrated.sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
  if (hydrated.length <= limit) return hydrated;
  return hydrated.slice(0, limit);
}
