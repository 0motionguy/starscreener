"use client";

// Client-side ECharts treemap for /mindshare.
//
// Migrated from a bespoke <canvas>/<svg> arc renderer to ECharts treemap via
// the shared <EChart> wrapper (charts pilot, 2026-05-07). The treemap's two-
// level hierarchy mirrors the previous visual semantic 1:1:
//
//   - Top-level cell  = one repo, sized by crossSignalScore² (matches the
//                       former bubble pack weighting in /mindshare/page.tsx)
//   - Child cells     = the 5 channels, sized by that channel's 24h mention
//                       share. Lit = firing per cross-signal scoring; dim =
//                       channel had mentions but isn't currently firing.
//
// Click a top-level cell → /repo/{owner}/{name}.
// Tooltip = per-channel breakdown (mention count + % share + firing badge).
//
// External props are unchanged so the server-rendered /mindshare page (and
// any preview snapshot) doesn't have to be touched.

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { EChartsCoreOption } from "echarts/core";
import { EChart } from "@/components/charts/EChart";
import {
  CHANNELS,
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  type BubbleRow,
  type Channel,
} from "./channels";

interface MindShareCanvasProps {
  rows: BubbleRow[];
  width: number;
  height: number;
  bgColor: string;
  bgTertiary: string;
  borderColor: string;
  textPrimaryColor: string;
  textTertiaryColor: string;
}

interface TreemapDatum {
  name: string;
  value: number;
  // Custom payload threaded through to tooltip + click handler.
  row?: BubbleRow;
  channel?: Channel;
  firing?: boolean;
  mentions?: number;
  pct?: number;
  itemStyle?: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    opacity?: number;
    gapWidth?: number;
  };
  upperLabel?: { show: boolean };
  label?: { show: boolean };
  children?: TreemapDatum[];
}

function fmtScore(s: number): string {
  return s.toFixed(2);
}

function buildTreemapData(rows: BubbleRow[]): TreemapDatum[] {
  return rows.map((row) => {
    // Top-level value matches the former bubble-pack weighting — the parent
    // page already squares crossSignalScore so the visual rank reads the
    // same as the prior bubble layout.
    const parentValue = Math.max(0.1, row.score) ** 2;
    const children: TreemapDatum[] = CHANNELS.map((c) => {
      const mentions = row.shares[c];
      const lit = row.firing[c];
      const pct =
        row.totalShare > 0 ? Math.round((mentions / row.totalShare) * 100) : 0;
      // Floor non-zero shares at a small fraction so a 1% channel still draws.
      // Channels with zero mentions get a hairline so the 5-channel identity
      // reads even when one source is silent.
      const value = mentions > 0 ? Math.max(mentions, 0.5) : 0.05;
      return {
        name: CHANNEL_LABELS[c],
        value,
        channel: c,
        firing: lit,
        mentions,
        pct,
        itemStyle: {
          color: CHANNEL_COLORS[c],
          opacity: lit ? 0.95 : 0.32,
          borderColor: "rgba(8,9,10,0.65)",
          borderWidth: 1,
        },
        // Children labels off — the parent label carries the repo name.
        label: { show: false },
      };
    });
    return {
      name: row.shortName,
      value: parentValue,
      row,
      // Reserve a header strip for the repo label + score.
      upperLabel: { show: true },
      itemStyle: {
        // Parent fill is neutral (bg-tertiary) so child colors carry the
        // channel identity. Stroke matches bubble border tone.
        color: "rgba(255,255,255,0.02)",
        borderColor: "rgba(34,42,50,0.85)",
        borderWidth: 1,
        gapWidth: 2,
      },
      children,
    };
  });
}

