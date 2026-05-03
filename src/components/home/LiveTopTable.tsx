"use client";

import { useMemo, useState } from "react";
import {
  Eye,
  GitCompareArrows,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Brain,
  FileText,
  Package,
} from "lucide-react";

import {
  GithubIcon,
  HackerNewsIcon,
  RedditIcon,
  BlueskyIcon,
  DevtoIcon,
  LobstersIcon,
  XIcon,
} from "@/components/brand/BrandIcons";
import { useCompareStore, useWatchlistStore } from "@/lib/store";
import {
  toastCompareAdded,
  toastCompareFull,
  toastCompareRemoved,
  toastWatchAdded,
  toastWatchRemoved,
} from "@/lib/toast";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";
import type { Repo } from "@/lib/types";

type SortKey = "rank" | "stars" | "d24" | "d7" | "d30" | "forks" | "mentions";
type SortDir = "asc" | "desc";

interface CategoryFacet {
  id: string;
  label: string;
  count: number;
}

type LiveSourceKey =
  | "gh"
  | "hn"
  | "r"
  | "b"
  | "d"
  | "lobsters"
  | "x"
  | "npm"
  | "hf"
  | "arxiv";

interface LiveRow {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  href: string;
  categoryId: string;
  categoryLabel: string;
  language: string | null;
  stars: number;
  starsDelta24h: number;
  starsDelta7d: number;
  starsDelta30d: number;
  forks: number;
  sparklineData: number[];
  momentumScore: number;
  mentionCount24h: number;
  /** Per-source 24h count for tooltip + on/off state. Missing key = no signal. */
  sources: Partial<Record<LiveSourceKey, number>>;
}

// Wrap brand icons to swallow extra lucide props (className, strokeWidth) the
// shared icon-component shape passes through.
type IconCmp = (props: { size?: number; className?: string }) => React.ReactElement;
const NpmIcon: IconCmp = (p) => <Package {...p} />;
const HfIcon: IconCmp = (p) => <Brain {...p} />;
const ArxivIcon: IconCmp = (p) => <FileText {...p} />;

const ROW_SOURCE_ICONS = [
  { key: "gh", label: "GitHub", Icon: GithubIcon as IconCmp },
  { key: "x", label: "X / Twitter", Icon: XIcon as IconCmp },
  { key: "r", label: "Reddit", Icon: RedditIcon as IconCmp },
  { key: "hn", label: "Hacker News", Icon: HackerNewsIcon as IconCmp },
  { key: "b", label: "Bluesky", Icon: BlueskyIcon as IconCmp },
  { key: "d", label: "dev.to", Icon: DevtoIcon as IconCmp },
  { key: "lobsters", label: "Lobsters", Icon: LobstersIcon as IconCmp },
  { key: "npm", label: "npm", Icon: NpmIcon },
  { key: "hf", label: "HuggingFace", Icon: HfIcon },
  { key: "arxiv", label: "arXiv", Icon: ArxivIcon },
] as const satisfies ReadonlyArray<{
  key: LiveSourceKey;
  label: string;
  Icon: IconCmp;
}>;

