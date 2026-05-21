import { ChevronUp } from "lucide-react";

import type { Repo } from "@/lib/types";

import { RepoSparkline } from "@/components/trending/RepoSparkline";

interface SourceBreakdownGridProps {
  repo: Repo;
}

interface CardSpec {
  cls: string;
  iconLabel: string;
  title: string;
  channels: ("github" | "hackernews" | "reddit" | "twitter")[];
  footHint: string;
}

const CARDS: CardSpec[] = [
  {
    cls: "s-github",
    iconLabel: "G",
    title: "GitHub",
    channels: ["github"],
    footHint: "Stargazer rate plus repo mentions over the last 7 days.",
  },
  {
    cls: "s-hn",
    iconLabel: "Y",
    title: "Hacker News",
    channels: ["hackernews"],
    footHint: "Posts and comments referencing this repo.",
  },
  {
    cls: "s-reddit",
    iconLabel: "R",
    title: "Reddit",
    channels: ["reddit"],
    footHint: "Posts and comments tagging the repo across technical communities.",
  },
  {
    cls: "s-x",
    iconLabel: "X",
    title: "X / Twitter",
    channels: ["twitter"],
    footHint: "Tracked posts and developer mentions for the repo.",
  },
];

function softCurve(target: number, n = 12, slope = 0.45): number[] {
  if (target <= 0) return [];
  const base = Math.max(1, target * (1 - slope));
  return Array.from({ length: n }, (_, i) => {
    const r = i / (n - 1);
    return Math.round(base + (target - base) * r);
  });
}

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function SourceBreakdownGrid({ repo }: SourceBreakdownGridProps) {
  const rollup = repo.mentions?.perSource;

  return (
    <div className="source-grid">
      {CARDS.map((card) => {
        const isGithub = card.cls === "s-github";
        const source7d = card.channels.reduce(
          (sum, ch) => sum + (rollup?.[ch]?.count7d ?? 0),
          0,
        );
        const source24h = card.channels.reduce(
          (sum, ch) => sum + (rollup?.[ch]?.count24h ?? 0),
          0,
        );
        const total7d = isGithub
          ? Math.max(repo.starsDelta7d ?? 0, source7d)
          : source7d;
        const total24h = isGithub
          ? Math.max(repo.starsDelta24h ?? 0, source24h)
          : source24h;
        const spark = softCurve(total7d, 14, 0.55);
        const value =
          total7d > 0 ? `${isGithub ? "+" : ""}${formatCount(total7d)}` : "tracked";
        const hasDelta = total24h > 0 || total7d > 0;
        const subText =
          total24h > 0
            ? `${isGithub ? "+" : ""}${formatCount(total24h)} last 24h`
            : total7d > 0
              ? "tracked"
              : "warming source";

        return (
          <div key={card.cls} className={`src-card ${card.cls}`}>
            <div className="src-card-head">
              <div className="src-card-icon">{card.iconLabel}</div>
              <div>
                <div className="src-card-title">
                  ▌ <b>{card.title}</b> · {isGithub ? "stars 7d" : "last 7d"}
                </div>
              </div>
            </div>
            <div className="src-card-value">{value}</div>
            <div className={`src-card-delta ${total7d > 0 ? "up-text" : "muted"}`}>
              {hasDelta ? (
                <ChevronUp
                  size={11}
                  strokeWidth={2}
                  aria-hidden="true"
                  style={{ display: "inline", verticalAlign: "-1px", marginRight: 3 }}
                />
              ) : null}
              {subText}
            </div>
            {spark.length > 0 ? (
              <RepoSparkline
                data={spark}
                variant="up"
                className="src-card-spark"
              />
            ) : null}
            <div className="src-card-foot">{card.footHint}</div>
          </div>
        );
      })}
    </div>
  );
}
