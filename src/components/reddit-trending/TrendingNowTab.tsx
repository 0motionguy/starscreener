import type { RedditAllPost } from "@/lib/reddit-all";

import { PostRow, type VelocityStats } from "./all-trending-tabs.shared";

interface TrendingNowTabProps {
  posts: RedditAllPost[];
  velocityP90: number;
  velocityStats: VelocityStats;
  pathname: string;
  searchParams: URLSearchParams;
}

export function TrendingNowTab({
  posts,
  velocityP90,
  velocityStats,
  pathname,
  searchParams,
}: TrendingNowTabProps) {
  return (
    <ul className="space-y-2">
      {posts.map((post) => (
        <PostRow
          key={post.id}
          post={post}
          velocityP90={velocityP90}
          velocityStats={velocityStats}
          pathname={pathname}
          searchParams={searchParams}
        />
      ))}
    </ul>
  );
}
