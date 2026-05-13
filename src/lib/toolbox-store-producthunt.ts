// TOOLBOX read adapter — Product Hunt launches
//
// Phase A.2 continuation. Shapes TOOLBOX leaderboard events for
// `trending.producthunt.launches` into the legacy ProductHuntFile shape
// that producthunt.ts caches. Returns the file shape or `null` on any
// failure so the caller can fall through to the legacy data-store path
// without throwing.
//
// FIELD COVERAGE CAVEATS (TOOLBOX events vs legacy producthunt-launches.json):
//   The upstream ingest currently transmits only the API-shape primitives:
//   id, name, tagline, thumbnail, topics, votes_count, comments_count,
//   makers, created_at. Fields the local scraper enriches AFTER
//   fetching from PH API are NOT transmitted, so this adapter defaults
//   them as follows:
//
//     description     → ""           (PH API "description" not in dual-write)
//     url             → ""           (PH detail URL not in dual-write)
//     website         → null
//     xUrl            → null
//     githubUrl       → null
//     linkedRepo      → null         (key gap — getLaunchForRepo() returns
//                                     null for every repo when adapter active;
//                                     repo-page "PH launch" badges go dark)
//     aiAdjacent      → undefined    (getAiLaunches falls back to "show all"
//                                     when no item has the flag — see
//                                     producthunt.ts:128)
//     tags            → undefined
//     githubRepo      → undefined
//     daysSinceLaunch → computed from created_at; 0 if missing
//
//   The `linkedRepo` gap is the main UI degradation under flag-on. Documented
//   in handover §2 + memory for follow-up dual-write enrichment.
//
// The flag-gating + alert-on-fallthrough wiring lives in producthunt.ts,
// matching the existing toolbox-store.ts pattern.

import "server-only";

import type { Launch, ProductHuntFile } from "./producthunt";
import type { ToolboxEvent, ToolboxFetchOptions } from "./toolbox-store-common";
import {
  fetchLeaderboardEvents,
  maxProducedAtMs,
} from "./toolbox-store-common";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toIso(maxMs: number): string {
  return (maxMs > 0 ? new Date(maxMs) : new Date()).toISOString();
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function makersFromUnknown(value: unknown): Launch["makers"] {
  if (!Array.isArray(value)) return [];
  const out: Launch["makers"] = [];
  for (const m of value) {
    if (!m || typeof m !== "object") continue;
    const obj = m as Record<string, unknown>;
    const name = stringOr(obj.name, "");
    const username = stringOr(obj.username, "");
    if (!name && !username) continue;
    out.push({
      name,
      username,
      twitterUsername:
        typeof obj.twitterUsername === "string" ? obj.twitterUsername : null,
      websiteUrl:
        typeof obj.websiteUrl === "string" ? obj.websiteUrl : null,
    });
  }
  return out;
}

function daysSinceLaunch(createdAt: string): number {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return 0;
  const days = Math.floor((Date.now() - t) / MS_PER_DAY);
  return days < 0 ? 0 : days;
}

function eventToLaunch(event: ToolboxEvent): Launch | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const id = stringOr(f.id, "");
  if (!id) return null;
  const createdAt = stringOr(f.created_at, "");
  return {
    id,
    name: stringOr(f.name, ""),
    tagline: stringOr(f.tagline, ""),
    description: "",
    url: "",
    website: null,
    xUrl: null,
    votesCount: numberOr(f.votes_count, 0),
    commentsCount: numberOr(f.comments_count, 0),
    createdAt,
    thumbnail: typeof f.thumbnail === "string" ? f.thumbnail : null,
    topics: stringArray(f.topics),
    makers: makersFromUnknown(f.makers),
    githubUrl: null,
    linkedRepo: null,
    daysSinceLaunch: daysSinceLaunch(createdAt),
    // aiAdjacent intentionally undefined — getAiLaunches falls back to
    // "show all" when no item carries the flag (producthunt.ts:128).
  };
}

export async function fetchProducthuntLaunchesFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<ProductHuntFile | null> {
  const body = await fetchLeaderboardEvents(
    opts,
    "trending.producthunt.launches",
  );
  if (!body) return null;

  const launches: Launch[] = [];
  for (const ev of body.targets) {
    const l = eventToLaunch(ev);
    if (l) launches.push(l);
  }
  // Sort newest first to match the local scraper's output order.
  launches.sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  return {
    lastFetchedAt: toIso(maxProducedAtMs(body.targets)),
    windowDays: 7,
    launches,
  };
}
