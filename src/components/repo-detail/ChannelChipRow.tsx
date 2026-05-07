// 5-up channel chip row for the repo-detail hero.
//
// Renders one chip per channel (GitHub / HackerNews / Reddit / Bluesky /
// dev.to) with the canonical brand color, primary 24h metric, FIRING / QUIET
// status pill, and a mini sparkline. Reads exclusively from the in-memory
// Repo (channelStatus, mentions.perSource, starsDelta24h, sparklineData) so
// no extra fetches happen here.
//
// Data dependencies:
//   - `repo.channelStatus`         — boolean per channel (firing yes/no)
//   - `repo.mentions.perSource[k]` — { count24h, count7d } per source
//   - `repo.starsDelta24h`         — for the GitHub chip
//   - `repo.sparklineData`         — used as the spark for the GitHub chip;
//                                    other channels render a tiny synthetic
//                                    bar from count7d when no daily series exists
//
// Layout ports the V4 dashboard chip pattern from /githubrepo's source pills.

import type { JSX } from "react";
import {
  GithubIcon,
  HackerNewsIcon,
  RedditIcon,
  BlueskyIcon,
  DevtoIcon,
} from "@/components/brand/BrandIcons";
import { Sparkline } from "@/components/shared/Sparkline";
import { formatNumber } from "@/lib/utils";
import type { Repo } from "@/lib/types";

type ChannelKey = "github" | "hackernews" | "reddit" | "bluesky" | "devto";

interface ChannelDef {
  key: ChannelKey;
  label: string;
  icon: (props: { size?: number; className?: string }) => JSX.Element;
  color: string;
}

const CHANNELS: ReadonlyArray<ChannelDef> = [
  { key: "github", label: "GitHub", icon: GithubIcon, color: "#22c55e" },
  { key: "hackernews", label: "HackerNews", icon: HackerNewsIcon, color: "#ff6600" },
  { key: "reddit", label: "Reddit", icon: RedditIcon, color: "#ff4500" },
  { key: "bluesky", label: "Bluesky", icon: BlueskyIcon, color: "#0085FF" },
  { key: "devto", label: "Dev.to", icon: DevtoIcon, color: "#0a0a0a" },
];

interface ChannelChipRowProps {
  repo: Repo;
}

interface ChipData {
  metric: string;
  windowLabel: string;
  fired: boolean;
  spark: number[];
}

function deriveChip(repo: Repo, key: ChannelKey): ChipData {
  const ps = repo.mentions?.perSource;
  const status = repo.channelStatus ?? null;

  if (key === "github") {
    const delta = repo.starsDelta24h ?? 0;
    const fired = delta > 0 || status?.github === true;
    return {
      metric: `${delta >= 0 ? "+" : ""}${formatNumber(delta)} stars`,
      windowLabel: "24h",
      fired,
      // Use the last 14 points of the repo sparkline so the chip's curve
      // matches the wider chart's recent shape.
      spark:
        Array.isArray(repo.sparklineData) && repo.sparklineData.length > 1
          ? repo.sparklineData.slice(-14)
          : [],
    };
  }

  // mentions.perSource carries count24h + count7d for the registry-style
  // sources. We render the 24h count as the headline and use count7d as a
  // single-point amplitude proxy for the inline spark when there's no
  // per-day breakdown.
  const sourceMap: Record<Exclude<ChannelKey, "github">, keyof NonNullable<Repo["mentions"]>["perSource"]> = {
    hackernews: "hackernews",
    reddit: "reddit",
    bluesky: "bluesky",
    devto: "devto",
  };
  const psKey = sourceMap[key];
  const c24 = ps?.[psKey]?.count24h ?? 0;
  const c7 = ps?.[psKey]?.count7d ?? 0;
  const fired =
    (key === "hackernews" && status?.hn === true) ||
    (key === "reddit" && status?.reddit === true) ||
    (key === "bluesky" && status?.bluesky === true) ||
    (key === "devto" && status?.devto === true) ||
    c24 > 0;

  // Synthetic 7-point spark: rises toward the count7d total.
  const spark =
    c7 > 0
      ? Array.from({ length: 7 }, (_, i) =>
          Math.round((c7 * (i + 1)) / 7),
        )
      : [];

  return {
    metric: c24 > 0 ? `${c24} posts` : `${c7} posts`,
    windowLabel: c24 > 0 ? "24h" : "7d",
    fired,
    spark,
  };
}

