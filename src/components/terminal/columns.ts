// StarScreener — Terminal column definitions (single source of truth)
//
// Each column owns: id, label, width, align, sortable flag, sort extractor,
// render function (receives repo + row context), min breakpoint for
// responsive hiding, default visibility flags, optional sticky anchor,
// optional long description for the column picker tooltip.
//
// Renderers return React nodes built from shared primitives. Heavy layout
// decisions (row height, hover styles) live in TerminalRow, not here.

import type { ReactNode } from "react";
import { createElement } from "react";
import { ArrowLeftRight, Eye, GitFork, Star, Users, Zap } from "lucide-react";

import { CategoryPill } from "@/components/shared/CategoryPill";
import { MomentumBadge } from "@/components/shared/MomentumBadge";
import { RankBadge } from "@/components/shared/RankBadge";
import { Sparkline } from "@/components/shared/Sparkline";
import type { ColumnId, Repo } from "@/lib/types";
import {
  cn,
  formatNumber,
  getRelativeTime,
} from "@/lib/utils";

export type ColumnAlign = "left" | "right" | "center";
export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

export interface RowContext {
  rank: number;
  density: "compact" | "spacious";
  isWatched: boolean;
  isComparing: boolean;
  /** Compare store is full (4 repos) AND this row isn't one of them. */
  compareDisabled: boolean;
  onToggleWatch: () => void;
  onToggleCompare: () => void;
}

export interface Column {
  id: ColumnId;
  label: string;
  /** width in px; `0` means flex. */
  width: number;
  align: ColumnAlign;
  sortable: boolean;
  sortKey?: (r: Repo) => number | string;
  render: (r: Repo, ctx: RowContext) => ReactNode;
  minBreakpoint: Breakpoint;
  defaultVisible: boolean;
  compactVisible: boolean;
  sticky?: "left";
  description?: string;
}

/** Columns the user is never allowed to hide. */
export const REQUIRED_COLUMNS: ColumnId[] = ["rank", "repo"];

// ---------------------------------------------------------------------------
// Small render helpers
// ---------------------------------------------------------------------------

/** Compute a % delta against current star count; safe for zero-star repos. */
function pctOfStars(delta: number, stars: number): number {
  return stars > 0 ? (delta / stars) * 100 : 0;
}

/**
 * Freshness dot color tier based on age in days. Returns a Tailwind bg class.
 * <7d  → functional green
 * <30d → warning amber
 * <90d → text-tertiary grey
 * ≥90d → text-muted dim grey
 */
function freshnessDotClass(isoDate: string | null): string {
  if (!isoDate) return "bg-text-muted";
  const ageDays = (Date.now() - Date.parse(isoDate)) / 86_400_000;
  if (ageDays < 7) return "bg-functional";
  if (ageDays < 30) return "bg-warning";
  if (ageDays < 90) return "bg-text-tertiary";
  return "bg-text-muted";
}

function renderDash(): ReactNode {
  return createElement("span", { className: "text-text-muted" }, "—");
}

/**
 * Derive a rank-change indicator from the repo's current signals.
 *
 * The pipeline does not yet snapshot `previousRank` between recomputes,
 * so we synthesise a plausible movement from `movementStatus` + 7-day
 * star velocity. Hot/breakout → up, cooling/declining → down, stable
 * and quiet-killer → flat. Magnitude scales with raw 7d gain so repos
 * that actually moved a lot show larger arrows.
 */
function deriveRankChange(repo: Repo): number {
  const mag = Math.max(1, Math.round(Math.abs(repo.starsDelta7d) / 400));
  switch (repo.movementStatus) {
    case "breakout":
      return Math.max(2, mag);
    case "hot":
      return Math.max(1, mag);
    case "rising":
      return 1;
    case "cooling":
      return -1;
    case "declining":
      return -mag;
    case "quiet_killer":
    case "stable":
    default:
      return 0;
  }
}

/**
 * Stacked delta cell: big raw gain on top (e.g. "+780"), smaller
 * percent below (e.g. "+2.3%"). Green if positive, red if negative,
 * muted if zero. Mirrors Dexscreener's dual-metric density.
 *
 * `denominator` is the reference value the percent is computed against
 * (usually the total of the metric — stars for star deltas, forks for
 * fork deltas, contributors for contributor deltas).
 */
