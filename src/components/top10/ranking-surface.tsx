"use client";

// Top10 ranking surface — ranking panel + filter row + rank rows + meta strip.
//
// Extracted from Top10Page.tsx (REFACTOR-4A / AGN-1390). This module owns the
// "ranking board" subtree: the framed ranked list with header, window/metric
// filter chips, per-row presentation (rank, avatar, body, score, delta), the
// empty-state row, and the meta strip beneath the list. Page-shell concerns
// (URL/state sync, category tabs, share surface, more-grid) stay in Top10Page.

import Link from "next/link";

import { Sparkline } from "@/components/shared/Sparkline";
import {
  TOP10_METRICS,
  TOP10_WINDOWS,
  type Top10Bundle,
  type Top10Category,
  type Top10Item,
  type Top10Metric,
  type Top10Window,
} from "@/lib/top10/types";

const METRIC_LABEL: Record<Top10Metric, string> = {
  "cross-signal": "CROSS-SIGNAL",
  stars: "STARS",
  mentions: "MENTIONS",
  velocity: "VELOCITY",
};

/**
 * Format a window key for display (YTD stays uppercase; other keys render
 * verbatim). Exported so non-ranking surfaces (more-grid, tweet text) can
 * share the same label without a separate util file.
 */
export function windowLabel(w: Top10Window): string {
  return w === "ytd" ? "YTD" : w;
}

// ---------------------------------------------------------------------------
// Ranking panel
// ---------------------------------------------------------------------------

interface RankingPanelProps {
  category: Top10Category;
  window: Top10Window;
  metric: Top10Metric;
  bundle: Top10Bundle;
  totalCount: number;
  onWindow: (w: Top10Window) => void;
  onMetric: (m: Top10Metric) => void;
}

export function RankingPanel({
  category,
  window,
  metric,
  bundle,
  totalCount,
  onWindow,
  onMetric,
}: RankingPanelProps) {
  return (
    <section
      className="flex flex-col min-w-0"
      style={{
        border: "1px solid var(--v3-line-200, #29323b)",
        background: "var(--v3-bg-025, #0b0d0f)",
      }}
    >
      <PanelHead
        title={`// TOP 10 · ${category.toUpperCase()}`}
        subtitle={`· LIVE · ${windowLabel(window).toUpperCase()} WINDOW`}
        right={
          totalCount > 0
            ? `${totalCount} ENTRIES`
            : "WAITING FOR FRESH DATA"
        }
      />
      <FilterRow
        category={category}
        window={window}
        metric={metric}
        supportedWindows={bundle.supportedWindows}
        onWindow={onWindow}
        onMetric={onMetric}
      />
      {bundle.items.length === 0 ? (
        <EmptyRows />
      ) : (
        <div>
          {bundle.items.map((item) => (
            <RankRow
              key={`${category}-${item.slug}`}
              item={item}
              category={category}
            />
          ))}
        </div>
      )}
      <RankingMetaStrip meta={bundle.meta} />
    </section>
  );
}

function PanelHead({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right: string;
}) {
  return (
    <div
      className="v2-mono flex items-center gap-2 px-3 py-2"
      style={{
        borderBottom: "1px solid var(--v3-line-200, #29323b)",
        fontSize: 10,
        letterSpacing: "0.20em",
        textTransform: "uppercase",
        color: "var(--v3-ink-300, #84909b)",
        background:
          "linear-gradient(180deg, var(--v3-bg-050, #101418), var(--v3-bg-025, #0b0d0f))",
      }}
    >
      <CornerDots />
      <span style={{ color: "var(--v3-ink-100, #eef0f2)", fontWeight: 600 }}>
        {title}
      </span>
      <span style={{ color: "var(--v3-ink-400, #909caa)" }}>{subtitle}</span>
      <span
        style={{
          marginLeft: "auto",
          color: "var(--v3-sig-green, #22c55e)",
        }}
      >
        {right}
      </span>
    </div>
  );
}

/**
 * Three-dot status decoration used as a bezel motif in panel heads. Exported
 * because the share-stack head (Top10Page) reuses it for visual symmetry.
 */
