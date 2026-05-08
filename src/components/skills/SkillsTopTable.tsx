"use client";

// /skills — rich table mirroring LiveTopTable. Compact rows (no description
// blob). AGN-536 (2026-05-04): the stars Δ (24h/7d/30d) and installs Δ
// (24h/7d/30d) columns rendered "—" for every row because the upstream
// snapshot pipelines aren't populated. Mirko called CUT (vs. BUILD) for
// /skills, so those six delta columns + the matching filters are removed.
// SkillRow props for the deltas remain so callers don't have to change
// shape; they're just unused by the renderer for now.

import { useMemo, useState } from "react";
import {
  Eye,
  GitCompareArrows,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

import { useCompareStore, useWatchlistStore } from "@/lib/store";
import {
  toastCompareAdded,
  toastCompareFull,
  toastCompareRemoved,
  toastWatchAdded,
  toastWatchRemoved,
} from "@/lib/toast";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { RankStarMark } from "@/components/brand/RankStarMark";

type SortKey = "rank" | "stars" | "cited";
type SortDir = "asc" | "desc";

export interface SkillRow {
  id: string;
  title: string;
  author: string | null;
  href: string;
  logoUrl: string | null;
  stars: number;
  starsDelta24h: number | null;
  starsDelta7d: number | null;
  starsDelta30d: number | null;
  installsDelta24h: number | null;
  installsDelta7d: number | null;
  installsDelta30d: number | null;
  cited: number;
  sparklineData: number[];
  /** Used by the Watch / Compare action buttons. */
  trackingId: string;
}

interface SkillsTopTableProps {
  rows: SkillRow[];
  /** Default sort = absolute stars (delta-based defaults removed in AGN-536). */
  defaultSortKey?: SortKey;
}

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
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

let __sgrad = 0;

function getSortValue(row: SkillRow, key: SortKey): number {
  switch (key) {
    case "stars":
      return row.stars;
    case "cited":
      return row.cited;
    case "rank":
    default:
      return row.stars;
  }
}

function compareNumeric(a: number, b: number, dir: SortDir): number {
  return dir === "asc" ? a - b : b - a;
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
  trackingId,
  name,
  stars,
}: {
  trackingId: string;
  name: string;
  stars: number;
}) {
  const isWatched = useWatchlistStore((s) =>
    s.repos.some((r) => r.repoId === trackingId),
  );
  const toggleWatch = useWatchlistStore((s) => s.toggleWatch);

  const isComparing = useCompareStore((s) => s.repos.includes(trackingId));
  const compareCount = useCompareStore((s) => s.repos.length);
  const addCompare = useCompareStore((s) => s.addRepo);
  const removeCompare = useCompareStore((s) => s.removeRepo);
  const compareDisabled = !isComparing && compareCount >= 4;

  const onToggleWatch = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const wasWatched = isWatched;
    toggleWatch(trackingId, stars);
    if (wasWatched) toastWatchRemoved(name);
    else toastWatchAdded(name);
  };

  const onToggleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isComparing) {
      removeCompare(trackingId);
      toastCompareRemoved(useCompareStore.getState().repos.length);
      return;
    }
    if (useCompareStore.getState().isFull()) {
      toastCompareFull();
      return;
    }
    addCompare(trackingId);
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
        title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
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
              ? "Remove from compare"
              : "Add to compare"
        }
        disabled={compareDisabled}
      >
        <GitCompareArrows size={14} strokeWidth={1.7} />
      </button>
    </td>
  );
}

const PAGE_SIZE = 50;

