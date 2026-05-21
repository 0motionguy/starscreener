// TOOLBOX read adapter — producthunt.launches
//
// Phase A.2 / Wave 5. trendingrepo's producthunt loader keeps a
// { lastFetchedAt, windowDays, launches[] } file shape; TOOLBOX events for
// `trending.producthunt.launches` carry one event per launch with the
// snake_case normalized fields produced by scripts/_toolbox-ingest.mjs
// (`producthuntLaunchesToEvents`, lines 321-355): id, name, tagline,
// votes_count, comments_count, created_at, topics, makers, thumbnail.
//
// CAVEATS — the dual-write does NOT transmit:
//   - `linkedRepo` (owner/name match) — so launches surfaced via TOOLBOX
//     come back without GitHub linkage. The badge rollup that powers
//     /repo/* mention pips depends on `linkedRepo`; consumers that match
//     by repo will get an empty `launchesByRepo` map. The /producthunt
//     surface (raw launch list) still works.
//   - `description`, `url` (besides target_identity), `website`, `xUrl`,
//     `aiAdjacent`, `tags`, `githubRepo` enrichment, `daysSinceLaunch`.
//     We reconstruct `daysSinceLaunch` from `created_at`; the rest are
//     left at safe defaults so the existing UI keeps rendering.
//
// On any failure (network, auth, shape, empty body), returns null and the
// caller falls back to the legacy data-store path. Logging of the
// `had_toolbox_flag` diagnostic happens in producthunt.ts alongside the
// `alertAdapterFallthrough` call, matching the devto/hn/reddit pattern.
//
// The flag-gating wiring lives in src/lib/producthunt.ts.

import "server-only";

import type { Launch, ProductHuntFile } from "./producthunt";
import type { ToolboxEvent, ToolboxFetchOptions } from "./toolbox-store-common";
import { fetchLeaderboardEvents, maxProducedAtMs } from "./toolbox-store-common";

function isoFromMaxOrNow(maxMs: number): string {
  return (maxMs > 0 ? new Date(maxMs) : new Date()).toISOString();
}

function daysSinceIso(iso: string, nowMs: number = Date.now()): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

function launchFromEvent(event: ToolboxEvent): Launch | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;

  const id = (f as { id?: unknown }).id;
  const name = (f as { name?: unknown }).name;
  if (typeof id !== "string" && typeof id !== "number") return null;
  if (typeof name !== "string" || !name) return null;

  const createdAt =
    typeof (f as { created_at?: unknown }).created_at === "string"
      ? ((f as { created_at: string }).created_at)
      : "";

  const topicsRaw = (f as { topics?: unknown }).topics;
  const topics: string[] = Array.isArray(topicsRaw)
    ? topicsRaw.filter((t): t is string => typeof t === "string")
    : [];

  const makersRaw = (f as { makers?: unknown }).makers;
  const makers: Launch["makers"] = Array.isArray(makersRaw)
    ? makersRaw
        .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
        .map((m) => ({
          name: typeof m.name === "string" ? m.name : "",
          username: typeof m.username === "string" ? m.username : "",
          twitterUsername:
            typeof m.twitterUsername === "string" ? m.twitterUsername : null,
          websiteUrl:
            typeof m.websiteUrl === "string" ? m.websiteUrl : null,
        }))
    : [];

  const thumbnailRaw = (f as { thumbnail?: unknown }).thumbnail;
  const thumbnail: string | null =
    typeof thumbnailRaw === "string" && thumbnailRaw ? thumbnailRaw : null;

  // target_identity is the launch URL (or website fallback) from
  // producthuntLaunchesToEvents. linkedRepo is NOT in the dual-write
  // payload; consumers that need it must fall back to the legacy file.
  const url = event.target_identity || "";

  return {
    id: String(id),
    name,
    tagline:
      typeof (f as { tagline?: unknown }).tagline === "string"
        ? ((f as { tagline: string }).tagline)
        : "",
    description: "",
    url,
    website: null,
    xUrl: null,
    votesCount:
      typeof (f as { votes_count?: unknown }).votes_count === "number"
        ? ((f as { votes_count: number }).votes_count)
        : 0,
    commentsCount:
      typeof (f as { comments_count?: unknown }).comments_count === "number"
        ? ((f as { comments_count: number }).comments_count)
        : 0,
    createdAt,
    thumbnail,
    topics,
    makers,
    githubUrl: null,
    linkedRepo: null,
    daysSinceLaunch: daysSinceIso(createdAt),
  };
}

/**
 * Fetch the latest ProductHunt launches snapshot from TOOLBOX and shape it
 * into a ProductHuntFile. Returns null on any error so the caller can fall
 * back to the legacy data-store path without throwing.
 *
 * Window: TOOLBOX's leaderboard returns the most recent event per target.
 * Upstream `scrape-producthunt.mjs` writes ~7d of launches per scan, so
 * the resulting set mirrors the legacy file's 7-day window; the
 * `windowDays` field is fixed at 7 for shape parity.
 */
export async function fetchProductHuntLaunchesFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<ProductHuntFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.producthunt.launches");
  if (!body) return null;

  const launches: Launch[] = [];
  for (const ev of body.targets) {
    const launch = launchFromEvent(ev);
    if (launch) launches.push(launch);
  }

  // Sort by votesCount desc for stable surface ordering (matches the
  // /producthunt page's default sort).
  launches.sort((a, b) => b.votesCount - a.votesCount);

  return {
    lastFetchedAt: isoFromMaxOrNow(maxProducedAtMs(body.targets)),
    windowDays: 7,
    launches,
  };
}
