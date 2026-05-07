// Recent Mentions Detail Feed — surfaces the rich `mentions.detail.perSource[X].top[]`
// data collected by the cross-source mentions sweep.
//
// Sibling to RecentMentionsFeed (the tabbed evidence feed lower on the page).
// This component differs in intent + data source:
//   - source:  repo.mentions.detail.perSource[channel].top[] (sweep output)
//   - layout:  flat, time-sorted, last 15 events across all channels
//   - render:  brand icon + author + relative time + engagement + title/text
//
// Renders directly below the CompletenessStrip so users see "23 across 5
// channels" coverage and immediately get the actual posts behind those
// counts. Returns null when the sweep hasn't covered the repo yet — keeps
// cold profiles silent rather than showing a broken empty state.
//
// Server component (no client-side state). All formatting is pure.
//
// CSS lives in globals.css under `.recent-mentions-detail-feed` ruleset
// alongside the sibling `.completeness-strip` rules — matching the
// co-located style approach used elsewhere on this page.

import type { JSX } from "react";

import {
  HackerNewsIcon,
  RedditIcon,
  BlueskyIcon,
  DevtoIcon,
  LobstersIcon,
  XIcon,
  ProductHuntIcon,
} from "@/components/brand/BrandIcons";
import { Globe } from "lucide-react";
import { getRelativeTime } from "@/lib/utils";
import type {
  CrossSourceChannel,
  CrossSourceMentionDetail,
  Repo,
} from "@/lib/types";

type IconCmp = (props: { size?: number; className?: string }) => JSX.Element;

const SOURCE_META: Record<
  CrossSourceChannel,
  { label: string; Icon: IconCmp }
> = {
  twitter: {
    label: "X",
    Icon: (p) => <XIcon {...p} monochrome />,
  },
  reddit: {
    label: "Reddit",
    Icon: (p) => <RedditIcon {...p} monochrome />,
  },
  hackernews: {
    label: "HN",
    Icon: (p) => <HackerNewsIcon {...p} monochrome />,
  },
  bluesky: {
    label: "Bluesky",
    Icon: (p) => <BlueskyIcon {...p} monochrome />,
  },
  devto: {
    label: "dev.to",
    Icon: (p) => <DevtoIcon {...p} monochrome />,
  },
  lobsters: {
    label: "Lobsters",
    Icon: (p) => <LobstersIcon {...p} monochrome />,
  },
  producthunt: {
    label: "PH",
    Icon: (p) => <ProductHuntIcon {...p} monochrome />,
  },
  tavily: {
    label: "Web",
    Icon: (p) => <Globe {...p} />,
  },
};

const FEED_LIMIT = 15;

/**
 * Format an author handle per source convention. Mirrors the heuristic in
 * `MentionMeta.formatAuthor` so both feeds read consistently.
 */
function formatAuthor(
  source: CrossSourceChannel,
  author: string | null,
): string | null {
  const raw = (author ?? "").trim();
  if (!raw) return null;
  if (source === "reddit") {
    return raw.startsWith("u/") ? raw : `u/${raw}`;
  }
  if (source === "twitter" || source === "bluesky" || source === "devto") {
    return raw.startsWith("@") ? raw : `@${raw.replace(/^@+/, "")}`;
  }
  if (source === "lobsters") {
    return raw.startsWith("~") ? raw : `~${raw.replace(/^~+/, "")}`;
  }
  return raw;
}

/**
 * Pick the best snippet for the row: prefer title (denser signal),
 * fall back to text, then to a "(no excerpt)" placeholder so the row
 * always renders something readable.
 */
function pickSnippet(m: CrossSourceMentionDetail): string {
  const title = m.title?.trim();
  if (title) return title;
  const text = m.text?.trim();
  if (text) return text;
  return "(no excerpt)";
}

interface RecentMentionsDetailFeedProps {
  repo: Repo;
}