export function CornerDots() {
  return (
    <span className="flex gap-[3px] mr-1">
      <i
        style={{
          width: 4,
          height: 4,
          background: "var(--v2-acc, #f56e0f)",
          display: "block",
        }}
      />
      <i
        style={{
          width: 4,
          height: 4,
          background: "var(--v3-sig-green, #22c55e)",
          display: "block",
        }}
      />
      <i
        style={{
          width: 4,
          height: 4,
          background: "var(--v3-ink-300, #84909b)",
          display: "block",
        }}
      />
    </span>
  );
}

interface FilterRowProps {
  category: Top10Category;
  window: Top10Window;
  metric: Top10Metric;
  supportedWindows: Top10Window[];
  onWindow: (w: Top10Window) => void;
  onMetric: (m: Top10Metric) => void;
}

/**
 * Which metrics each category supports — only repo-derived categories carry
 * the per-window deltas that drive STARS / VELOCITY / MENTIONS sorting.
 * Non-repo readers ship a single signalScore and ignore other chips.
 */
const SUPPORTED_METRICS: Record<Top10Category, Top10Metric[]> = {
  repos: ["cross-signal", "stars", "mentions", "velocity"],
  agents: ["cross-signal", "stars", "mentions", "velocity"],
  movers: ["velocity"],
  llms: ["velocity"],
  mcps: ["velocity"],
  skills: ["velocity"],
  news: ["mentions"],
  funding: ["stars"],
};

function FilterRow({
  category,
  window,
  metric,
  supportedWindows,
  onWindow,
  onMetric,
}: FilterRowProps) {
  const supportedW = new Set(supportedWindows);
  const supportedM = new Set(SUPPORTED_METRICS[category]);
  return (
    <div
      className="flex gap-1.5 px-3 py-2 items-center flex-wrap"
      style={{
        borderBottom: "1px solid var(--v3-line-200, #29323b)",
        background: "var(--v3-bg-050, #101418)",
      }}
    >
      <ChipLabel>WINDOW</ChipLabel>
      {TOP10_WINDOWS.map((w) => (
        <Chip
          key={w}
          on={w === window}
          disabled={!supportedW.has(w)}
          onClick={() => supportedW.has(w) && onWindow(w)}
        >
          {w === "ytd" ? "YTD" : w.toUpperCase()}
        </Chip>
      ))}
      <span
        style={{
          width: 1,
          height: 18,
          background: "var(--v3-line-200, #29323b)",
          margin: "0 4px",
        }}
      />
      <ChipLabel>METRIC</ChipLabel>
      {TOP10_METRICS.map((m) => (
        <Chip
          key={m}
          on={m === metric}
          disabled={!supportedM.has(m)}
          onClick={() => supportedM.has(m) && onMetric(m)}
        >
          {METRIC_LABEL[m]}
        </Chip>
      ))}
    </div>
  );
}

function ChipLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="v2-mono"
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        color: "var(--v3-ink-400, #909caa)",
        textTransform: "uppercase",
        marginRight: 4,
      }}
    >
      {children}
    </span>
  );
}

