// StarScreener Pipeline — reason code metadata
//
// Static metadata for every `ReasonCode`. Priority drives ordering in the UI:
// higher priority = shown more prominently in the reason stack. Labels are
// human-facing chip/badge text; descriptions are used in tooltips and the
// methodology surface.

import type { ReasonCode } from "../types";

export interface ReasonMetadata {
  /** Short human-facing chip/badge text (Title Case). */
  label: string;
  /** Higher = shown more prominently. Range 0-100. */
  priority: number;
  /** Long-form explanation used in tooltips / methodology docs. */
  description: string;
}

export const REASON_METADATA: Record<ReasonCode, ReasonMetadata> = {
  release_recent: {
    label: "Fresh Release",
    priority: 90,
    description: "A new release shipped recently.",
  },
  release_major: {
    label: "Major Release",
    priority: 95,
    description: "A major version was shipped.",
  },
  star_velocity_up: {
    label: "Star Velocity Rising",
    priority: 80,
    description: "Star growth rate accelerated.",
  },
  star_spike: {
    label: "Star Spike",
    priority: 85,
    description: "Unusual star gain in the last 24 hours.",
  },
  fork_velocity_up: {
    label: "Fork Growth Up",
    priority: 60,
    description: "Fork growth accelerated — often corporate adoption.",
  },
  contributor_growth: {
    label: "Contributors Joining",
    priority: 55,
    description: "New contributors are joining the project.",
  },
  commit_fresh: {
    label: "Active Development",
    priority: 40,
    description: "Recent commit activity signals ongoing work.",
  },
  rank_jump: {
    label: "Rank Climbing",
    priority: 75,
    description: "Jumped sharply in rank.",
  },
  category_top: {
    label: "Category Leader",
    priority: 70,
    description: "Now a top mover in its category.",
  },
  hacker_news_front_page: {
    label: "Hacker News Feature",
    priority: 88,
    description: "Featured on Hacker News.",
  },
  viral_social_post: {
    label: "Viral Mention",
    priority: 78,
    description: "A single high-reach social post drove attention.",
  },
  social_buzz_elevated: {
    label: "Social Buzz",
    priority: 65,
    description: "Sustained discussion across platforms.",
  },
  issue_activity_spike: {
    label: "Issue Activity Spike",
    priority: 50,
    description: "Unusual issue velocity suggests adoption.",
  },
  breakout_detected: {
    label: "Breakout",
    priority: 92,
    description: "Small repo with unusual acceleration.",
  },
  quiet_killer_detected: {
    label: "Quiet Killer",
    priority: 45,
    description: "Steady sustained growth with no single spike.",
  },
  organic_growth: {
    label: "Organic Growth",
    priority: 20,
    description: "Consistent accumulation with no single trigger.",
  },
};

/** Return the priority for a reason code, or 0 if unknown (defensive). */
export function reasonPriority(code: ReasonCode): number {
  return REASON_METADATA[code]?.priority ?? 0;
}

/** Return the label for a reason code, or the raw code if unknown (defensive). */
export function reasonLabel(code: ReasonCode): string {
  return REASON_METADATA[code]?.label ?? code;
}
