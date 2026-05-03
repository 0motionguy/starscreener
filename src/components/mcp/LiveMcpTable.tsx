"use client";

// MCP equivalent of `LiveTopTable` ([components/home/LiveTopTable.tsx]).
// Same multi-column shape (rank · entity · mentions · usage · 24h · 7d ·
// 30d · sparkline) reusing the existing `.tbl-rich` / `.tbl-live` /
// `.live-top` / `.fchip` / `.spark-row` CSS so visual fidelity matches the
// homepage's "Live / top 50" board without new styles.
//
// Differences from LiveTopTable:
//   - Mentions column shows the four MCP registries (Smithery / Glama /
//     PulseMCP / Official) as letter monograms.
//   - No FORKS / Actions columns (don't apply to MCPs in v1).
//   - Sort defaults to `d24` desc — sortable column headers replace the
//     old window-tab strip.
//   - Cold-start banner when no row has 24h Δ yet (snapshots accrue daily).
//   - 24h/7d/30d delta columns: prefer MCP installs deltas from the
//     registries; when they're cold (a snapshot hasn't accrued yet) we
//     fall back to linked GitHub-repo star deltas in the page mapper so
//     these columns stay non-zero. Sparkline column draws from linked
//     repo `sparklineData` (same fallback chain) — empty draw when neither
//     source has values.

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

import { EntityLogo } from "@/components/ui/EntityLogo";

type SortKey = "rank" | "use" | "released" | "d24" | "d7" | "d30";
type SortDir = "asc" | "desc";

export interface McpRow {
  id: string;
  title: string;
  href: string;
  logo: string | null;
  author: string | null;
  sourceLabel: string;
  use: number;
  releasedAt: string | null;
  verified: boolean;
  sources: { s: boolean; g: boolean; p: boolean; o: boolean };
  crossSourceCount: number;
  /**
   * Delta windows. MCP installs deltas first (from
   * `mcp.installs24h/7d/30d`); fall back to linked GitHub-repo star
   * deltas when the registry side-channel hasn't accrued a snapshot yet.
   * Zero rendered as "—" so cold-start rows don't look fake-positive.
   */
  delta24h: number;
  delta7d: number;
  delta30d: number;
  /**
   * Unit shown next to the delta — "installs" when the MCP registry
   * provided the number, "stars" when we fell back to the linked repo.
   * Drives the tooltip; the delta itself is rendered the same way.
   */
  deltaUnit: "installs" | "stars" | null;
  /**
   * 30 daily values from the linked repo's star sparkline (when MCP has a
   * trackable repo) or empty array.
   */
  sparklineData: number[];
}

