import type { RedditAllPost } from "@/lib/reddit-all";

import { SubredditGroupView, type VelocityStats } from "./all-trending-tabs.shared";

interface BySubredditTabProps {
  posts: RedditAllPost[];
  velocityP90: number;
  velocityStats: VelocityStats;
}

export function BySubredditTab({ posts, velocityP90, velocityStats }: BySubredditTabProps) {
  return (
    <SubredditGroupView
      posts={posts}
      velocityP90={velocityP90}
      velocityStats={velocityStats}
    />
  );
}
