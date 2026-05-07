"use client";

// Client renderer for the topic mindshare map — migrated from a custom
// physics-bubble canvas to ECharts treemap (charts pilot, 2026-05-07).
//
// Cells are trending TOPICS (n-gram phrases) extracted from post titles,
// sized by sum of trendingScore, colored by baseline tier.
// Click a cell → set ?topic=<phrase> on the URL so the feed filters.

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { EChartsCoreOption } from "echarts/core";
import { EChart } from "@/components/charts/EChart";
import { formatNumber } from "@/lib/utils";
import { CHART_TOKENS } from "@/lib/charts/theme";
import type { BaselineTier } from "@/lib/reddit-baselines";

export type TopicWindowKey = "24h" | "7d";

export interface TopicSeed {
  id: string;
  cx: number;
  cy: number;
  r: number;
  phrase: string;
  upvotes: number;
  postCount: number;
  tier: BaselineTier;
  dominantSub: string;
  postIds: string[];
  fill: string;
  stroke: string;
  glow: string;
  textColor: string;
}

export type TopicWindowSeedSet = Record<TopicWindowKey, TopicSeed[]>;

interface TopicMindshareCanvasProps {
  windows: TopicWindowSeedSet;
  width: number;
  height: number;
}

const WINDOW_TABS: Array<{ key: TopicWindowKey; label: string }> = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
];

const TIER_LEGEND: Array<{ tier: BaselineTier; label: string; color: string }> = [
  { tier: "breakout", label: "Breakout", color: "var(--v3-tier-breakout-fill)" },
  { tier: "above-average", label: "Above avg", color: "var(--v3-tier-heating-fill)" },
  { tier: "normal", label: "Normal", color: "var(--v3-tier-stable-fill)" },
  { tier: "no-baseline", label: "No baseline", color: "var(--v3-tier-dormant-fill)" },
];

interface TreemapDatum {
  name: string;
  value: number;
  seed?: TopicSeed;
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

function buildTopicTreemap(seeds: TopicSeed[]): TreemapDatum[] {
  return seeds.map((s) => ({
    name: s.phrase,
    // Cell area = upvote total (matches the prior bubble-size encoding).
    value: Math.max(1, s.upvotes),
    seed: s,
    itemStyle: {
      color: s.fill,
      borderColor: s.stroke,
      borderWidth: 1.5,
      gapWidth: 1,
    },
    label: {
      show: true,
      color: s.textColor,
      fontSize: 11,
      formatter: `{name|${s.phrase}}\n{val|▲ ${formatNumber(s.upvotes)}}`,
    },
  }));
}

export function TopicMindshareCanvas({
  windows,
  width,
  height,
}: TopicMindshareCanvasProps) {
  const defaultTab: TopicWindowKey =
    windows["24h"].length > 0 ? "24h" : "7d";
  const [activeTab, setActiveTab] = useState<TopicWindowKey>(defaultTab);

  const seeds = windows[activeTab];

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTopic = searchParams.get("topic");

  // Legend counts — by tier, not by sub (too many subs for a color key).
  const legendCounts = useMemo(() => {
    const counts = new Map<BaselineTier, number>();
    for (const s of seeds) {
      counts.set(s.tier, (counts.get(s.tier) ?? 0) + 1);
    }
    return TIER_LEGEND.map((entry) => ({
      ...entry,
      count: counts.get(entry.tier) ?? 0,
    })).filter((e) => e.count > 0);
  }, [seeds]);

  const option = useMemo<EChartsCoreOption>(() => {
    const data = buildTopicTreemap(seeds);
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
          return [
            `<div style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:${CHART_TOKENS.textDefault}">${s.phrase}</div>`,
            `<div style="font-family:var(--font-mono);font-size:11px;color:${CHART_TOKENS.textSubtle};margin-top:3px">▲ ${formatNumber(s.upvotes)} upvotes · ${s.postCount} posts</div>`,
            s.dominantSub
              ? `<div style="font-family:var(--font-mono);font-size:10px;color:${CHART_TOKENS.textFaint};margin-top:2px">mostly r/${s.dominantSub}</div>`
              : "",
            `<div style="font-family:var(--font-mono);font-size:10px;color:${CHART_TOKENS.textFaint};margin-top:6px;border-top:1px solid ${CHART_TOKENS.borderSubtle};padding-top:4px">click to filter feed</div>`,
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
      if (activeTopic === seed.phrase) {
        params2.delete("topic");
      } else {
        params2.set("topic", seed.phrase);
      }
      const qs = params2.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <section
      aria-label="Topic mindshare map — click a cell to filter feed"
      className="relative mb-4 v2-card/60 overflow-hidden"
    >
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-full border border-border-primary bg-bg-card/80 backdrop-blur-sm p-0.5 font-mono text-[11px]"
        role="tablist"
        aria-label="Time window"
      >
        {WINDOW_TABS.map((tab) => {
          const count = windows[tab.key].length;
          const active = activeTab === tab.key;
          const disabled = count === 0;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`Show ${tab.label} window (${count} topics)`}
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
      {legendCounts.length > 0 && (
        <div
          aria-label="Tier legend"
          className="pt-11 px-3 pb-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
        >
          {legendCounts.map((entry) => (
            <span
              key={entry.tier}
              className="inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-text-secondary">{entry.label}</span>
              <span className="tabular-nums text-text-muted">
                {entry.count}
              </span>
            </span>
          ))}
        </div>
      )}
      <div
        role="img"
        aria-label={`${seeds.length} trending topics by upvote mindshare`}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <EChart option={option} width="100%" height="100%" onReady={handleReady} />
      </div>
    </section>
  );
}