export function MindShareCanvas({
  rows,
  width,
  height,
  bgColor,
  bgTertiary,
  borderColor,
  textPrimaryColor,
  textTertiaryColor,
}: MindShareCanvasProps) {
  const router = useRouter();

  const option = useMemo<EChartsCoreOption>(() => {
    const data = buildTreemapData(rows);
    return {
      backgroundColor: bgColor,
      animationDuration: 0,
      animationDurationUpdate: 0,
      tooltip: {
        confine: true,
        backgroundColor: bgColor,
        borderColor,
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: textPrimaryColor, fontSize: 11 },
        extraCssText: "letter-spacing: 0.04em; box-shadow: none;",
        formatter: (params: unknown) => {
          const p = params as {
            data?: TreemapDatum;
            treePathInfo?: Array<{ name: string; dataIndex: number }>;
          };
          const datum = p.data;
          if (!datum) return "";
          // Drill through treePathInfo to find the parent row even when the
          // hovered node is a child channel.
          const path = p.treePathInfo ?? [];
          const rootIdx = path.length > 1 ? path[1]?.dataIndex : undefined;
          const row =
            datum.row ??
            (typeof rootIdx === "number" ? rows[rootIdx] : undefined);
          if (!row) return datum.name;
          const firingCount = Object.values(row.firing).filter(Boolean).length;
          const sorted = [...CHANNELS].sort(
            (a, b) => row.shares[b] - row.shares[a],
          );
          const lines = sorted.map((c) => {
            const mentions = row.shares[c];
            const pct =
              row.totalShare > 0
                ? Math.round((mentions / row.totalShare) * 100)
                : 0;
            const lit = row.firing[c];
            const swatch = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${lit ? CHANNEL_COLORS[c] : "transparent"};border:1px solid ${CHANNEL_COLORS[c]};opacity:${lit ? 1 : 0.5};margin-right:6px;vertical-align:middle"></span>`;
            return `<div style="display:flex;justify-content:space-between;gap:10px;font-family:var(--font-mono);font-size:11px"><span>${swatch}<span style="color:${textPrimaryColor}">${CHANNEL_LABELS[c]}</span></span><span style="color:${textTertiaryColor};font-variant-numeric:tabular-nums">${mentions} · ${pct}%</span></div>`;
          });
          return [
            `<div style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:${textPrimaryColor}">${row.fullName}</div>`,
            `<div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:${textTertiaryColor};margin-top:2px">score ${fmtScore(row.score)} · ${firingCount}/5 firing</div>`,
            `<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">${lines.join("")}</div>`,
            `<div style="margin-top:6px;padding-top:6px;border-top:1px solid ${borderColor};font-family:var(--font-mono);font-size:10px;color:${textTertiaryColor}">click to open repo</div>`,
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
          // Two levels — parent (repo) + child (channel).
          leafDepth: 2,
          // Squarify keeps cells closer to square — best for legibility.
          squareRatio: 1,
          upperLabel: {
            show: true,
            height: 22,
            color: textPrimaryColor,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            fontSize: 12,
            formatter: (item: { data?: TreemapDatum; name?: string }) => {
              const row = item.data?.row;
              if (!row) return item.name ?? "";
              return `${row.shortName}  ${fmtScore(row.score)}`;
            },
          },
          label: {
            show: false,
          },
          itemStyle: {
            borderColor,
            borderWidth: 1,
            gapWidth: 3,
          },
          levels: [
            {
              // Level 0 — root container; not actually rendered.
              itemStyle: { gapWidth: 4, borderColor, borderWidth: 0 },
            },
            {
              // Level 1 — repo cells. Neutral fill, channel children carry color.
              itemStyle: {
                color: bgTertiary,
                borderColor,
                borderWidth: 1,
                gapWidth: 2,
              },
              upperLabel: {
                show: true,
                height: 22,
                color: textPrimaryColor,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                fontSize: 12,
              },
              emphasis: {
                itemStyle: {
                  borderColor: textPrimaryColor,
                  borderWidth: 1.5,
                },
              },
            },
            {
              // Level 2 — channel cells.
              itemStyle: {
                borderColor: bgColor,
                borderWidth: 1,
                gapWidth: 1,
              },
              emphasis: {
                itemStyle: { borderColor: textPrimaryColor, borderWidth: 1 },
              },
            },
          ],
          data,
        },
      ],
    };
  }, [
    rows,
    bgColor,
    bgTertiary,
    borderColor,
    textPrimaryColor,
    textTertiaryColor,
  ]);

  const handleReady = (instance: import("echarts/core").ECharts) => {
    instance.off("click");
    instance.on("click", (params: unknown) => {
      const p = params as {
        data?: TreemapDatum;
        treePathInfo?: Array<{ name: string; dataIndex: number }>;
        seriesType?: string;
      };
      if (p.seriesType !== "treemap") return;
      const path = p.treePathInfo ?? [];
      const rootIdx = path.length > 1 ? path[1]?.dataIndex : undefined;
      const row =
        p.data?.row ??
        (typeof rootIdx === "number" ? rows[rootIdx] : undefined);
      if (!row) return;
      router.push(`/repo/${row.owner}/${row.name}`);
    });
  };

  return (
    <div className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
      <EChart
        option={option}
        height="100%"
        width="100%"
        ariaLabel="MindShare cross-source attention treemap"
        onReady={handleReady}
      />
    </div>
  );
}