export function SkillsTopTable({
  rows,
  defaultSortKey = "stars",
}: SkillsTopTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<"all" | "cited">("all");
  // Pagination — 50/page is what users actually scan. The pre-fix table
  // dumped all ~1.8k rows into the DOM which dominated TTI.
  const [page, setPage] = useState(0);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  };

  const handleFilter = (next: "all" | "cited") => {
    setFilter(next);
    setPage(0);
  };

  const counts = useMemo(
    () => ({
      all: rows.length,
      cited: rows.filter((r) => r.cited > 0).length,
    }),
    [rows],
  );

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (filter === "cited") return r.cited > 0;
      return true;
    });
    return [...filtered].sort((a, b) =>
      compareNumeric(getSortValue(a, sortKey), getSortValue(b, sortKey), sortDir),
    );
  }, [rows, sortKey, sortDir, filter]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, safePage]);
  const rangeStart = sorted.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(sorted.length, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="live-top">
      <div className="live-top-filters" role="toolbar" aria-label="Filter skills">
        {(
          [
            ["all", "All", counts.all],
            ["cited", "Cited", counts.cited],
          ] as const
        ).map(([k, label, ct]) => (
          <button
            key={k}
            type="button"
            className={`fchip ${filter === k ? "on" : ""}`}
            onClick={() => handleFilter(k)}
          >
            {label} <span className="ct">{ct}</span>
          </button>
        ))}
        <span className="live-top-spacer" />
        <span className="live-top-meta">
          showing <b>{rangeStart}-{rangeEnd}</b> / {sorted.length}
          <span className="live-pip">live</span>
        </span>
      </div>

      <div className="table-scroll">
        <table className="tbl tbl-rich tbl-live tbl-skills">
          <thead>
            <tr>
              <th className="rk-h">#</th>
              <th>Skill</th>
              <SortHeader
                label="Stars"
                sortKey="stars"
                active={sortKey === "stars"}
                dir={sortDir}
                onClick={handleSort}
              />
              <th className="ch">Chart</th>
              <SortHeader
                label="Cited"
                sortKey="cited"
                active={sortKey === "cited"}
                dir={sortDir}
                onClick={handleSort}
              />
              <th className="actions-h" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row, idx) => {
              const stroke =
                (row.starsDelta24h ?? 0) < 0
                  ? "var(--sig-red)"
                  : "var(--sig-green)";
              const hasSparkline = row.sparklineData.length > 1;
              const d = sparkPath(row.sparklineData, 72, 24);
              const end = sparkEnd(row.sparklineData, 72, 24);
              const areaPath = `${d} L71,23 L1,23 Z`;
              const gid = `sks-${(__sgrad = (__sgrad + 1) % 1_000_000)}`;
              const rankCls =
                idx === 0
                  ? "rk-1"
                  : idx === 1
                    ? "rk-2"
                    : idx === 2
                      ? "rk-3"
                      : "";
              return (
                <tr key={row.id} className="live-row">
                  <td className={`rk-cell ${rankCls}`}>
                    {idx < 3 ? (
                      <span className="crown" aria-hidden>
                        <RankStarMark />
                      </span>
                    ) : null}
                    <span className="rk-n">
                      #{String(idx + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td>
                    <a className="repo-cell" href={row.href}>
                      <EntityLogo
                        src={row.logoUrl}
                        name={row.title}
                        size={28}
                      />
                      <span className="repo-txt">
                        <span>{row.title}</span>
                        {row.author ? <small>{row.author}</small> : null}
                      </span>
                    </a>
                  </td>
                  <td className="num">
                    {row.stars > 0 ? formatCompact(row.stars) : "—"}
                  </td>
                  <td className="ch">
                    {hasSparkline ? (
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
                        <circle cx={end.x} cy={end.y} r="1.6" fill={stroke} />
                      </svg>
                    ) : (
                      <span className="muted">NO SERIES</span>
                    )}
                  </td>
                  <td className="num">
                    {row.cited > 0 ? formatCompact(row.cited) : "—"}
                  </td>
                  <ActionCell
                    trackingId={row.trackingId}
                    name={row.title}
                    stars={row.stars}
                  />
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="live-empty">
                  No skills match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <nav className="skills-pager" aria-label="Skills pagination">
          <button
            type="button"
            className="skills-pager-btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            aria-label="Previous page"
          >
            ← prev
          </button>
          <span className="skills-pager-meta">
            page <b>{safePage + 1}</b> / {pageCount}
          </span>
          <button
            type="button"
            className="skills-pager-btn"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            aria-label="Next page"
          >
            next →
          </button>
        </nav>
      ) : null}
    </div>
  );
}
