"use client";

// Client-side physics renderer for the trending bubble map.
//
// Takes seed positions from the server-computed circle pack and runs a
// small verlet-ish integrator in a requestAnimationFrame loop. Bubbles
// repel pair-wise (soft collision resolve), drift slightly toward the
// canvas center, and bounce off the walls. Pointer-drag grabs the
// nearest bubble and fixes it; release imparts the pointer's velocity.
//
// The simulation writes `transform="translate(cx cy)"` directly on each
// <g> via refs — React state is only used for the dragging id so the
// 60fps loop stays outside the reconciler. Click-without-drag still
// navigates to the repo detail page.

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import { usePhysicsBubbles } from "@/hooks/usePhysicsBubbles";

// Stable lookup for the legend strip.
const CATEGORY_META = new Map(
  CATEGORIES.map((c) => [c.id, { name: c.shortName || c.name, color: c.color }]),
);

export type WindowKey = "24h" | "7d" | "30d";

export interface BubbleSeed {
  id: string;
  cx: number;
  cy: number;
  r: number;
  delta: number;
  /** Which window this seed was packed for. */
  deltaWindow: WindowKey;
  fullName: string;
  name: string;
  owner: string;
  avatarUrl: string;
  categoryId: string;
  fill: string;
  stroke: string;
  glow: string;
  textColor: string;
}

/** One pack per window — the canvas switches between them via tab state. */
export type WindowSeedSet = Record<WindowKey, BubbleSeed[]>;

interface BubbleMapCanvasProps {
  windows: WindowSeedSet;
  width: number;
  height: number;
}

const WINDOW_TABS: Array<{ key: WindowKey; label: string }> = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