export function ChannelChipRow({ repo }: ChannelChipRowProps): JSX.Element {
  return (
    <div className="channel-chip-row" role="list" aria-label="Per-channel signal">
      {CHANNELS.map((ch) => {
        const data = deriveChip(repo, ch.key);
        const Icon = ch.icon;
        return (
          <div
            key={ch.key}
            role="listitem"
            className={`channel-chip ${data.fired ? "fired" : "quiet"}`}
            style={{ ["--ch-color" as string]: ch.color }}
          >
            <span className="ch-head">
              <span className="ch-ico" aria-hidden>
                <Icon size={14} />
              </span>
              <span className="ch-name">{ch.label}</span>
              <span className="ch-status">{data.fired ? "FIRING" : "QUIET"}</span>
            </span>
            <span className="ch-metric">
              <b>{data.metric}</b>
              <span className="ch-window">{data.windowLabel}</span>
            </span>
            {data.spark.length > 1 ? (
              <span className="ch-spark" aria-hidden>
                <Sparkline
                  data={data.spark}
                  width={120}
                  height={28}
                  positive={data.fired}
                />
              </span>
            ) : (
              <span className="ch-spark ch-spark-flat" aria-hidden />
            )}
          </div>
        );
      })}
      <style>{`
        .channel-chip-row {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }
        @media (max-width: 720px) {
          .channel-chip-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .channel-chip {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 10px 12px;
          border: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
          border-radius: 3px;
          background: var(--v3-bg-050, rgba(255,255,255,0.025));
          min-height: 86px;
          position: relative;
          overflow: hidden;
        }
        .channel-chip.fired {
          box-shadow: inset 2px 0 0 var(--ch-color);
        }
        .channel-chip.quiet { opacity: 0.72; }
        .ch-head {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--v3-ink-300, rgba(255,255,255,0.7));
        }
        .ch-ico {
          width: 14px;
          height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--ch-color);
        }
        .channel-chip.quiet .ch-ico { color: var(--v3-ink-400, rgba(255,255,255,0.45)); }
        .ch-name { flex: 1; color: var(--v3-ink-200, rgba(255,255,255,0.8)); }
        .ch-status {
          font-size: 9px;
          padding: 2px 6px;
          border-radius: 2px;
          letter-spacing: 0.12em;
          background: var(--v3-bg-100, rgba(255,255,255,0.05));
          color: var(--v3-ink-400);
        }
        .channel-chip.fired .ch-status {
          color: var(--ch-color);
          background: color-mix(in oklab, var(--ch-color) 18%, transparent);
        }
        .ch-metric {
          display: flex;
          align-items: baseline;
          gap: 6px;
          font-family: var(--font-geist-mono, monospace);
          font-size: 13px;
          color: var(--v3-ink-100, #fff);
        }
        .channel-chip.quiet .ch-metric { color: var(--v3-ink-300); }
        .ch-window {
          font-size: 10px;
          color: var(--v3-ink-400);
          text-transform: lowercase;
        }
        .ch-spark {
          margin-top: auto;
          display: block;
          height: 28px;
        }
        .ch-spark-flat {
          border-bottom: 1px dashed var(--v3-line-100);
          opacity: 0.4;
        }
        .ch-spark svg { display: block; width: 100%; height: 28px; }
      `}</style>
    </div>
  );
}

export default ChannelChipRow;
