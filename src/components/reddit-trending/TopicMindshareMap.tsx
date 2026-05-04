// Topic Mindshare Map — mirror of BubbleMap.tsx for the /reddit/trending
// hero viz. Cells are trending TOPICS (n-gram phrases) extracted from
// post titles, sized by sum of trendingScore, colored by baseline tier.
//
// Server component. Computes circle-pack seeds per window (24h / 7d),
// hands to client canvas for physics + interaction.

import { packBubbles } from "@/lib/bubble-pack";
import { extractTopics, type Topic } from "@/lib/reddit-topics";
import type { RedditAllPost } from "@/lib/reddit-all";
import type { BaselineTier } from "@/lib/reddit-baselines";
import {
  TopicMindshareCanvas,
  type TopicSeed,
  type TopicWindowKey,
  type TopicWindowSeedSet,
} from "./TopicMindshareCanvas";

interface TopicMindshareMapProps {
  posts: RedditAllPost[];
  /** Max topics packed per window. Default 60. */
  limit?: number;
}

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 400;
// Raised vs homepage (18 → 26) — topic phrases are text-heavy, need room.
const MIN_RADIUS = 26;
const MAX_RADIUS = 84;

// Tier color tokens — matches BaselinePill exactly so the legend reads
// the same as per-post pills. Routes through --v3-tier-* tokens so creme
// and linen themes can retune the ramp for paper-friendly contrast.
const TIER_COLORS: Record<BaselineTier, { fill: string; stroke: string; glow: string; text: string }> = {
  breakout: {
    fill: "var(--v3-tier-breakout-fill)",
    stroke: "var(--v3-tier-breakout-end)",
    glow: "var(--v3-tier-breakout-glow)",
    text: "var(--v3-tier-text)",
  },
  "above-average": {
    fill: "var(--v3-tier-heating-fill)",
    stroke: "var(--v3-tier-heating-end)",
    glow: "var(--v3-tier-heating-glow)",
    text: "var(--v3-tier-text)",
  },
  normal: {
    fill: "var(--v3-tier-stable-fill)",
    stroke: "var(--v3-tier-stable-end)",
    glow: "var(--v3-tier-stable-glow)",
    text: "var(--v3-tier-text)",
  },
  "below-average": {
    fill: "var(--v3-tier-cooling-fill)",
    stroke: "var(--v3-tier-cooling-end)",
    glow: "var(--v3-tier-cooling-glow)",
    text: "var(--v3-tier-text)",
  },
  "no-baseline": {
    fill: "var(--v3-tier-dormant-fill)",
    stroke: "var(--v3-tier-dormant-end)",
    glow: "var(--v3-tier-dormant-glow)",
    text: "var(--v3-tier-text)",
  },
};

function seedFromTopic(
  topic: Topic,
  id: string,
): Omit<TopicSeed, "cx" | "cy" | "r"> {
  const tint = TIER_COLORS[topic.tier];
  return {
    id,
    phrase: topic.phrase,
    upvotes: topic.upvotesSum,
    postCount: topic.count,
    tier: topic.tier,
    dominantSub: topic.dominantSub,
    postIds: topic.postIds,
    fill: tint.fill,
    stroke: tint.stroke,
    glow: tint.glow,
    textColor: tint.text,
  };
}

function seedsForWindow(
  posts: RedditAllPost[],
  window: TopicWindowKey,
  limit: number,
  nowMs: number,
): TopicSeed[] {
  const HOUR = 60 * 60 * 1000;
  const cutoff = nowMs - (window === "24h" ? 24 : 168) * HOUR;
  const windowed = posts.filter((p) => p.createdUtc * 1000 >= cutoff);
  if (windowed.length === 0) return [];

  const topics = extractTopics(windowed, { maxTopics: limit, minCount: 3 });
  if (topics.length === 0) return [];

  // Index-based ids guarantee uniqueness — slugifying the phrase collides
  // when two different phrases normalize to the same slug (e.g. "open
  // source" and "open-source" both → "open-source"). Window prefix keeps
  // SVG ids stable across window tabs without overlap.
  const idOf = (i: number) => `topic-${window}-${i}`;

  const packed = packBubbles(
    topics.map((t, i) => ({
      id: idOf(i),
      // Size anchor = trendingScoreSum (what's rising), matches spec.
      value: Math.max(1, t.trendingScoreSum),
    })),
    {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      minRadius: MIN_RADIUS,
      maxRadius: MAX_RADIUS,
      padding: 2,
      fillRatio: 0.90,
      edgeMargin: 6,
    },
  );

  const byId = new Map(topics.map((t, i) => [idOf(i), t]));

  return packed
    .map((p) => {
      const topic = byId.get(p.id);
      if (!topic) return null;
      const shell = seedFromTopic(topic, p.id);
      return {
        ...shell,
        cx: p.cx,
        cy: p.cy,
        r: p.r,
      };
    })
    .filter((s): s is TopicSeed => s !== null);
}

export function TopicMindshareMap({ posts, limit = 60 }: TopicMindshareMapProps) {
  const now = Date.now();
  const windows: TopicWindowSeedSet = {
    "24h": seedsForWindow(posts, "24h", limit, now),
    "7d": seedsForWindow(posts, "7d", limit, now),
  };

  const hasAny = windows["24h"].length > 0 || windows["7d"].length > 0;
  if (!hasAny) return null;

  return (
    <TopicMindshareCanvas
      windows={windows}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
    />
  );
}
