// Today page — server helper for ranked ideas.
//
// Mirrors the "hot" sort from /ideas (weighted reactions × recency decay)
// but trimmed to the top N. Used by the homepage hero so the Ideas column
// shows the same set the dedicated /ideas?sort=hot page would surface.

import {
  hotScore,
  listIdeas,
  toPublicIdea,
} from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import type { RankedIdea } from "@/components/ideas/IdeasFeedView";

/**
 * Returns the top `limit` ideas by hot score. Reaction counts are fetched
 * per idea inside Promise.all so the underlying async work runs in
 * parallel. Server-only — pulls from .data/ideas.jsonl + reactions store.
 */
export async function loadHotIdeasForToday(
  limit: number = 4,
): Promise<RankedIdea[]> {
  const all = await listIdeas();
  const visible = all.filter(
    (r) =>
      r.status === "published" ||
      r.status === "shipped" ||
      r.status === "archived",
  );
  const withCounts: RankedIdea[] = await Promise.all(
    visible.map(async (record) => {
      const reactions = await listReactionsForObject("idea", record.id);
      return {
        idea: toPublicIdea(record),
        reactionCounts: countReactions(reactions),
      };
    }),
  );
  const now = Date.now();
  return withCounts
    .map((r) => ({
      ...r,
      hotScore: hotScore(
        { createdAt: r.idea.publishedAt ?? r.idea.createdAt },
        r.reactionCounts,
        now,
      ),
    }))
    .sort((a, b) => (b.hotScore ?? 0) - (a.hotScore ?? 0))
    .slice(0, limit);
}
