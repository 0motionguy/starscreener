"use client";

// Client renderer for the SUBREDDIT mindshare map — migrated from a custom
// physics-bubble canvas to ECharts treemap (charts pilot, 2026-05-07).
//
// Visual encoding:
//   cell size  ......... activity score (log10 by default, linear opt-in)
//   cell color ......... MOMENTUM tier (breakout / heating / stable / cooling)
//   border ............. breakout intensity (Reddit orange when ≥1 breakout)
//   click .............. set ?sub=<subreddit> on the URL (toggle off if active)
//
// External props (`windows`, `width`, `height`) are unchanged so the server
// component (SubredditMindshareMap) doesn't need to be touched.

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { EChartsCoreOption } from "echarts/core";
import { EChart } from "@/components/charts/EChart";
import { formatNumber } from "@/lib/utils";
import { CHART_TOKENS } from "@/lib/charts/theme";

export type SubredditWindowKey = "24h" | "7d";
export type ScaleMode = "log" | "linear";

export interface SubredditSeed {
  id: string;
  cx: number;
  cy: number;
  r: number;
  subreddit: string;
  activityScore: number;
  breakoutCount: number;
  aboveAvgCount: number;
  totalPosts: number;
  /** 24h activity / (7d activity / 7). 1 = stable, >1 = heating. */
  momentumRatio: number;
  /** Bubble fill — momentum-tier color (inner gradient stop). */
  fill: string;
  /** Outer gradient stop — gives the bubble real lift. */
  gradientEnd: string;
  /** Inner glow halo color. */
  glow: string;
  /** Ring stroke color — Reddit orange when breakouts present, else neutral. */
  stroke: string;
  /** Ring stroke width in px — 1/1.5/2 by breakout count. */
  strokeWidth: number;
  /** Bubble label text color. */
  textColor: string;
  /** Up to 3 top post titles for tooltip (already truncated to 60 chars). */
  topPostTitles: string[];
  /** 7-bin daily activity for tooltip sparkline (oldest → newest). */
  sparkline7d: number[];
}

export type SubredditWindowSeedSet = Record<
  SubredditWindowKey,
  { log: SubredditSeed[]; linear: SubredditSeed[] }
>;

interface SubredditMindshareCanvasProps {
  windows: SubredditWindowSeedSet;
  width: number;
  height: number;
}

const WINDOW_TABS: Array<{ key: SubredditWindowKey; label: string }> = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
];

const SCALE_TABS: Array<{ key: ScaleMode; label: string }> = [
  { key: "log", label: "LOG" },
  { key: "linear", label: "LIN" },
];

// Two-color legend — orange = breakout intensity, green = heating/stable
// momentum band. Used by the static legend pills at the top of the canvas.
const LEGEND_GREEN = "var(--v3-tier-heating-end)";
const LEGEND_ORANGE = "var(--v3-tier-breakout-end)";

interface TreemapDatum {
  name: string;
  value: number;
  seed?: SubredditSeed;
  itemStyle?: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    gapWidth?: number;
  };
  label?: {
    show?: boolean;
    color?: string;
    fontSize?: number;
    formatter?: string;
  };
}

function buildSubredditTreemap(seeds: SubredditSeed[]): TreemapDatum[] {
  return seeds.map((s) => ({
    name: `r/${s.subreddit}`,
    // Treemap value drives cell area. Fall back to 1 so seeds with 0 activity
    // (shouldn't happen — caller filters > 0) don't break the layout.
    value: Math.max(1, s.activityScore),
    seed: s,
    itemStyle: {
      // Tier fill — uses the momentum-tier CSS var so light themes can retune
      // the ramp. ECharts resolves the var via the canvas computedStyle path.
      color: s.fill,
      borderColor: s.stroke,
      borderWidth: s.strokeWidth,
      gapWidth: 1,
    },
    label: {
      show: true,
      color: s.textColor,
      fontSize: 11,
      // Inline formatter — name + activity stacked.
      formatter: `{name|r/${s.subreddit}}\n{val|${formatNumber(Math.round(s.activityScore))}${s.breakoutCount > 0 ? `  ▲ ${s.breakoutCount}` : ""}}`,
    },
  }));
}

