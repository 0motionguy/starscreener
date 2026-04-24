// User profile aggregator — the server-side data source for /u/[handle]
// and /api/profile/[handle]. Pulls from the three stores a user
// interacts with (ideas, reactions, shipped-repo links) and returns a
// single projection.
//
// v1 identity model: authorHandle = authorId. Both are the string the
// user posts under (today: the `userId` returned by verifyUserAuth).
// When a real users table lands, swap authorHandle to a display-name
// lookup and keep authorId as the join key — the aggregator will need
// one more step but the signature here stays stable.
//
// Privacy: reactions-given are public by default. The "reactor list"
// on reactions already exposes which users reacted to what. Strategy
// doc notes an opt-out per user eventually; for v1 nothing is hidden.

import type { PublicIdea } from "@/lib/ideas";
import { listIdeas, toPublicIdea } from "@/lib/ideas";
import type {
  ReactionRecord,
  ReactionType,
} from "@/lib/reactions-shape";
import { listReactions } from "@/lib/reactions";

export interface ProfileReactionSummary {
  build: number;
  use: number;
  buy: number;
  invest: number;
  total: number;
}

export interface ProfileReactionGiven {
  objectType: "repo" | "idea";
  objectId: string;
  reactionType: ReactionType;
  createdAt: string;
}

export interface ShippedRepoRef {
  ideaId: string;
  ideaTitle: string;
  repoUrl: string;
  shippedAt: string; // idea.updatedAt when buildStatus flipped to shipped
}

export interface Profile {
  handle: string;
  exists: boolean;
  // Ideas the user has authored that are publicly visible (published
  // or shipped). Pending/rejected are hidden from public profiles.
  ideas: PublicIdea[];
  shippedRepos: ShippedRepoRef[];
  reactionsGiven: ProfileReactionSummary;
  // Recent reactions — capped so the payload stays small on power users.
  recentReactions: ProfileReactionGiven[];
}

const RECENT_REACTIONS_LIMIT = 50;

/**
 * Aggregate a profile view for a given handle. Returns `exists: false`
 * with empty collections when the handle has no ideas AND no reactions —
 * that way a 404 path is cheap and a UI can show "no such user" without
 * throwing.
 */
export async function getProfile(handle: string): Promise<Profile> {
  const normalized = handle.trim();
  if (!normalized) {
    return {
      handle,
      exists: false,
      ideas: [],
      shippedRepos: [],
      reactionsGiven: {
        build: 0,
        use: 0,
        buy: 0,
        invest: 0,
        total: 0,
      },
      recentReactions: [],
    };
  }
  // v1: authorHandle === authorId. When the users table lands, add a
  // lookup step here that maps handle → userId and refactor the two
  // callsites below to filter by userId instead of handle.

  const [allIdeas, allReactions] = await Promise.all([
    listIdeas(),
    listReactions(),
  ]);

  const authoredIdeas = allIdeas.filter((r) => r.authorHandle === normalized);
  const publicIdeas = authoredIdeas
    .filter((r) => r.status === "published" || r.status === "shipped")
    .sort((a, b) => {
      const at = Date.parse(a.publishedAt ?? a.createdAt);
      const bt = Date.parse(b.publishedAt ?? b.createdAt);
      return bt - at;
    });

  const shippedRepos = authoredIdeas
    .filter(
      (r): r is typeof r & { shippedRepoUrl: string } =>
        r.buildStatus === "shipped" && !!r.shippedRepoUrl,
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map(
      (r): ShippedRepoRef => ({
        ideaId: r.id,
        ideaTitle: r.title,
        repoUrl: r.shippedRepoUrl,
        shippedAt: r.updatedAt,
      }),
    );

  // Reactions given by this user. In the v1 identity model the
  // handle IS the userId, so filtering by userId is correct.
  const given: ReactionRecord[] = allReactions.filter(
    (r) => r.userId === normalized,
  );
  const reactionsGiven: ProfileReactionSummary = {
    build: given.filter((r) => r.reactionType === "build").length,
    use: given.filter((r) => r.reactionType === "use").length,
    buy: given.filter((r) => r.reactionType === "buy").length,
    invest: given.filter((r) => r.reactionType === "invest").length,
    total: given.length,
  };

  const recentReactions: ProfileReactionGiven[] = given
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, RECENT_REACTIONS_LIMIT)
    .map((r) => ({
      objectType: r.objectType,
      objectId: r.objectId,
      reactionType: r.reactionType,
      createdAt: r.createdAt,
    }));

  const exists = authoredIdeas.length > 0 || given.length > 0;

  return {
    handle: normalized,
    exists,
    ideas: publicIdeas.map(toPublicIdea),
    shippedRepos,
    reactionsGiven,
    recentReactions,
  };
}
