"use client";

// /skills — rich table mirroring LiveTopTable. Two metric groups per row:
//   Stars Δ (24h / 7d / 30d) — from the linked GitHub repo's trending data
//   Installs Δ (24h / 7d / 30d) — from skills.sh registry side-channel
// Both labeled, both sortable. Compact rows (no description blob).

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

type SortKey =
  | "rank"
  | "stars"
  | "s24"
  | "s7"
  | "s30"
  | "i24"
  | "i7"
  | "i30"
  | "cited";
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
  /** Default sort = highest 24h star gainer. */
  defaultSortKey?: SortKey;
}

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function formatDelta(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "0";
  const abs = formatCompact(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${abs}`;
}

function deltaClass(value: number | null): string {
  if (value === null || value === undefined || value === 0) return "muted";
  return value < 0 ? "dn" : "up";
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
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : -Infinity);
  switch (key) {
    case "stars":
      return row.stars;
    case "s24":
      return num(row.starsDelta24h);
    case "s7":
      return num(row.starsDelta7d);
    case "s30":
      return num(row.starsDelta30d);
    case "i24":
      return num(row.installsDelta24h);
    case "i7":
      return num(row.installsDelta7d);
    case "i30":
      return num(row.installsDelta30d);
    case "cited":
      return row.cited;
    case "rank":
    default:
      return num(row.starsDelta24h);
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

export function SkillsTopTable({
  rows,
  defaultSortKey = "s24",
}: SkillsTopTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<"all" | "stars" | "installs" | "cited">(
    "all",
  );

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const counts = useMemo(
    () => ({
      all: rows.length,
      stars: rows.filter(
        (r) =>
          (r.starsDelta24h ?? 0) !== 0 ||
          (r.starsDelta7d ?? 0) !== 0 ||
          (r.starsDelta30d ?? 0) !== 0,
      ).length,
      installs: rows.filter(
        (r) =>
          (r.installsDelta24h ?? 0) !== 0 ||
          (r.installsDelta7d ?? 0) !== 0 ||
          (r.installsDelta30d ?? 0) !== 0,
      ).length,
      cited: rows.filter((r) => r.cited > 0).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (filter === "stars")
        return (
          (r.starsDelta24h ?? 0) !== 0 ||
          (r.starsDelta7d ?? 0) !== 0 ||
          (r.starsDelta30d ?? 0) !== 0
        );
      if (filter === "installs")
        return (
          (r.installsDelta24h ?? 0) !== 0 ||
          (r.installsDelta7d ?? 0) !== 0 ||
          (r.installsDelta30d ?? 0) !== 0
        );
      if (filter === "cited") return r.cited > 0;
      return true;
    });
    return [...filtered].sort((a, b) =>
      compareNumeric(getSortValue(a, sortKey), getSortValue(b, sortKey), sortDir),
    );
  }, [rows, sortKey, sortDir, filter]);

  return (
    <div className="live-top">
      <div className="live-top-filters" role="toolbar" aria-label="Filter skills">
        {(
          [
            ["all", "All", counts.all],
            ["stars", "Has stars Δ", counts.stars],
            ["installs", "Has installs Δ", counts.installs],
            ["cited", "Cited", counts.cited],
          ] as const
        ).map(([k, label, ct]) => (
          <button
            key={k}
            type="button"
            className={`fchip ${filter === k ? "on" : ""}`}
            onClick={() => setFilter(k)}
          >
            {label} <span className="ct">{ct}</span>
          </button>
        ))}
        <span className="live-top-spacer" />
        <span className="live-top-meta">
          showing <b>{visible.length}</b> / {rows.length}
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
              <SortHeader
                label="★ 24h"
                sortKey="s24"
                active={sortKey === "s24"}
                dir={sortDir}
                onClick={handleSort}
              />
              <SortHeader
                label="★ 7d"
                sortKey="s7"
                active={sortKey === "s7"}
                dir={sortDir}
                onClick={handleSort}
              />
              <SortHeader
                label="★ 30d"
                sortKey="s30"
                active={sortKey === "s30"}
                dir={sortDir}
                onClick={handleSort}
              />
              <SortHeader
                label="⬇ 24h"
                sortKey="i24"
                active={sortKey === "i24"}
                dir={sortDir}
                onClick={handleSort}
              />
              <SortHeader
                label="⬇ 7d"
                sortKey="i7"
                active={sortKey === "i7"}
                dir={sortDir}
                onClick={handleSort}
              />
              <SortHeader
                label="⬇ 30d"
                sortKey="i30"
                active={sortKey === "i30"}
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
                        ★
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
                  <td className={`num ${deltaClass(row.starsDelta24h)}`}>
                    {formatDelta(row.starsDelta24h)}
                  </td>
                  <td className={`num ${deltaClass(row.starsDelta7d)}`}>
                    {formatDelta(row.starsDelta7d)}
                  </td>
                  <td className={`num ${deltaClass(row.starsDelta30d)}`}>
                    {formatDelta(row.starsDelta30d)}
                  </td>
                  <td className={`num ${deltaClass(row.installsDelta24h)}`}>
                    {formatDelta(row.installsDelta24h)}
                  </td>
                  <td className={`num ${deltaClass(row.installsDelta7d)}`}>
                    {formatDelta(row.installsDelta7d)}
                  </td>
                  <td className={`num ${deltaClass(row.installsDelta30d)}`}>
                    {formatDelta(row.installsDelta30d)}
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
                <td colSpan={12} className="live-empty">
                  No skills match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
