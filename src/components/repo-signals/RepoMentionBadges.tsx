"use client";

import type { Repo } from "@/lib/types";
// Type-only imports — stripped by SWC at build time, so no JSON-bearing
// loader code lands in the client bundle. The runtime `getXxxMentions`
// callers were the source of the ~500 KB static-data leak; server
// consumers now pass the resolved values via the `mentions` prop
// (see `src/lib/repo-mentions.server.ts`).
import type { HnRepoMention } from "@/lib/hackernews";
import type { BskyRepoMention } from "@/lib/bluesky";
import type { LobstersRepoMention } from "@/lib/lobsters";
import type { Launch } from "@/lib/producthunt";
import { TwitterMentionBadge } from "@/components/twitter/TwitterMentionBadge";
import { RedditBadge } from "@/components/reddit/RedditBadge";
import { HnBadge } from "@/components/hackernews/HnBadge";
import { DevtoBadge } from "@/components/devto/DevtoBadge";
import { BskyBadge } from "@/components/bluesky/BskyBadge";
import { PhBadge } from "@/components/producthunt/PhBadge";
import { LobstersBadge } from "@/components/lobsters/LobstersBadge";
import { cn } from "@/lib/utils";

export interface RepoMentions {
  hn: HnRepoMention | null;
  bluesky: BskyRepoMention | null;
  lobsters: LobstersRepoMention | null;
  ph: Launch | null;
}

interface RepoMentionBadgesProps {
  repo: Repo;
  /**
   * Resolved cross-channel mentions for this repo. Server consumers
   * compute this via `resolveRepoMentions` from `repo-mentions.server`;
   * client consumers receive it via row payloads built server-side.
   * When omitted, all four badges render as nulls (no mention data).
   */
  mentions?: RepoMentions;
  size?: "sm" | "md";
  includeLongTail?: boolean;
  className?: string;
}

const EMPTY_MENTIONS: RepoMentions = {
  hn: null,
  bluesky: null,
  lobsters: null,
  ph: null,
};

export function RepoMentionBadges({
  repo,
  mentions,
  size = "sm",
  includeLongTail = true,
  className,
}: RepoMentionBadgesProps) {
  const m = mentions ?? EMPTY_MENTIONS;
  return (
    <span className={cn("inline-flex min-w-0 shrink-0 items-center gap-1", className)}>
      <TwitterMentionBadge fullName={repo.fullName} signal={repo.twitter ?? null} size={size} />
      <RedditBadge mention={repo.reddit ?? null} size={size} />
      <HnBadge mention={m.hn} size={size} />
      <DevtoBadge mention={repo.devto ?? null} size={size} />
      <BskyBadge mention={m.bluesky} size={size} />
      {includeLongTail ? (
        <>
          <PhBadge launch={m.ph} size={size} />
          <LobstersBadge mention={m.lobsters} size={size} />
        </>
      ) : null}
    </span>
  );
}

export default RepoMentionBadges;
