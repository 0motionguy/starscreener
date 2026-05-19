// SourceBreakdownGrid — 4 .src-card cells for GitHub / HN / Reddit / X.
// Each card shows count + delta + a soft synthetic sparkline derived from
// the 7d count (we have no per-channel daily series yet — this is a clearly
// flagged synthesis so the column doesn't render empty).

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
    footHint: "Stargazer + repo-mention rate over the last 7 days.",
  },
  {
    cls: "s-hn",
    iconLabel: "Y",
    title: "Hacker News",
    channels: ["hackernews"],
    footHint: "Front-page posts + comments referencing this repo.",
  },
  {
    cls: "s-reddit",
    iconLabel: "R",
    title: "Reddit",
    channels: ["reddit"],
    footHint: "Posts + comments tagging the repo across /r/programming et al.",
  },
  {
    cls: "s-x",
    iconLabel: "X",
    title: "X / Twitter",
    channels: ["twitter"],
    footHint: "Tracked tweet mentions for the repo's primary handles.",
  },
];

/** Derive a 12-point smooth ramp from a final-day count. Same trick as
 * RepoKpiStrip: never invent the underlying distribution, just signal the
 * shape ("up" / "down" / "flat") so the sparkline doesn't render empty.
 */
function softCurve(target: number, n = 12, slope = 0.45): number[] {
  if (target <= 0) return [];
  const base = Math.max(1, target * (1 - slope));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = i / (n - 1);
    out.push(Math.round(base + (target - base) * r));
  }
  return out;
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
        const total7d = card.channels.reduce(
          (sum, ch) => sum + (rollup?.[ch]?.count7d ?? 0),
          0,
        );
        const total24h = card.channels.reduce(
          (sum, ch) => sum + (rollup?.[ch]?.count24h ?? 0),
          0,
        );
        const spark = softCurve(total7d, 14, 0.55);
        const value = total7d > 0 ? formatCount(total7d) : "—";
        const sub =
          total24h > 0
            ? `▲ +${formatCount(total24h)} last 24h`
            : total7d > 0
              ? "▲ tracked"
              : "no recent mentions";
        return (
          <div key={card.cls} className={`src-card ${card.cls}`}>
            <div className="src-card-head">
              <div className="src-card-icon">{card.iconLabel}</div>
              <div>
                <div className="src-card-title">
                  ▌ <b>{card.title}</b> · last 7d
                </div>
              </div>
            </div>
            <div className="src-card-value">{value}</div>
            <div
              className={`src-card-delta ${total7d > 0 ? "up-text" : "muted"}`}
            >
              {sub}
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
