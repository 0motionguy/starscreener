// MentionSourcePips — emits .source-pips strip with .spip.<channel>.on per
// active mention channel. Server component.

import type { Repo, SocialPlatform } from "@/lib/types";

const CHANNELS: { key: SocialPlatform; cls: string; title: string }[] = [
  { key: "github", cls: "github", title: "GitHub" },
  { key: "hackernews", cls: "hn", title: "Hacker News" },
  { key: "twitter", cls: "x", title: "X / Twitter" },
  { key: "reddit", cls: "reddit", title: "Reddit" },
  { key: "bluesky", cls: "bsky", title: "Bluesky" },
  { key: "devto", cls: "devto", title: "Dev.to" },
  { key: "producthunt", cls: "ph", title: "Product Hunt" },
  { key: "huggingface", cls: "hf", title: "Hugging Face" },
  { key: "arxiv", cls: "arxiv", title: "arXiv" },
  { key: "npm", cls: "npm", title: "npm" },
  { key: "lobsters", cls: "lobsters", title: "Lobsters" },
];

const SOURCE_MARKS: Record<string, string> = {
  github: "G",
  hn: "H",
  x: "X",
  reddit: "R",
  bsky: "B",
  devto: "D",
  ph: "P",
  hf: "F",
  arxiv: "A",
  npm: "N",
  lobsters: "L",
};

interface MentionSourcePipsProps {
  repo: Pick<Repo, "mentions">;
}

export function MentionSourcePips({ repo }: MentionSourcePipsProps) {
  const rollup = repo.mentions?.perSource;
  return (
    <div className="source-pips">
      {CHANNELS.map(({ key, cls, title }) => {
        const channel = rollup?.[key];
        const on = !!channel && (channel.count24h ?? 0) > 0;
        return <span key={key} className={`spip ${cls}${on ? " on" : ""}`} title={title} />;
      })}
    </div>
  );
}

interface MentionCellProps {
  repo: Pick<Repo, "mentions" | "mentionCount24h">;
}

/** Combined Mentions cell — pips + count. Replaces V4 dual-column pattern. */
export function MentionCell({ repo }: MentionCellProps) {
  const count =
    repo.mentions?.total24h ??
    repo.mentionCount24h ??
    0;
  const active = CHANNELS.filter(({ key }) => {
    const channel = repo.mentions?.perSource?.[key];
    return !!channel && (channel.count24h ?? channel.count7d ?? 0) > 0;
  });
  const top = active[0];

  return (
    <div className="mention-pack">
      <span className="ms-pips">
        {active.slice(0, 6).map(({ key, cls, title }) => (
          <span key={key} className={`smark ${cls}`} title={title}>
            {SOURCE_MARKS[cls] ?? "·"}
          </span>
        ))}
      </span>
      <span className="ms-count">{count.toLocaleString()}</span>
      {top && <span className="ms-top">live on {top.title}</span>}
    </div>
  );
}