interface LiveTopTableProps {
  rows: LiveRow[];
  categories: CategoryFacet[];
}

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function formatDelta(value: number): string {
  const abs = formatCompact(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${abs}`;
}

function formatPct(delta: number, base: number): string | null {
  if (base <= 0 || delta === 0) return null;
  const pct = Math.round((delta / Math.max(1, base - delta)) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

function sparkPath(values: number[], width: number, height: number): string {
  const points = values.length > 1 ? values : [1, 1];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  return points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// End-point coords used for the trailing dot in the area-fill spark.
function sparkEnd(
  values: number[],
  width: number,
  height: number,
): { x: number; y: number } {
  const points = values.length > 1 ? values : [1, 1];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const lastIdx = points.length - 1;
  const lastVal = points[lastIdx];
  const x = (lastIdx / Math.max(1, points.length - 1)) * (width - 2) + 1;
  const y = height - 2 - ((lastVal - min) / span) * (height - 4);
  return { x, y };
}

let __ltSparkGrad = 0;

function compareNumeric(a: number, b: number, dir: SortDir): number {
  return dir === "asc" ? a - b : b - a;
}

function getSortValue(row: LiveRow, key: SortKey): number {
  switch (key) {
    case "stars":
      return row.stars;
    case "d24":
      return row.starsDelta24h;
    case "d7":
      return row.starsDelta7d;
    case "d30":
      return row.starsDelta30d;
    case "forks":
      return row.forks;
    case "mentions":
      return row.mentionCount24h;
    case "rank":
    default:
      return row.momentumScore;
  }
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onClick,
  className = "num",
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  return (
    <th className={`${className} sortable ${active ? "active" : ""}`}>
      <button type="button" onClick={() => onClick(sortKey)}>
        <span>{label}</span>
        {active ? (
          dir === "desc" ? (
            <ArrowDown size={11} strokeWidth={2} />
          ) : (
            <ArrowUp size={11} strokeWidth={2} />
          )
        ) : (
          <ArrowUpDown size={11} strokeWidth={1.5} className="dim" />
        )}
      </button>
    </th>
  );
}

function ActionCell({
  repoId,
  repoName,
  stars,
}: {
  repoId: string;
  repoName: string;
  stars: number;
}) {
  const isWatched = useWatchlistStore((s) =>
    s.repos.some((r) => r.repoId === repoId),
  );
  const toggleWatch = useWatchlistStore((s) => s.toggleWatch);

  const isComparing = useCompareStore((s) => s.repos.includes(repoId));
  const compareCount = useCompareStore((s) => s.repos.length);
  const addCompare = useCompareStore((s) => s.addRepo);
  const removeCompare = useCompareStore((s) => s.removeRepo);
  const compareDisabled = !isComparing && compareCount >= 4;

  const onToggleWatch = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const wasWatched = isWatched;
    toggleWatch(repoId, stars);
    if (wasWatched) toastWatchRemoved(repoName);
    else toastWatchAdded(repoName);
  };

  const onToggleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isComparing) {
      removeCompare(repoId);
      toastCompareRemoved(useCompareStore.getState().repos.length);
      return;
    }
    if (useCompareStore.getState().isFull()) {
      toastCompareFull();
      return;
    }
    addCompare(repoId);
    toastCompareAdded(useCompareStore.getState().repos.length);
  };

  return (
    <td className="actions">
      <button
        type="button"
        className={`act-btn ${isWatched ? "on" : ""}`}
        onClick={onToggleWatch}
        aria-pressed={isWatched}
        aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
        title={isWatched ? "Remove from watchlist (W)" : "Add to watchlist (W)"}
      >
        <Eye size={14} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className={`act-btn ${isComparing ? "on" : ""}`}
        onClick={onToggleCompare}
        aria-pressed={isComparing}
        aria-disabled={compareDisabled}
        aria-label={
          isComparing
            ? "Remove from compare"
            : compareDisabled
              ? "Compare is full"
              : "Add to compare"
        }
        title={
          compareDisabled
            ? "Compare is full — remove one first"
            : isComparing
              ? "Remove from compare (C)"
              : "Add to compare (C)"
        }
        disabled={compareDisabled}
      >
        <GitCompareArrows size={14} strokeWidth={1.7} />
      </button>
    </td>
  );
}

export function LiveTopTable({ rows, categories }: LiveTopTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const visible = useMemo(() => {
    const filtered = activeCat
      ? rows.filter((r) => r.categoryId === activeCat)
      : rows;
    const sorted = [...filtered].sort((a, b) =>
      compareNumeric(getSortValue(a, sortKey), getSortValue(b, sortKey), sortDir),
    );
    return sorted;
  }, [rows, sortKey, sortDir, activeCat]);

  return (
    <div className="live-top">
      <div className="live-top-filters" role="toolbar" aria-label="Filter live top by category">
        <button
          type="button"
          className={`fchip ${activeCat === null ? "on" : ""}`}
          onClick={() => setActiveCat(null)}
        >
          All <span className="ct">{rows.length}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`fchip ${activeCat === c.id ? "on" : ""}`}
            onClick={() => setActiveCat(activeCat === c.id ? null : c.id)}
          >
            {c.label} <span className="ct">{c.count}</span>
          </button>
        ))}
        <span className="live-top-spacer" />
        <span className="live-top-meta">
          showing <b>{visible.length}</b> / {rows.length}
          <span className="live-pip">live</span>
        </span>
      </div>

      <div className="table-scroll">
        <table className="tbl tbl-rich tbl-live">
          <thead>
            <tr>
              <th className="rk-h">#</th>
              <th>Repo</th>
              <th className="mentions-h">Mentions</th>
              <SortHeader
                label="Stars"
                sortKey="stars"
                active={sortKey === "stars"}
                dir={sortDir}
                onClick={handleSort}
              />
              <SortHeader
                label="24h"
                sortKey="d24"
                active={sortKey === "d24"}
                dir={sortDir}
                onClick={handleSort}
              />
              <SortHeader
                label="7d"
                sortKey="d7"
                active={sortKey === "d7"}
                dir={sortDir}
                onClick={handleSort}
              />
              <SortHeader
                label="30d"
                sortKey="d30"
                active={sortKey === "d30"}
                dir={sortDir}
                onClick={handleSort}
              />
              <th className="ch">Chart</th>
              <SortHeader
                label="Forks"
                sortKey="forks"
                active={sortKey === "forks"}
                dir={sortDir}
                onClick={handleSort}
              />
              <th className="actions-h" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const pct24 = formatPct(row.starsDelta24h, row.stars);
              const pct7 = formatPct(row.starsDelta7d, row.stars);
              const pct30 = formatPct(row.starsDelta30d, row.stars);
              const rankCls =
                index === 0
                  ? "rk-1"
                  : index === 1
                    ? "rk-2"
                    : index === 2
                      ? "rk-3"
                      : "";
              return (
                <tr key={row.id} className="live-row">
                  <td className={`rk-cell ${rankCls}`}>
                    {index < 3 ? (
                      <span className="crown" aria-hidden>
                        ★
                      </span>
                    ) : null}
                    <span className="rk-n">
                      #{String(index + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td>
                    <a className="repo-cell" href={row.href}>
                      <EntityLogo
                        src={repoLogoUrl(row.fullName, 64)}
                        name={row.fullName}
                        size={28}
                      />
                      <span className="repo-txt">
                        <span>{row.fullName}</span>
                        <small>
                          {row.categoryLabel} / {row.language ?? "mixed"}
                        </small>
                      </span>
                    </a>
                  </td>
                  <td className="mentions-cell">
                    <span className="mentions-pills" aria-label="Source mentions">
                      {ROW_SOURCE_ICONS.map(({ key, label, Icon }) => {
                        const count = row.sources[key] ?? 0;
                        const fired = count > 0;
                        const tooltip = fired
                          ? `${label}: ${count} mention${count === 1 ? "" : "s"} (24h)`
                          : `${label}: no mentions`;
                        return (
                          <span
                            key={key}
                            className={`sd sd-${key} ${fired ? "on" : "off"}`}
                            title={tooltip}
                            aria-label={tooltip}
                          >
                            <Icon size={14} />
                          </span>
                        );
                      })}
                    </span>
                    <span className="mentions-count">
                      {formatCompact(row.mentionCount24h)}
                    </span>
                  </td>
                  <td className="num">{formatCompact(row.stars)}</td>
                  <td className={`num ${row.starsDelta24h < 0 ? "dn" : "up"}`}>
                    {formatDelta(row.starsDelta24h)}
                    {pct24 ? <small className="pct">{pct24}</small> : null}
                  </td>
                  <td className={`num ${row.starsDelta7d < 0 ? "dn" : "up"}`}>
                    {formatDelta(row.starsDelta7d)}
                    {pct7 ? <small className="pct">{pct7}</small> : null}
                  </td>
                  <td className={`num ${row.starsDelta30d < 0 ? "dn" : "up"}`}>
                    {formatDelta(row.starsDelta30d)}
                    {pct30 ? <small className="pct">{pct30}</small> : null}
                  </td>
                  <td className="ch">
                    {(() => {
                      const stroke =
                        row.starsDelta24h < 0
                          ? "var(--sig-red)"
                          : "var(--sig-green)";
                      const d = sparkPath(row.sparklineData, 72, 24);
                      const end = sparkEnd(row.sparklineData, 72, 24);
                      const areaPath = `${d} L71,23 L1,23 Z`;
                      const gid = `lts-${(__ltSparkGrad = (__ltSparkGrad + 1) % 1_000_000)}`;
                      return (
                        <svg
                          className="spark-row"
                          viewBox="0 0 72 24"
                          preserveAspectRatio="none"
                        >
                          <defs>
                            <linearGradient
                              id={gid}
                              x1="0"
                              x2="0"
                              y1="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor={stroke}
                                stopOpacity="0.42"
                              />
                              <stop
                                offset="60%"
                                stopColor={stroke}
                                stopOpacity="0.12"
                              />
                              <stop
                                offset="100%"
                                stopColor={stroke}
                                stopOpacity="0"
                              />
                            </linearGradient>
                          </defs>
                          <path d={areaPath} fill={`url(#${gid})`} />
                          <path
                            d={d}
                            fill="none"
                            stroke={stroke}
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                          <circle
                            cx={end.x}
                            cy={end.y}
                            r="3"
                            fill={stroke}
                            opacity="0.22"
                          />
                          <circle
                            cx={end.x}
                            cy={end.y}
                            r="1.6"
                            fill={stroke}
                          />
                        </svg>
                      );
                    })()}
                  </td>
                  <td className="num">{formatCompact(row.forks)}</td>
                  <ActionCell
                    repoId={row.id}
                    repoName={row.fullName}
                    stars={row.stars}
                  />
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="live-empty">
                  No repos match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { LiveRow, CategoryFacet };
