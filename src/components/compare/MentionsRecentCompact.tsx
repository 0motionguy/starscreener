"use client";

// Recent-mentions mini-module. Renders the 3 most recent mention titles
// with platform + relative age. Long titles truncate per-line rather than
// wrapping so column heights line up across the grid.

import { MessageSquare } from "lucide-react";
import type { RepoMention } from "@/lib/pipeline/types";
import type { SocialPlatform } from "@/lib/types";

interface MentionsRecentCompactProps {
  mentions: RepoMention[];
}

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  reddit: "reddit",
  hackernews: "hn",
  bluesky: "bsky",
  devto: "dev.to",
  twitter: "x",
  github: "gh",
};

function formatAge(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.floor(diff / (60 * 1000));
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.floor(day / 30);
  return `${mo}mo`;
}

export function MentionsRecentCompact({
  mentions,
}: MentionsRecentCompactProps) {
  const top3 = mentions.slice(0, 3);

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <MessageSquare size={12} className="text-text-tertiary shrink-0" />
        <span className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
          Recent Mentions
        </span>
      </div>
      {top3.length === 0 ? (
        <p className="text-xs text-text-tertiary italic">No mentions yet.</p>
      ) : (
        <ul className="space-y-1">
          {top3.map((m) => {
            const title = (m.content ?? "").split("\n")[0].trim() || "(no title)";
            return (
              <li
                key={m.id}
                className="flex items-start gap-1.5 min-w-0 text-xs"
              >
                <span className="font-mono uppercase tracking-wider text-text-tertiary shrink-0 w-10 pt-0.5">
                  {PLATFORM_LABEL[m.platform] ?? m.platform}
                </span>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-text-secondary truncate hover:text-text-primary hover:underline min-w-0 flex-1"
                >
                  {title}
                </a>
                <span className="font-mono text-text-tertiary shrink-0 tabular-nums">
                  {formatAge(m.postedAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