function renderStackedDelta(gain: number, denominator: number): ReactNode {
  const pct = denominator > 0 ? (gain / denominator) * 100 : 0;
  const colorClass =
    gain > 0
      ? "text-up"
      : gain < 0
        ? "text-down"
        : "text-text-tertiary";
  const sign = gain > 0 ? "+" : gain < 0 ? "" : "";
  const pctSign = pct > 0 ? "+" : pct < 0 ? "" : "";

  return createElement(
    "span",
    {
      className: cn(
        "inline-flex flex-col items-end leading-tight font-mono tabular-nums",
        colorClass,
      ),
    },
    createElement(
      "span",
      { className: "text-[13px] font-semibold" },
      `${sign}${formatNumber(gain)}`,
    ),
    createElement(
      "span",
      { className: "text-[10px] opacity-80" },
      `${pctSign}${pct.toFixed(1)}%`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Column definitions (15 total — per plan table)
// ---------------------------------------------------------------------------

export const COLUMNS: Column[] = [
  // --- rank ---------------------------------------------------------------
  {
    id: "rank",
    label: "#",
    width: 72,
    align: "center",
    sortable: true,
    sortKey: (r) => r.rank,
    minBreakpoint: "xs",
    defaultVisible: true,
    compactVisible: true,
    sticky: "left",
    description: "Position in the current sort order.",
    render: (repo, ctx) => {
      const isBreakout = repo.movementStatus === "breakout";
      const isTop3 = ctx.rank <= 3;
      const rankChange = deriveRankChange(repo);

      const rankEl = isTop3
        ? createElement(RankBadge, { rank: ctx.rank, size: "sm" })
        : createElement(
            "span",
            { className: "text-xs text-text-tertiary tabular-nums" },
            `#${ctx.rank}`,
          );

      const arrowEl =
        rankChange > 0
          ? createElement(
              "span",
              {
                className:
                  "inline-flex items-center gap-0.5 text-[9px] text-up font-mono tabular-nums leading-none",
                title: `Climbed ${rankChange} ${rankChange === 1 ? "position" : "positions"}`,
              },
              createElement(
                "span",
                { "aria-hidden": true, className: "text-[8px]" },
                "\u25B2",
              ),
              rankChange,
            )
          : rankChange < 0
            ? createElement(
                "span",
                {
                  className:
                    "inline-flex items-center gap-0.5 text-[9px] text-down font-mono tabular-nums leading-none",
                  title: `Dropped ${Math.abs(rankChange)} ${Math.abs(rankChange) === 1 ? "position" : "positions"}`,
                },
                createElement(
                  "span",
                  { "aria-hidden": true, className: "text-[8px]" },
                  "\u25BC",
                ),
                Math.abs(rankChange),
              )
            : null;

      return createElement(
        "span",
        {
          className:
            "relative inline-flex items-center justify-center gap-1.5 font-mono",
        },
        rankEl,
        arrowEl,
        isBreakout
          ? createElement(
              "span",
              {
                className:
                  "absolute -top-2 -right-1 rounded-sm bg-brand/90 px-1 py-[1px] text-[8px] font-bold uppercase tracking-widest text-white shadow-[0_0_8px_rgba(245,110,15,0.5)]",
                "aria-hidden": true,
              },
              "BRK",
            )
          : null,
      );
    },
  },

  // --- repo ---------------------------------------------------------------
  {
    id: "repo",
    label: "REPO",
    width: 0, // flex
    align: "left",
    sortable: true,
    sortKey: (r) => r.fullName,
    minBreakpoint: "xs",
    defaultVisible: true,
    compactVisible: true,
    description: "Avatar + owner/name + category + language.",
    render: (repo, ctx) => {
      const spacious = ctx.density === "spacious";
      return createElement(
        "div",
        {
          className: cn(
            "flex min-w-0 items-center gap-2.5 pl-2",
            ctx.isWatched &&
              "shadow-[inset_2px_0_0_var(--color-functional)]",
          ),
        },
        // Avatar
        createElement("img", {
          src: repo.ownerAvatarUrl,
          alt: "",
          width: 24,
          height: 24,
          loading: "lazy",
          className:
            "size-6 shrink-0 rounded-full border border-border-primary bg-bg-tertiary",
        }),
        // Right stack: line1 + optional line2 (spacious)
        createElement(
          "div",
          { className: "min-w-0 flex-1 overflow-hidden" },
          createElement(
            "div",
            { className: "flex min-w-0 items-center gap-2" },
            createElement(
              "span",
              {
                className:
                  "truncate font-semibold text-text-primary text-[13px] leading-tight",
              },
              repo.fullName,
            ),
            createElement(CategoryPill, {
              categoryId: repo.categoryId,
              size: "sm",
              className: "shrink-0",
            }),
            repo.language
              ? createElement(
                  "span",
                  {
                    className:
                      "inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-text-tertiary",
                  },
                  createElement("span", {
                    className: "size-1.5 shrink-0 rounded-full bg-info",
                    "aria-hidden": true,
                  }),
                  repo.language,
                )
              : null,
            // Forks + contributors inline — always visible, Dexscreener-density.
            createElement(
              "span",
              {
                className:
                  "inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] text-text-tertiary tabular-nums",
                title: `${repo.forks} forks`,
              },
              createElement(GitFork, {
                size: 10,
                className: "text-text-tertiary",
                "aria-hidden": true,
              }),
              formatNumber(repo.forks),
            ),
            createElement(
              "span",
              {
                className:
                  "inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] text-text-tertiary tabular-nums",
                title: `${repo.contributors} contributors`,
              },
              createElement(Users, {
                size: 10,
                className: "text-text-tertiary",
                "aria-hidden": true,
              }),
              formatNumber(repo.contributors),
            ),
          ),
          spacious && repo.description
            ? createElement(
                "p",
                {
                  className:
                    "mt-0.5 line-clamp-1 text-[11px] text-text-tertiary",
                },
                repo.description,
              )
            : null,
        ),
      );
    },
  },

  // --- momentum -----------------------------------------------------------
  {
    id: "momentum",
    label: "MOM",
    width: 64,
    align: "center",
    sortable: true,
    sortKey: (r) => r.momentumScore,
    minBreakpoint: "xs",
    defaultVisible: true,
    compactVisible: true,
    description: "Composite momentum score (0-100).",
    render: (repo) =>
      createElement(MomentumBadge, {
        score: repo.momentumScore,
        size: "sm",
      }),
  },

  // --- stars --------------------------------------------------------------
  {
    id: "stars",
    label: "STARS",
    width: 96,
    align: "right",
    sortable: true,
    sortKey: (r) => r.stars,
    minBreakpoint: "sm",
    defaultVisible: true,
    compactVisible: true,
    description: "Total stars.",
    render: (repo) =>
      createElement(
        "span",
        {
          className:
            "inline-flex items-center justify-end gap-1 font-mono tabular-nums text-text-primary",
        },
        createElement(Star, {
          size: 11,
          className: "text-warning shrink-0",
          "aria-hidden": true,
          fill: "currentColor",
        }),
        formatNumber(repo.stars),
      ),
  },

  // --- delta24h -----------------------------------------------------------
  {
    id: "delta24h",
    label: "24H ★",
    width: 84,
    align: "right",
    sortable: true,
    sortKey: (r) => r.starsDelta24h,
    minBreakpoint: "sm",
    defaultVisible: true,
    compactVisible: true,
    description: "Star change over the last 24 hours (raw + percent).",
    render: (repo) => renderStackedDelta(repo.starsDelta24h, repo.stars),
  },

  // --- delta7d ------------------------------------------------------------
  {
    id: "delta7d",
    label: "7D ★",
    width: 84,
    align: "right",
    sortable: true,
    sortKey: (r) => r.starsDelta7d,
    minBreakpoint: "md",
    defaultVisible: true,
    compactVisible: true,
    description: "Star change over the last 7 days (raw + percent).",
    render: (repo) => renderStackedDelta(repo.starsDelta7d, repo.stars),
  },

  // --- delta30d -----------------------------------------------------------
  {
    id: "delta30d",
    label: "30D ★",
    width: 84,
    align: "right",
    sortable: true,
    sortKey: (r) => r.starsDelta30d,
    minBreakpoint: "lg",
    defaultVisible: true,
    compactVisible: false,
    description: "Star change over the last 30 days (raw + percent).",
    render: (repo) => renderStackedDelta(repo.starsDelta30d, repo.stars),
  },

  // --- chart --------------------------------------------------------------
  {
    id: "chart",
    label: "CHART",
    width: 100,
    align: "center",
    sortable: false,
    minBreakpoint: "sm",
    defaultVisible: true,
    compactVisible: false,
    description: "30-day star sparkline.",
    render: (repo) =>
      createElement(
        "span",
        { className: "inline-flex items-center justify-center" },
        createElement(Sparkline, {
          data: repo.sparklineData,
          width: 88,
          height: 20,
          positive: repo.starsDelta7d >= 0,
        }),
      ),
  },

  // --- forks --------------------------------------------------------------
  {
    id: "forks",
    label: "FORKS",
    width: 72,
    align: "right",
    sortable: true,
    sortKey: (r) => r.forks,
    minBreakpoint: "lg",
    defaultVisible: true,
    compactVisible: false,
    description: "Fork count.",
    render: (repo) =>
      createElement(
        "span",
        { className: "font-mono tabular-nums text-text-secondary" },
        formatNumber(repo.forks),
      ),
  },

  // --- forksDelta7d -------------------------------------------------------
  {
    id: "forksDelta7d",
    label: "FORK 7D",
    width: 84,
    align: "right",
    sortable: true,
    sortKey: (r) => r.forksDelta7d,
    minBreakpoint: "xl",
    defaultVisible: false,
    compactVisible: false,
    description: "Fork growth over the last 7 days (raw + percent).",
    render: (repo) => renderStackedDelta(repo.forksDelta7d, repo.forks),
  },

  // --- contrib ------------------------------------------------------------
  {
    id: "contrib",
    label: "CONTRIB",
    width: 64,
    align: "right",
    sortable: true,
    sortKey: (r) => r.contributors,
    minBreakpoint: "xl",
    defaultVisible: false,
    compactVisible: false,
    description: "Distinct contributors.",
    render: (repo) => {
      const n = repo.contributors;
      const color =
        n >= 500
          ? "text-functional"
          : n >= 50
            ? "text-text-primary"
            : "text-text-secondary";
      return createElement(
        "span",
        { className: cn("font-mono tabular-nums", color) },
        formatNumber(n),
      );
    },
  },

  // --- contribDelta30d ----------------------------------------------------
  {
    id: "contribDelta30d",
    label: "CONTRIB 30D",
    width: 96,
    align: "right",
    sortable: true,
    sortKey: (r) => r.contributorsDelta30d,
    minBreakpoint: "xl",
    defaultVisible: false,
    compactVisible: false,
    description: "New contributors in the last 30 days (raw + percent).",
    render: (repo) =>
      renderStackedDelta(repo.contributorsDelta30d, repo.contributors),
  },

  // --- issues -------------------------------------------------------------
  {
    id: "issues",
    label: "ISSUES",
    width: 64,
    align: "right",
    sortable: true,
    sortKey: (r) => r.openIssues,
    minBreakpoint: "xl",
    defaultVisible: false,
    compactVisible: false,
    description: "Open issues.",
    render: (repo) => {
      const n = repo.openIssues;
      const color =
        n > 2000
          ? "text-down"
          : n > 500
            ? "text-warning"
            : "text-text-secondary";
      return createElement(
        "span",
        { className: cn("font-mono tabular-nums", color) },
        formatNumber(n),
      );
    },
  },

  // --- lastRelease --------------------------------------------------------
  {
    id: "lastRelease",
    label: "RELEASE",
    width: 96,
    align: "left",
    sortable: true,
    sortKey: (r) =>
      r.lastReleaseAt ? Date.parse(r.lastReleaseAt) : 0,
    minBreakpoint: "lg",
    defaultVisible: true,
    compactVisible: false,
    description: "Time since the last release.",
    render: (repo) => {
      if (!repo.lastReleaseAt) return renderDash();
      return createElement(
        "span",
        { className: "inline-flex items-center gap-1.5" },
        createElement("span", {
          className: cn(
            "size-1.5 shrink-0 rounded-full",
            freshnessDotClass(repo.lastReleaseAt),
          ),
          "aria-hidden": true,
        }),
        createElement(
          "span",
          { className: "font-mono text-[11px] text-text-tertiary" },
          getRelativeTime(repo.lastReleaseAt),
        ),
      );
    },
  },

  // --- lastCommit ---------------------------------------------------------
  {
    id: "lastCommit",
    label: "COMMIT",
    width: 96,
    align: "left",
    sortable: true,
    sortKey: (r) => (r.lastCommitAt ? Date.parse(r.lastCommitAt) : 0),
    minBreakpoint: "xl",
    defaultVisible: false,
    compactVisible: false,
    description: "Time since the last commit.",
    render: (repo) => {
      if (!repo.lastCommitAt) return renderDash();
      return createElement(
        "span",
        { className: "inline-flex items-center gap-1.5" },
        createElement("span", {
          className: cn(
            "size-1.5 shrink-0 rounded-full",
            freshnessDotClass(repo.lastCommitAt),
          ),
          "aria-hidden": true,
        }),
        createElement(
          "span",
          { className: "font-mono text-[11px] text-text-tertiary" },
          getRelativeTime(repo.lastCommitAt),
        ),
      );
    },
  },

  // --- buzz ---------------------------------------------------------------
  {
    id: "buzz",
    label: "BUZZ",
    width: 80,
    align: "right",
    sortable: true,
    sortKey: (r) => r.socialBuzzScore,
    minBreakpoint: "xl",
    defaultVisible: false,
    compactVisible: false,
    description: "Social buzz score + mention count (24h).",
    render: (repo) => {
      const isHot = repo.socialBuzzScore >= 70;
      return createElement(
        "div",
        { className: "inline-flex flex-col items-end leading-tight" },
        createElement(
          "span",
          {
            className: cn(
              "inline-flex items-center gap-0.5 font-mono tabular-nums text-[12px]",
              isHot ? "text-brand" : "text-text-primary",
            ),
          },
          isHot
            ? createElement(Zap, {
                size: 10,
                strokeWidth: 2.5,
                className: "shrink-0",
              })
            : null,
          repo.socialBuzzScore,
        ),
        createElement(
          "span",
          {
            className:
              "mt-0.5 font-mono tabular-nums text-[10px] text-text-tertiary",
          },
          `×${repo.mentionCount24h}`,
        ),
      );
    },
  },

  // --- actions ------------------------------------------------------------
  {
    id: "actions",
    label: "",
    width: 80,
    align: "right",
    sortable: false,
    minBreakpoint: "xs",
    defaultVisible: true,
    compactVisible: true,
    description: "Watch / compare.",
    render: (_repo, ctx) =>
      createElement(
        "div",
        {
          className: "inline-flex items-center justify-end gap-1",
          onClick: (e: React.MouseEvent) => e.stopPropagation(),
        },
        // Watch
        createElement(
          "button",
          {
            type: "button",
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              ctx.onToggleWatch();
            },
            "aria-pressed": ctx.isWatched,
            "aria-label": ctx.isWatched
              ? "Remove from watchlist"
              : "Add to watchlist",
            className: cn(
              "inline-flex size-6 items-center justify-center rounded hover:bg-bg-tertiary transition-colors",
              ctx.isWatched ? "text-functional" : "text-text-tertiary",
            ),
          },
          createElement(Eye, {
            size: 14,
            strokeWidth: 2,
            fill: ctx.isWatched ? "currentColor" : "none",
            className: "shrink-0",
          }),
        ),
        // Compare
        createElement(
          "button",
          {
            type: "button",
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              ctx.onToggleCompare();
            },
            "aria-pressed": ctx.isComparing,
            "aria-label": ctx.isComparing
              ? "Remove from compare"
              : ctx.compareDisabled
                ? "Compare is full"
                : "Add to compare",
            "aria-disabled": ctx.compareDisabled,
            title: ctx.compareDisabled
              ? "Compare is full — remove one first"
              : ctx.isComparing
                ? "Remove from compare"
                : "Add to compare",
            className: cn(
              "inline-flex size-6 items-center justify-center rounded transition-colors",
              ctx.isComparing
                ? "text-brand hover:bg-bg-tertiary"
                : ctx.compareDisabled
                  ? "text-text-muted opacity-50 cursor-not-allowed"
                  : "text-text-tertiary hover:bg-bg-tertiary",
            ),
          },
          createElement(ArrowLeftRight, {
            size: 14,
            strokeWidth: 2,
            className: "shrink-0",
          }),
        ),
      ),
  },
];

// Keyed lookup — handy for sort/visibility/columnpicker code paths.
export const COLUMNS_BY_ID: Record<ColumnId, Column> = COLUMNS.reduce(
  (acc, col) => {
    acc[col.id] = col;
    return acc;
  },
  {} as Record<ColumnId, Column>,
);