function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const days = diff / 86_400_000;
  if (days < 1) {
    const hours = Math.max(1, Math.round(diff / 3_600_000));
    return `${hours}h`;
  }
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)}mo`;
  return `${Math.round(months / 12)}y`;
}

export interface CategoryFacet {
  id: string;
  label: string;
  count: number;
}

interface LiveMcpTableProps {
  rows: McpRow[];
  categories: CategoryFacet[];
}

// Per-registry monogram color. Inline-styled inside the existing `.sd`
// shape so we don't have to add CSS classes for new sources.
const SOURCE_PILLS = [
  { key: "s" as const, label: "Smithery", letter: "S", color: "#3b82f6" },
  { key: "g" as const, label: "Glama", letter: "G", color: "#8b5cf6" },
  { key: "p" as const, label: "PulseMCP", letter: "P", color: "#06b6d4" },
  { key: "o" as const, label: "Official", letter: "O", color: "#f59e0b" },
] as const;

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
  const lastVal = points[lastIdx]!;
  const x = (lastIdx / Math.max(1, points.length - 1)) * (width - 2) + 1;
  const y = height - 2 - ((lastVal - min) / span) * (height - 4);
  return { x, y };
}

// Stable per-instance id avoids gradient cross-talk when many spark SVGs
// are mounted in the same DOM. Incremented for each render — same pattern
// as `__ltSparkGrad` in src/components/home/LiveTopTable.tsx.
let __mcpSparkGradId = 0;

function compareNumeric(a: number, b: number, dir: SortDir): number {
  return dir === "asc" ? a - b : b - a;
}

function getSortValue(row: McpRow, key: SortKey): number {
  switch (key) {
    case "use":
      return row.use;
    case "d24":
      return row.delta24h;
    case "d7":
      return row.delta7d;
    case "d30":
      return row.delta30d;
    case "released":
      return row.releasedAt ? Date.parse(row.releasedAt) || 0 : 0;
    case "rank":
    default:
      // Upstream `rank` is ascending (1 = best); flip it for "desc"
      // semantics so toggling the column header matches every other
      // sortable column.
      return -1;
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

export function LiveMcpTable({ rows, categories }: LiveMcpTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("use");
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
      ? rows.filter((r) => {
          if (activeCat === "smithery") return r.sources.s;
          if (activeCat === "glama") return r.sources.g;
          if (activeCat === "pulsemcp") return r.sources.p;
          if (activeCat === "official") return r.sources.o;
          return true;
        })
      : rows;
    return [...filtered].sort((a, b) =>
      compareNumeric(getSortValue(a, sortKey), getSortValue(b, sortKey), sortDir),
    );
  }, [rows, sortKey, sortDir, activeCat]);

  return (
    <div className="live-top">
      <div
        className="live-top-filters"
        role="toolbar"
        aria-label="Filter MCP servers by registry"
      >
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
              <th>MCP</th>
              <th className="mentions-h">Registries</th>
              <SortHeader
                label="Use"
                sortKey="use"
                active={sortKey === "use"}
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
                label="Released"
                sortKey="released"
                active={sortKey === "released"}
                dir={sortDir}
                onClick={handleSort}
              />
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const rankCls =
                index === 0
                  ? "rk-1"
                  : index === 1
                    ? "rk-2"
                    : index === 2
                      ? "rk-3"
                      : "";
              const unitTitle =
                row.deltaUnit === "stars"
                  ? "Linked-repo star delta (registry installs cold-start)"
                  : row.deltaUnit === "installs"
                    ? "Registry installs delta"
                    : "No delta data yet";
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
                        src={row.logo}
                        name={row.title}
                        size={28}
                      />
                      <span className="repo-txt">
                        <span>
                          {row.title}
                          {row.verified ? (
                            <span
                              title="Verified by upstream registry"
                              aria-label="verified"
                              style={{
                                marginLeft: 6,
                                color: "var(--v4-money)",
                                fontSize: 11,
                              }}
                            >
                              ✓
                            </span>
                          ) : null}
                        </span>
                        <small>
                          {row.author ? `${row.author} / ` : ""}
                          {row.sourceLabel}
                        </small>
                      </span>
                    </a>
                  </td>
                  <td className="mentions-cell">
                    <span
                      className="mentions-pills"
                      aria-label="Registry presence"
                    >
                      {SOURCE_PILLS.map(({ key, label, letter, color }) => {
                        const fired = row.sources[key];
                        return (
                          <span
                            key={key}
                            className={`sd ${fired ? "on" : "off"}`}
                            title={`${label}: ${fired ? "listed" : "not listed"}`}
                            aria-label={`${label} ${fired ? "listed" : "not listed"}`}
                            style={{
                              fontFamily:
                                "var(--font-geist-mono), monospace",
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: 0,
                              color: fired ? "#fff" : "var(--v4-ink-400)",
                              background: fired ? color : "transparent",
                              border: fired
                                ? `1px solid ${color}`
                                : "1px solid var(--v4-line-200)",
                            }}
                          >
                            {letter}
                          </span>
                        );
                      })}
                    </span>
                    <span className="mentions-count">
                      {row.crossSourceCount}×
                    </span>
                  </td>
                  <td className="num">
                    {row.use > 0 ? formatCompact(row.use) : "—"}
                  </td>
                  <td
                    className={`num metric-num ${
                      row.delta24h < 0 ? "dn" : row.delta24h > 0 ? "up" : ""
                    }`}
                    title={unitTitle}
                  >
                    {row.delta24h !== 0 ? formatDelta(row.delta24h) : "—"}
                  </td>
                  <td
                    className={`num metric-num ${
                      row.delta7d < 0 ? "dn" : row.delta7d > 0 ? "up" : ""
                    }`}
                    title={unitTitle}
                  >
                    {row.delta7d !== 0 ? formatDelta(row.delta7d) : "—"}
                  </td>
                  <td
                    className={`num metric-num ${
                      row.delta30d < 0 ? "dn" : row.delta30d > 0 ? "up" : ""
                    }`}
                    title={unitTitle}
                  >
                    {row.delta30d !== 0 ? formatDelta(row.delta30d) : "—"}
                  </td>
                  <td className="ch">
                    {row.sparklineData.length > 1
                      ? (() => {
                          const stroke =
                            row.delta24h < 0
                              ? "var(--sig-red)"
                              : "var(--sig-green)";
                          const d = sparkPath(row.sparklineData, 72, 24);
                          const end = sparkEnd(row.sparklineData, 72, 24);
                          const areaPath = `${d} L71,23 L1,23 Z`;
                          const gid = `mcps-${(__mcpSparkGradId =
                            (__mcpSparkGradId + 1) % 1_000_000)}`;
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
                        })()
                      : null}
                  </td>
                  <td className="num">{formatAge(row.releasedAt)}</td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="live-empty">
                  No MCP servers match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