function Chip({
  children,
  on,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  on?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className="v2-mono"
      style={{
        height: 24,
        padding: "0 9px",
        border: on
          ? "1px solid var(--v3-ink-100, #eef0f2)"
          : "1px solid var(--v3-line-300, #3a444f)",
        background: on
          ? "var(--v3-ink-100, #eef0f2)"
          : "var(--v3-bg-100, #151a20)",
        color: on
          ? "#08090a"
          : disabled
            ? "var(--v3-ink-500, #3c444d)"
            : "var(--v3-ink-300, #84909b)",
        fontSize: 9.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: on ? 700 : 400,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rank row
// ---------------------------------------------------------------------------

function RankRow({
  item,
  category,
}: {
  item: Top10Item;
  category: Top10Category;
}) {
  const isTop = item.rank <= 3;
  const railColor =
    item.rank === 1
      ? "#ffd24d"
      : item.rank === 2
        ? "#c0c5cc"
        : item.rank === 3
          ? "#cd7f32"
          : "transparent";
  const rankColor =
    item.rank === 1
      ? "#ffd24d"
      : item.rank === 2
        ? "#c0c5cc"
        : item.rank === 3
          ? "#cd7f32"
          : "var(--v3-ink-300, #84909b)";

  return (
    <Link
      href={item.href}
      target={item.href.startsWith("http") ? "_blank" : undefined}
      rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="block hover:bg-[var(--v3-bg-050,#101418)] relative cursor-pointer"
      style={{
        display: "grid",
        gridTemplateColumns: "44px 36px minmax(0,1fr) 120px 110px 24px",
        gap: 12,
        padding: "10px 14px",
        alignItems: "center",
        borderBottom: "1px solid var(--v3-line-100, #1b2229)",
      }}
    >
      {isTop && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: railColor,
          }}
        />
      )}
      <span
        className="font-display tabular-nums"
        style={{
          fontWeight: 600,
          fontSize:
            item.rank === 1
              ? 30
              : item.rank === 2
                ? 28
                : item.rank === 3
                  ? 26
                  : 24,
          color: rankColor,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          textAlign: "center",
        }}
      >
        {String(item.rank).padStart(2, "0")}
      </span>
      <Avatar item={item} />
      <Body item={item} category={category} />
      <Metric score={item.score} />
      <Delta delta={item.deltaPct} sparkline={item.sparkline} />
      <span
        className="text-center"
        style={{ color: "var(--v3-ink-500, #3c444d)" }}
      >
        →
      </span>
    </Link>
  );
}

function Avatar({ item }: { item: Top10Item }) {
  return (
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: 13,
        background: `linear-gradient(135deg, ${item.avatarGradient[0]}, ${item.avatarGradient[1]})`,
        flex: "none",
        fontFamily: "var(--font-display, system-ui)",
      }}
    >
      {item.avatarLetter}
    </span>
  );
}

