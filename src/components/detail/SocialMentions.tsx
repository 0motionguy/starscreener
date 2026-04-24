"use client";

import { useState, useMemo } from "react";
import {
  MessageCircle,
  MessageSquare,
  ExternalLink,
  GitBranch,
  FileText,
} from "lucide-react";
import type { SocialMention, SocialPlatform } from "@/lib/types";
import { cn, getRelativeTime } from "@/lib/utils";

interface SocialMentionsProps {
  mentions: SocialMention[];
  /**
   * When false, the Twitter tab is omitted entirely (cleanest UX vs. showing
   * a disabled tab or error text). Defaults to true for callers that don't
   * know the live state of the Nitter mirror probe.
   */
  twitterAvailable?: boolean;
}

type FilterTab = "all" | SocialPlatform;

const BASE_TABS: { label: string; value: FilterTab }[] = [
  { label: "All", value: "all" },
  { label: "Twitter", value: "twitter" },
  { label: "Reddit", value: "reddit" },
  { label: "HN", value: "hackernews" },
  { label: "GitHub", value: "github" },
  { label: "Dev.to", value: "devto" },
];

const PLATFORM_ICON: Record<SocialPlatform, React.ReactNode> = {
  twitter: <MessageCircle size={14} className="shrink-0 text-accent-blue" />,
  reddit: <MessageSquare size={14} className="shrink-0 text-accent-amber" />,
  hackernews: <ExternalLink size={14} className="shrink-0 text-accent-amber" />,
  github: <GitBranch size={14} className="shrink-0 text-text-secondary" />,
  devto: <FileText size={14} className="shrink-0 text-accent-purple" />,
  bluesky: <MessageCircle size={14} className="shrink-0 text-accent-blue" />,
  pypi: <FileText size={14} className="shrink-0 text-accent-blue" />,
  huggingface: <ExternalLink size={14} className="shrink-0 text-accent-amber" />,
  arxiv: <FileText size={14} className="shrink-0 text-text-secondary" />,
};

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-accent-green",
  neutral: "bg-text-tertiary",
  negative: "bg-accent-red",
};

export function SocialMentions({
  mentions,
  twitterAvailable = true,
}: SocialMentionsProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  // When the Nitter mirror probe came up empty, drop the Twitter tab
  // entirely — cleanest UX, no "unavailable" placeholder text.
  const tabs = useMemo(
    () =>
      twitterAvailable
        ? BASE_TABS
        : BASE_TABS.filter((t) => t.value !== "twitter"),
    [twitterAvailable],
  );

  const filtered = useMemo(() => {
    if (activeTab === "all") return mentions;
    return mentions.filter((m) => m.platform === activeTab);
  }, [mentions, activeTab]);

  return (
    <section className="space-y-3 animate-slide-up">
      {/* Section header */}
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
        Social Mentions
      </h2>

      {/* Platform tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-bg-secondary rounded-badge p-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-badge transition-all whitespace-nowrap",
              activeTab === tab.value
                ? "bg-bg-card text-text-primary shadow-card"
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mention cards */}
      {filtered.length === 0 ? (
        <div className="bg-bg-card rounded-card p-4 border shadow-card">
          <p className="text-text-tertiary text-sm">
            No mentions found for this platform
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((mention) => (
            <a
              key={mention.id}
              href={mention.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-bg-card rounded-card p-3 border shadow-card hover:bg-bg-card-hover hover:shadow-card-hover transition-all"
            >
              <div className="flex items-start gap-2.5">
                {/* Platform icon */}
                <div className="mt-0.5">
                  {PLATFORM_ICON[mention.platform]}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm text-text-primary font-medium truncate">
                      {mention.author}
                    </span>
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${SENTIMENT_DOT[mention.sentiment]}`}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">
                    {mention.content}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="font-mono text-xs text-text-tertiary">
                      {mention.engagement.toLocaleString("en-US")} engagements
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {getRelativeTime(mention.postedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