export function SubredditMindshareCanvas({
  windows,
  width,
  height,
}: SubredditMindshareCanvasProps) {
  const defaultTab: SubredditWindowKey =
    windows["24h"].log.length > 0 ? "24h" : "7d";
  const [activeTab, setActiveTab] = useState<SubredditWindowKey>(defaultTab);
  // Log is the recommended default — solves the
  // r/ChatGPT-dwarfs-everything problem on the 7d window.
  const [scale, setScale] = useState<ScaleMode>("log");

  const seeds = windows[activeTab][scale];

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSub = searchParams.get("sub");

  // Legend counts — total breakout posts and above-avg posts visible across
  // all bubbles. Communicates "how much heat is on screen right now."
  const legendCounts = useMemo(() => {
    let breakoutPosts = 0;
    let aboveAvgPosts = 0;
    for (const s of seeds) {
      breakoutPosts += s.breakoutCount;
      aboveAvgPosts += s.aboveAvgCount;
    }
    return { breakoutPosts, aboveAvgPosts };
  }, [seeds]);

  const option = useMemo<EChartsCoreOption>(() => {
    const data = buildSubredditTreemap(seeds);
    return {
      animationDuration: 0,
      animationDurationUpdate: 0,
      backgroundColor: "transparent",
      tooltip: {
        confine: true,
        backgroundColor: CHART_TOKENS.bgCanvas,
        borderColor: CHART_TOKENS.borderDefault,
        borderWidth: 1,
        padding: [8, 10],
        textStyle: {
          color: CHART_TOKENS.textDefault,
          fontSize: 11,
          fontFamily: "var(--font-mono)",
        },
        extraCssText: "letter-spacing: 0.04em; box-shadow: none;",
        formatter: (params: unknown) => {
          const p = params as { data?: TreemapDatum };
          const s = p.data?.seed;
          if (!s) return "";
          const titleLines = s.topPostTitles
            .slice(0, 3)
            .map(
              (t) =>
                `<div style="color:${CHART_TOKENS.textSubtle};font-size:11px;line-height:1.45;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px">· ${t}</div>`,
            )
            .join("");
          return [
            `<div style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:${CHART_TOKENS.textDefault}">r/${s.subreddit}</div>`,
            `<div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:${CHART_TOKENS.textFaint};margin-top:2px">${formatNumber(Math.round(s.activityScore))} activity · ${s.momentumRatio.toFixed(2)}× vs 7d</div>`,
            `<div style="font-family:var(--font-mono);font-size:11px;color:${CHART_TOKENS.textSubtle};margin-top:4px">▲ ${s.breakoutCount} breakout · ${s.aboveAvgCount} above-avg · ${s.totalPosts} posts</div>`,
            titleLines
              ? `<div style="margin-top:6px;border-top:1px solid ${CHART_TOKENS.borderSubtle};padding-top:4px">${titleLines}</div>`
              : "",
          ].join("");
        },
      },
      series: [
        {
          type: "treemap",
          width: "100%",
          height: "100%",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          squareRatio: 1,
          // ECharts label format keys map to our formatter rich-text spec.
          label: {
            show: true,
            position: "insideTopLeft",
            distance: 6,
            color: CHART_TOKENS.textDefault,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            rich: {
              name: {
                color: CHART_TOKENS.textDefault,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                lineHeight: 14,
              },
              val: {
                color: CHART_TOKENS.textSubtle,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                lineHeight: 12,
              },
            },
          },
          // No upperLabel — single-level treemap (each cell is a sub).
          upperLabel: { show: false },
          itemStyle: {
            borderColor: CHART_TOKENS.borderSubtle,
            borderWidth: 1,
            gapWidth: 2,
          },
          emphasis: {
            itemStyle: {
              borderColor: CHART_TOKENS.textDefault,
              borderWidth: 1.5,
            },
            label: { show: true },
          },
          // Highlight the active sub via select state.
          select: {
            itemStyle: {
              borderColor: CHART_TOKENS.accent,
              borderWidth: 2.5,
            },
          },
          selectedMode: "single",
          levels: [
            {
              itemStyle: {
                borderColor: CHART_TOKENS.borderSubtle,
                borderWidth: 1,
                gapWidth: 2,
              },
            },
          ],
          data,
        },
      ],
    };
  }, [seeds]);

  const handleReady = (instance: import("echarts/core").ECharts) => {
    instance.off("click");
    instance.on("click", (params: unknown) => {
      const p = params as {
        data?: TreemapDatum;
        seriesType?: string;
      };
      if (p.seriesType !== "treemap") return;
      const seed = p.data?.seed;
      if (!seed) return;
      const params2 = new URLSearchParams(searchParams.toString());
      if (activeSub === seed.subreddit) {
        params2.delete("sub");
      } else {
        params2.set("sub", seed.subreddit);
      }
      const qs = params2.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <section
      aria-label="Subreddit mindshare map — click a cell to filter feed"
      className="relative mb-4 v2-card/60 overflow-hidden"
    >
      {/* Top-right control cluster: scale toggle + window toggle. */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 font-mono text-[11px]">
        <div
          className="flex items-center gap-0.5 rounded-full border border-border-primary bg-bg-card/80 backdrop-blur-sm p-0.5"
          role="tablist"
          aria-label="Size scale"
        >
          {SCALE_TABS.map((tab) => {
            const active = scale === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Use ${tab.label} bubble-size scale`}
                onClick={() => setScale(tab.key)}
                className={
                  "px-3 py-1 rounded-full transition-colors uppercase tracking-wider " +
                  (active
                    ? "bg-brand text-text-inverse font-semibold"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary")
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div
          className="flex items-center gap-0.5 rounded-full border border-border-primary bg-bg-card/80 backdrop-blur-sm p-0.5"
          role="tablist"
          aria-label="Time window"
        >
          {WINDOW_TABS.map((tab) => {
            const count = windows[tab.key].log.length;
            const active = activeTab === tab.key;
            const disabled = count === 0;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Show ${tab.label} window (${count} subreddits)`}
                disabled={disabled}
                onClick={() => setActiveTab(tab.key)}
                className={
                  "px-3 py-1 rounded-full transition-colors uppercase tracking-wider " +
                  (active
                    ? "bg-brand text-text-inverse font-semibold"
                    : disabled
                      ? "text-text-muted cursor-not-allowed"
                      : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary")
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        aria-label="Two-color legend"
        className="pt-11 px-3 pb-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
      >
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: LEGEND_ORANGE }}
          />
          <span className="text-text-secondary">Breakout</span>
          <span className="tabular-nums text-text-muted">
            {legendCounts.breakoutPosts}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: LEGEND_GREEN }}
          />
          <span className="text-text-secondary">Above avg</span>
          <span className="tabular-nums text-text-muted">
            {legendCounts.aboveAvgPosts}
          </span>
        </span>
      </div>
      <div
        role="img"
        aria-label={`${seeds.length} subreddits sized by activity, colored by momentum`}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <EChart option={option} width="100%" height="100%" onReady={handleReady} />
      </div>
    </section>
  );
}