function Body({ item, category }: { item: Top10Item; category: Top10Category }) {
  return (
    <span style={{ minWidth: 0, display: "block" }}>
      <span
        className="font-display"
        style={{
          fontSize: 14.5,
          color: "var(--v3-ink-000, #fff)",
          fontWeight: 500,
          letterSpacing: "-0.012em",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {item.owner ? (
          <>
            <span style={{ color: "var(--v3-ink-300, #84909b)", fontWeight: 400 }}>
              {item.owner}
            </span>
            <span style={{ color: "var(--v3-ink-500, #3c444d)" }}>/</span>
          </>
        ) : null}
        <span>{item.title}</span>
        {item.badges.map((b) => (
          <Badge key={b} kind={b} />
        ))}
      </span>
      <span
        className="font-display"
        style={{
          fontSize: 11.5,
          color: "var(--v3-ink-300, #84909b)",
          marginTop: 2,
          lineHeight: 1.4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 1,
          WebkitBoxOrient: "vertical",
        }}
      >
        {item.description}
      </span>
      <span style={{ display: "none" }}>{category}</span>
    </span>
  );
}

function Badge({ kind }: { kind: Top10Item["badges"][number] }) {
  const map: Record<
    Top10Item["badges"][number],
    { label: string; bg: string; color: string; border: string }
  > = {
    FIRING_5: {
      label: "5/5 FIRING",
      bg: "rgba(34,197,94,0.14)",
      color: "var(--v3-sig-green, #22c55e)",
      border: "rgba(34,197,94,0.4)",
    },
    FIRING_4: {
      label: "4/5 FIRING",
      bg: "rgba(34,197,94,0.10)",
      color: "var(--v3-sig-green, #22c55e)",
      border: "rgba(34,197,94,0.35)",
    },
    FIRING_3: {
      label: "3/5 FIRING",
      bg: "transparent",
      color: "var(--v3-ink-300, #84909b)",
      border: "var(--v3-line-300, #3a444f)",
    },
    NEW: {
      label: "NEW ENTRY",
      bg: "var(--v2-acc-soft, rgba(245,110,15,0.14))",
      color: "var(--v2-acc, #f56e0f)",
      border: "rgba(245,110,15,0.4)",
    },
    HOT: {
      label: "HOT",
      bg: "rgba(255,77,77,0.14)",
      color: "var(--v3-sig-red, #ff4d4d)",
      border: "rgba(255,77,77,0.4)",
    },
  };
  const t = map[kind];
  return (
    <span
      className="v2-mono"
      style={{
        height: 18,
        padding: "0 7px",
        fontSize: 9,
        letterSpacing: "0.14em",
        display: "inline-flex",
        alignItems: "center",
        textTransform: "uppercase",
        border: `1px solid ${t.border}`,
        color: t.color,
        background: t.bg,
      }}
    >
      {t.label}
    </span>
  );
}

function Metric({ score }: { score: number }) {
  return (
    <span
      className="v2-mono tabular-nums"
      style={{ textAlign: "right", display: "block" }}
    >
      <span
        style={{
          fontSize: 14,
          color: "var(--v3-ink-100, #eef0f2)",
          fontWeight: 600,
        }}
      >
        {score.toFixed(2)}
      </span>
      <span
        style={{
          display: "block",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--v3-ink-400, #909caa)",
          textTransform: "uppercase",
          marginTop: 1,
        }}
      >
        / 5.0
      </span>
    </span>
  );
}

function Delta({
  delta,
  sparkline,
}: {
  delta: number | undefined;
  sparkline: number[] | undefined;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <span
      className="v2-mono tabular-nums"
      style={{ textAlign: "right", display: "block" }}
    >
      <span
        style={{
          fontSize: 12.5,
          color:
            delta === undefined
              ? "var(--v3-ink-400, #909caa)"
              : positive
                ? "var(--v3-sig-green, #22c55e)"
                : "var(--v3-sig-red, #ff4d4d)",
          fontWeight: 600,
        }}
      >
        {delta === undefined
          ? "—"
          : `${positive ? "+" : ""}${delta.toFixed(0)}%`}
      </span>
      {sparkline && sparkline.length >= 2 && (
        <span style={{ display: "block", marginTop: 2 }}>
          <Sparkline
            data={sparkline}
            width={64}
            height={18}
            positive={positive}
          />
        </span>
      )}
      <span
        style={{
          display: "block",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--v3-ink-400, #909caa)",
          textTransform: "uppercase",
          marginTop: 1,
        }}
      >
        7D
      </span>
    </span>
  );
}

function EmptyRows() {
  return (
    <div
      className="v2-mono"
      style={{
        padding: "24px 14px",
        textAlign: "center",
        color: "var(--v3-ink-400, #909caa)",
        fontSize: 11,
        letterSpacing: "0.14em",
      }}
    >
      {"// no entries yet — check back after the next refresh"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta strip under the ranking
// ---------------------------------------------------------------------------

function RankingMetaStrip({ meta }: { meta: Top10Bundle["meta"] }) {
  const cells: Array<{
    lbl: string;
    v: string;
    sub?: string;
    sub_color?: string;
  }> = [
    {
      lbl: "Total movement",
      v: meta.totalMovement,
      sub: meta.totalMovementSub,
      sub_color: "var(--v3-sig-green, #22c55e)",
    },
    {
      lbl: "Mean score",
      v: meta.meanScore,
      sub: meta.meanScoreSub,
      sub_color: "var(--v3-sig-green, #22c55e)",
    },
    {
      lbl: "Hottest mover",
      v: meta.hottest,
      sub: meta.hottestSub,
      sub_color: "var(--v3-sig-green, #22c55e)",
    },
    {
      lbl: "Coldest mover",
      v: meta.coldest ?? "—",
      sub: meta.coldestSub,
      sub_color: meta.coldest ? "var(--v3-sig-red, #ff4d4d)" : undefined,
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        borderTop: "1px solid var(--v3-line-200, #29323b)",
      }}
    >
      {cells.map((c, i) => (
        <div
          key={i}
          style={{
            padding: "10px 14px",
            borderRight:
              i < cells.length - 1
                ? "1px solid var(--v3-line-200, #29323b)"
                : "none",
          }}
        >
          <div
            className="v2-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.20em",
              color: "var(--v3-ink-400, #909caa)",
              textTransform: "uppercase",
            }}
          >
            {c.lbl}
          </div>
          <div
            className="v2-mono tabular-nums"
            style={{
              fontSize: 14,
              color:
                c.lbl === "Coldest mover" && c.v !== "—"
                  ? "var(--v3-sig-red, #ff4d4d)"
                  : "var(--v3-ink-000, #fff)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {c.v}
          </div>
          {c.sub && (
            <div
              className="v2-mono"
              style={{
                fontSize: 9.5,
                color: c.sub_color ?? "var(--v3-ink-400, #909caa)",
                letterSpacing: "0.10em",
                marginTop: 2,
              }}
            >
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