export function RecentMentionsDetailFeed({ repo }: RecentMentionsDetailFeedProps) {
  const detail = repo.mentions?.detail;
  if (!detail || !detail.perSource) return null;

  // Flatten every per-source `top[]` into one list, then sort by observedAt
  // desc and slice to FEED_LIMIT. The sweep already filtered to top-N per
  // source so this stays bounded even for very active repos.
  const all: CrossSourceMentionDetail[] = [];
  for (const bucket of Object.values(detail.perSource)) {
    if (!bucket?.top) continue;
    for (const m of bucket.top) all.push(m);
  }
  if (all.length === 0) return null;

  all.sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1));
  const visible = all.slice(0, FEED_LIMIT);

  const channelsCovered = Object.keys(detail.perSource).length;
  const totalShown = visible.length;
  const totalAll = all.length;

  return (
    <section
      className="recent-mentions-detail-feed"
      aria-label="Recent mentions evidence"
    >
      <div className="recent-mentions-detail-feed-head">
        <span className="recent-mentions-detail-feed-eyebrow">
          {"// RECENT MENTIONS · 7D"}
        </span>
        <span className="recent-mentions-detail-feed-count">
          {totalShown} of {totalAll} across {channelsCovered}{" "}
          {channelsCovered === 1 ? "channel" : "channels"}
        </span>
      </div>

      <ul className="recent-mentions-detail-feed-list" role="list">
        {visible.map((m) => {
          const meta = SOURCE_META[m.source];
          if (!meta) return null;
          const Icon = meta.Icon;
          const author = formatAuthor(m.source, m.author);
          const snippet = pickSnippet(m);
          const score = m.engagement?.score;
          const comments = m.engagement?.comments;
          const reactions = m.engagement?.reactions;
          // Stable key: url is unique per mention; fall back to source + ts
          // for the (rare) zero-url shape that may sneak past the loader.
          const key = m.url || `${m.source}-${m.observedAt}`;

          return (
            <li key={key} className="recent-mentions-detail-feed-row">
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="recent-mentions-detail-feed-link"
              >
                <span
                  className="recent-mentions-detail-feed-icon"
                  data-source={m.source}
                  aria-label={meta.label}
                  title={meta.label}
                >
                  <Icon size={14} />
                </span>
                <div className="recent-mentions-detail-feed-body">
                  <div className="recent-mentions-detail-feed-meta">
                    <span className="recent-mentions-detail-feed-source">
                      {meta.label}
                    </span>
                    {author ? (
                      <span className="recent-mentions-detail-feed-author">
                        {author}
                      </span>
                    ) : null}
                    <span className="recent-mentions-detail-feed-time">
                      {getRelativeTime(m.observedAt)}
                    </span>
                    <span className="recent-mentions-detail-feed-spacer" />
                    {typeof score === "number" && score > 0 ? (
                      <span
                        className="recent-mentions-detail-feed-stat"
                        title="upvotes / likes / score"
                      >
                        ★ {score.toLocaleString("en-US")}
                      </span>
                    ) : null}
                    {typeof comments === "number" && comments > 0 ? (
                      <span
                        className="recent-mentions-detail-feed-stat"
                        title="comments"
                      >
                        💬 {comments.toLocaleString("en-US")}
                      </span>
                    ) : null}
                    {typeof reactions === "number" && reactions > 0 ? (
                      <span
                        className="recent-mentions-detail-feed-stat"
                        title="reactions"
                      >
                        ♥ {reactions.toLocaleString("en-US")}
                      </span>
                    ) : null}
                  </div>
                  <p className="recent-mentions-detail-feed-snippet">
                    {snippet}
                  </p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>

      <a
        href="#"
        className="recent-mentions-detail-feed-more"
        aria-disabled="true"
      >
        {"// MORE ON THIS REPO →"}
      </a>
    </section>
  );
}

export default RecentMentionsDetailFeed;
