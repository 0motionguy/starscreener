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

// Mutable in-memory cache — seeded from bundled JSON, replaced via
// refreshLobstersTrendingFromStore().
let trendingFile: LobstersTrendingFile = lobstersTrendingData as unknown as LobstersTrendingFile;

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

// ---------------------------------------------------------------------------
// Phase 4: refresh hook — pull latest lobsters-trending payload from data-store.
// ---------------------------------------------------------------------------

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshLobstersTrendingFromStore(): Promise<{
  source: string;
  ageMs: number;
}> {
  if (inflight) return inflight;
  if (
    Date.now() - lastRefreshMs < MIN_REFRESH_INTERVAL_MS &&
    lastRefreshMs > 0
  ) {
    return { source: "memory", ageMs: Date.now() - lastRefreshMs };
  }
  inflight = (async () => {
    const { getDataStore } = await import("./data-store");
    const result = await getDataStore().read<LobstersTrendingFile>(
      "lobsters-trending",
    );
    if (result.data && result.source !== "missing") {
      trendingFile = result.data;
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
