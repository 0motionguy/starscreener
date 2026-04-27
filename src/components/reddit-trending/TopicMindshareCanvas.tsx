"use client";

// Client physics renderer for the topic mindshare map. Forked from
// BubbleMapCanvas but text-centered: cells show a topic phrase (up to 3
// words) and an upvote count, no avatars. Click a cell → add ?topic=X to
// URL so the feed below filters to posts containing that phrase.

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import type { BaselineTier } from "@/lib/reddit-baselines";
import { usePhysicsBubbles } from "@/hooks/usePhysicsBubbles";

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
  { tier: "breakout", label: "Breakout", color: "#f97316" },
  { tier: "above-average", label: "Above avg", color: "#22c55e" },
  { tier: "normal", label: "Normal", color: "#6b7280" },
  { tier: "no-baseline", label: "No baseline", color: "#94a3b8" },
];

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

  // Physics + pointer wiring lives in usePhysicsBubbles (UI-04). Click
  // toggles the ?topic=<phrase> URL param; clicking the active topic clears it.
  const {
    svgRef,
    groupRefs,
    draggingId,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = usePhysicsBubbles<TopicSeed>({
    seeds,
    width,
    height,
    onClick: (seed) => {
      const params = new URLSearchParams(searchParams.toString());
      if (activeTopic === seed.phrase) {
        params.delete("topic");
      } else {
        params.set("topic", seed.phrase);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
  });

  const bubbleElements = useMemo(() => {
    return seeds.map((s) => {
      const upvoteLabel = `▲ ${formatNumber(s.upvotes)}`;
      const showPhrase = s.r >= 26;
      const phraseFontSize = Math.max(9, Math.min(14, s.r * 0.18));
      const upvoteFontSize = Math.max(10, Math.min(18, s.r * 0.22));
      const maxPhraseChars = Math.max(8, Math.min(22, Math.round(s.r / 3.2)));
      const shortPhrase =
        s.phrase.length > maxPhraseChars
          ? `${s.phrase.slice(0, maxPhraseChars - 1)}…`
          : s.phrase;
      const isDragging = draggingId === s.id;
      const isActive = activeTopic === s.phrase;

      return (
        <g
          key={s.id}
          ref={(el) => {
            groupRefs.current[s.id] = el;
          }}
          transform={`translate(${s.cx} ${s.cy})`}
          onPointerDown={(e) => {
            e.preventDefault();
            handlePointerDown(e, s.id);
          }}
          style={{
            cursor: isDragging ? "grabbing" : "pointer",
            touchAction: "none",
          }}
          aria-label={`Topic "${s.phrase}" — ${s.upvotes} upvotes across ${s.postCount} posts (click to filter feed)`}
        >
          <circle r={Math.max(s.r, 22)} fill="transparent" />
          <circle
            r={s.r + (isDragging || isActive ? 10 : 4)}
            fill={s.glow}
            style={{ transition: "r 180ms ease-out" }}
          />
          <circle
            r={s.r}
            fill={`url(#tgrad-${s.id})`}
            stroke={isActive ? "#f6f9fc" : s.stroke}
            strokeWidth={isActive ? 2.5 : isDragging ? 2.25 : 1.5}
            style={{
              transition: "stroke-width 120ms ease-out",
              filter: isDragging
                ? "drop-shadow(0 6px 18px rgba(34,197,94,0.35))"
                : undefined,
            }}
          />
          {showPhrase && (
            <text
              x={0}
              y={-s.r * 0.12}
              textAnchor="middle"
              fill={s.textColor}
              fontSize={phraseFontSize}
              fontWeight={600}
              style={{
                fontFamily: "var(--font-mono)",
                letterSpacing: "-0.01em",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {shortPhrase}
            </text>
          )}
          <text
            x={0}
            y={showPhrase ? s.r * 0.32 : s.r * 0.1}
            textAnchor="middle"
            fill={s.textColor}
            fontSize={upvoteFontSize}
            fontWeight={700}
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {upvoteLabel}
          </text>
        </g>
      );
    });
  }, [seeds, draggingId, activeTopic, handlePointerDown]);

  return (
    <section
      aria-label="Topic mindshare map — drag to rearrange, click to filter feed"
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
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${seeds.length} trending topics by upvote mindshare`}
        className="block select-none"
        style={{
          aspectRatio: `${width} / ${height}`,
          touchAction: "none",
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          {seeds.map((s) => (
            <radialGradient
              key={`tg-${s.id}`}
              id={`tgrad-${s.id}`}
              cx="35%"
              cy="30%"
              r="75%"
            >
              <stop offset="0%" stopColor={s.fill} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.fill} stopOpacity={0.12} />
            </radialGradient>
          ))}
        </defs>
        {bubbleElements}
      </svg>
    </section>
  );
}
