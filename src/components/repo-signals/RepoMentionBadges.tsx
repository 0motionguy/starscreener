"use client";

import type { Repo } from "@/lib/types";
import { getHnMentions } from "@/lib/hackernews";
import { getBlueskyMentions } from "@/lib/bluesky";
import { getLaunchForRepo } from "@/lib/producthunt";
import { getLobstersMentions } from "@/lib/lobsters";
import { TwitterMentionBadge } from "@/components/twitter/TwitterMentionBadge";
import { RedditBadge } from "@/components/reddit/RedditBadge";
import { HnBadge } from "@/components/hackernews/HnBadge";
import { DevtoBadge } from "@/components/devto/DevtoBadge";
import { BskyBadge } from "@/components/bluesky/BskyBadge";
import { PhBadge } from "@/components/producthunt/PhBadge";
import { LobstersBadge } from "@/components/lobsters/LobstersBadge";
import { cn } from "@/lib/utils";

interface RepoMentionBadgesProps {
  repo: Repo;
  size?: "sm" | "md";
  includeLongTail?: boolean;
  className?: string;
}

export function RepoMentionBadges({
  repo,
  size = "sm",
  includeLongTail = true,
  className,
}: RepoMentionBadgesProps) {
  return (
    <span className={cn("inline-flex min-w-0 shrink-0 items-center gap-1", className)}>
      <TwitterMentionBadge fullName={repo.fullName} signal={repo.twitter ?? null} size={size} />
      <RedditBadge mention={repo.reddit ?? null} size={size} />
      <HnBadge mention={getHnMentions(repo.fullName)} size={size} />
      <DevtoBadge mention={repo.devto ?? null} size={size} />
      <BskyBadge mention={getBlueskyMentions(repo.fullName)} size={size} />
      {includeLongTail ? (
        <>
          <PhBadge launch={getLaunchForRepo(repo.fullName)} size={size} />
          <LobstersBadge mention={getLobstersMentions(repo.fullName)} size={size} />
        </>
      ) : null}
    </span>
  );
}

export default RepoMentionBadges;