export function BubbleMapCanvas({ windows, width, height }: BubbleMapCanvasProps) {
  const router = useRouter();
  // Default to the first window that has any bubbles, so the map never
  // opens on an empty canvas.
  const defaultTab: WindowKey =
    windows["24h"].length > 0
      ? "24h"
      : windows["7d"].length > 0
        ? "7d"
        : "30d";
  const [activeTab, setActiveTab] = useState<WindowKey>(defaultTab);

  const seeds = windows[activeTab];

  // Legend = unique categoryIds present in the current view, sorted by
  // how many bubbles each category contributes (biggest slice first).
  // Rendered under the tabs so the color code is self-documenting.
  const legendEntries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of seeds) {
      counts.set(s.categoryId, (counts.get(s.categoryId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => {
        const meta = CATEGORY_META.get(id);
        return {
          id,
          count,
          name: meta?.name ?? id,
          color: meta?.color ?? "#22c55e",
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [seeds]);

  // Physics + pointer wiring lives in usePhysicsBubbles (UI-04). Click
  // navigates to the repo detail page; tab switch snaps to the new layout
  // via the hook's default reset.
  const {
    svgRef,
    groupRefs,
    draggingId,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = usePhysicsBubbles<BubbleSeed>({
    seeds,
    width,
    height,
    onClick: (seed) => {
      router.push(`/repo/${seed.owner}/${seed.name}`);
    },
  });

  const bubbleElements = useMemo(() => {
    return seeds.map((s) => {
      // Label is "+N" for 24h, "+N/7d" or "+N/30d" otherwise so the user
      // always knows what window the number represents.
      // Tab state enforces one window at a time — label is always
      // just "+N" without a window suffix.
      const deltaLabel = `+${formatNumber(s.delta)}`;
      // Even the smallest pack bubbles now fit a short truncated name,
      // so the map is legible at a glance without hovering. Avatar is
      // still avatar-sized-down on anything under r=24.
      const showAvatar = s.r >= 24;
      const showName = s.r >= 18;
      const avatarSize = Math.min(30, Math.max(12, s.r * 0.36));
      const deltaFontSize = Math.max(9, Math.min(22, s.r * 0.3));
      const nameFontSize = Math.max(8, Math.min(13, s.r * 0.2));
      // Truncation length scales with bubble radius — tiny bubbles get a
      // tight 6-char cut, larger ones show up to 14.
      const maxNameChars = Math.max(6, Math.min(14, Math.round(s.r / 5.5)));
      const shortName =
        s.name.length > maxNameChars
          ? `${s.name.slice(0, maxNameChars - 1)}…`
          : s.name;
      const isDragging = draggingId === s.id;

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
            cursor: isDragging ? "grabbing" : "grab",
            touchAction: "none",
          }}
          aria-label={`${s.fullName} gained ${deltaLabel} stars over ${s.deltaWindow} (click or drag)`}
          className="v2-bubble"
        >
          {/* Invisible oversize hit target so tiny bubbles still grab easily */}
          <circle r={Math.max(s.r, 20)} fill="transparent" />
          {/* Ambient glow — V2 accent-soft on active, otherwise no halo
              (the V2 surface is intentionally quiet; identity belongs to
              the legend strip, not the bubble fill). */}
          {isDragging && (
            <circle
              r={s.r + 10}
              fill="var(--v2-acc-soft)"
              style={{ transition: "r 180ms ease-out" }}
            />
          )}
          {/* Disk — uniform V2 neutral fill, V2 line stroke; active gets
              an orange accent stroke + glow. Hover variant flips to
              var(--v2-bg-300) via the .v2-bubble:hover rule below. */}
          <circle
            className="v2-bubble-disk"
            r={s.r}
            fill={isDragging ? "var(--v2-bg-300)" : "var(--v2-bg-200)"}
            stroke={isDragging ? "var(--v2-acc)" : "var(--v2-line-300)"}
            strokeWidth={isDragging ? 1.5 : 1}
            style={{
              transition:
                "fill 120ms ease-out, stroke 120ms ease-out, stroke-width 120ms ease-out",
              filter: isDragging
                ? "drop-shadow(0 0 12px var(--v2-acc-glow))"
                : undefined,
            }}
          />
          {/* Avatar */}
          {showAvatar && s.avatarUrl && (
            <image
              href={s.avatarUrl}
              x={-avatarSize / 2}
              y={-s.r * 0.34 - avatarSize / 2}
              width={avatarSize}
              height={avatarSize}
              clipPath={`url(#bclip-${s.id})`}
              preserveAspectRatio="xMidYMid slice"
              style={{ pointerEvents: "none" }}
            />
          )}
          {/* Repo name */}
          {showName && (
            <text
              x={0}
              y={s.r * 0.05}
              textAnchor="middle"
              fill="var(--v2-ink-100)"
              fontSize={nameFontSize}
              fontWeight={500}
              style={{
                fontFamily:
                  "var(--font-geist-mono), var(--font-jetbrains-mono), monospace",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {shortName}
            </text>
          )}
          {/* Delta */}
          <text
            x={0}
            y={showName ? s.r * 0.36 : s.r * 0.12}
            textAnchor="middle"
            fill={isDragging ? "var(--v2-acc)" : "var(--v2-ink-200)"}
            fontSize={deltaFontSize}
            fontWeight={600}
            style={{
              fontFamily:
                "var(--font-geist-mono), var(--font-jetbrains-mono), monospace",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.02em",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {deltaLabel}
          </text>
        </g>
      );
    });
  }, [seeds, draggingId, handlePointerDown]);

  // Top spider-strip stats — Node/01-flavored mono labels with arrows.
  // The dominant category (first legendEntry) drives the `category=` field;
  // 24h delta sum drives the `Δ` field so the strip reads as a live
  // telemetry banner above the map.
  const topCategory = legendEntries[0];
  const totalDelta = seeds.reduce((sum, s) => sum + s.delta, 0);
  const momentum =
    seeds.length >= 80 ? "hot" : seeds.length >= 30 ? "warm" : "cold";
  const totalDeltaLabel = `${totalDelta >= 0 ? "+" : ""}${formatNumber(totalDelta)}`;

  return (
    <section
      aria-label="Trending bubble map — drag to rearrange, click to open"
      className="relative select-none"
      style={{ background: "var(--bg-025)" }}
    >
      {/* Spider-strip — mono telemetry above the map, mirrors Node/01's
          `tags → key=value` pattern from SignalRadarV2. Border-bottom
          uses var(--v2-line-200) per spec. */}
      <div
        aria-label="Radar telemetry"
        className="chart-toggle"
        style={{
          borderBottom: "1px solid var(--v2-line-200)",
          fontFamily:
            "var(--font-geist-mono), var(--font-jetbrains-mono), monospace",
          fontSize: 10,
          letterSpacing: "var(--v2-tracking-mono-tight)",
          textTransform: "uppercase",
          color: "var(--v2-ink-300)",
        }}
      >
        <span className="whitespace-nowrap">
          <span aria-hidden>tags </span>
          <span aria-hidden style={{ color: "var(--v2-ink-400)" }}>→ </span>
          <span style={{ color: "var(--v2-ink-100)" }}>
            category={topCategory ? topCategory.id : "ai"}
          </span>
        </span>
        <span aria-hidden style={{ color: "var(--v2-line-300)" }}>·</span>
        <span className="whitespace-nowrap">
          <span aria-hidden style={{ color: "var(--v2-ink-400)" }}>→ </span>
          <span style={{ color: "var(--v2-ink-100)" }}>
            momentum={momentum}
          </span>
        </span>
        <span aria-hidden style={{ color: "var(--v2-line-300)" }}>·</span>
        <span className="whitespace-nowrap">
          <span aria-hidden style={{ color: "var(--v2-ink-400)" }}>→ </span>
          <span
            className="tabular-nums"
            style={{ color: "var(--v2-acc)" }}
          >
            {activeTab} Δ={totalDeltaLabel}
          </span>
        </span>
        <span
          aria-hidden
          style={{ color: "var(--v2-line-300)", marginLeft: "auto" }}
        >
          ·
        </span>
        {/* Window tabs — pulled inline into the strip so the canvas keeps
            its full height. Mono buttons matching Node/01 chrome. */}
        <div
          className="flex items-center gap-1"
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
                aria-label={`Show ${tab.label} window (${count} repos)`}
                disabled={disabled}
                onClick={() => setActiveTab(tab.key)}
                className={active ? "tg on tabular-nums" : "tg tabular-nums"}
                style={{
                  fontFamily:
                    "var(--font-geist-mono), var(--font-jetbrains-mono), monospace",
                  fontSize: 10,
                  letterSpacing: "var(--v2-tracking-mono)",
                  textTransform: "uppercase",
                  border: "1px solid",
                  borderColor: active
                    ? "var(--v2-acc)"
                    : "var(--v2-line-200)",
                  color: active
                    ? "var(--v2-acc)"
                    : disabled
                      ? "var(--v2-ink-500)"
                      : "var(--v2-ink-200)",
                  background: active ? "var(--v2-acc-soft)" : "transparent",
                  cursor: disabled ? "not-allowed" : "pointer",
                  borderRadius: 2,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Canvas wrapper — dot-field background sits behind the SVG. */}
      <div
        className="map-wrap"
        style={{
          background: "var(--v2-bg-000)",
          backgroundImage:
            "radial-gradient(var(--v2-dot) 0.7px, transparent 0.7px)",
          backgroundSize: "14px 14px",
          backgroundPosition: "0 0",
        }}
      >
        {/* Category legend — V2-themed, sits below the strip. Uses the
            category color as a swatch (only place tied to category hue);
            counts in tabular-nums for tidy wraps. */}
        {legendEntries.length > 0 && (
          <div
            aria-label="Category legend"
            className="map-legend px-0 pt-0"
            style={{
              fontFamily:
                "var(--font-geist-mono), var(--font-jetbrains-mono), monospace",
              fontSize: 10,
              letterSpacing: "var(--v2-tracking-mono-tight)",
              textTransform: "uppercase",
              color: "var(--v2-ink-300)",
            }}
          >
            {legendEntries.map((entry, i) => (
              <span
                key={entry.id}
                className="inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {i > 0 ? (
                  <span
                    aria-hidden
                    style={{ color: "var(--v2-line-200)", marginRight: 6 }}
                  >
                    |
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  className="inline-block w-2 h-2"
                  style={{ backgroundColor: entry.color, borderRadius: 1 }}
                />
                <span style={{ color: "var(--v2-ink-200)" }}>{entry.name}</span>
                <span
                  className="tabular-nums"
                  style={{ color: "var(--v2-ink-400)" }}
                >
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
          aria-label={`${seeds.length} trending repos by ${activeTab} star gain — drag any bubble to rearrange`}
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
            {seeds.map((s) => {
              const avatarSize = Math.min(30, Math.max(14, s.r * 0.38));
              return (
                <clipPath key={`clip-${s.id}`} id={`bclip-${s.id}`}>
                  <circle cx={0} cy={-s.r * 0.34} r={avatarSize / 2} />
                </clipPath>
              );
            })}
          </defs>
          {/* Hover swap: idle bubbles flip from var(--v2-bg-200) to
              var(--v2-bg-300) on hover. Inline so we don't grow the
              global stylesheet for one component. */}
          <style>{`.v2-bubble:hover .v2-bubble-disk{fill:var(--v2-bg-300);stroke:var(--v2-line-400);}`}</style>
          {bubbleElements}
        </svg>
        <div
          className="map-stats"
          style={{ "--chart-stat-columns": 4 } as CSSProperties}
        >
          <div>
            <div className="lbl">Window</div>
            <div className="val">{activeTab}</div>
            <div className="sub">Live range</div>
          </div>
          <div>
            <div className="lbl">Nodes</div>
            <div className="val">{formatNumber(seeds.length)}</div>
            <div className="sub">Visible repos</div>
          </div>
          <div>
            <div className="lbl">Momentum</div>
            <div className="val">{momentum}</div>
            <div className="sub">Field state</div>
          </div>
          <div>
            <div className="lbl">Delta</div>
            <div className="val">{totalDeltaLabel}</div>
            <div className="sub">Stars gained</div>
          </div>
        </div>
        {/* Bottom legend — scale label + horizontal gradient bar showing
            the small→large bubble mapping (delta → radius, log-scaled
            upstream by the circle-pack). Mirrors the spec's
            `// SCALE · LOG(...)` callout. */}
        <div
          className="flex items-center gap-3 px-3 py-2"
          style={{
            borderTop: "1px solid var(--v2-line-200)",
            fontFamily:
              "var(--font-geist-mono), var(--font-jetbrains-mono), monospace",
            fontSize: 10,
            letterSpacing: "var(--v2-tracking-mono)",
            textTransform: "uppercase",
            color: "var(--v2-ink-300)",
          }}
        >
          <span style={{ color: "var(--v2-ink-300)" }}>
            <span aria-hidden>{"// "}</span>
            SCALE · LOG(STARS_{activeTab.toUpperCase()})
          </span>
          <div
            aria-hidden
            className="flex-1 h-1.5"
            style={{
              background:
                "linear-gradient(to right, var(--v2-line-200), var(--v2-line-300) 30%, var(--v2-acc-dim) 75%, var(--v2-acc) 100%)",
              borderRadius: 1,
            }}
          />
          <span
            className="tabular-nums"
            style={{ color: "var(--v2-ink-400)" }}
          >
            min
          </span>
          <span
            className="tabular-nums"
            style={{ color: "var(--v2-acc)" }}
          >
            max
          </span>
        </div>
      </div>
    </section>
  );
}
