"use client";

// LlmsLeaderboardTable — clone of the artificialanalysis.ai leaderboard.
//
// Renders the AaLlmsRow[] published to the `aa-llms` Redis slug. Columns +
// filters intentionally limited to the AA API's actually-shipped fields
// (operator-locked 2026-05-24): no Context Window, Modalities, Weights,
// Size, or Reasoning — those aren't in the public API.
//
// Client component so column-header sort + filter chips don't roundtrip
// the server. URL state is NOT mirrored yet — operator can ask for share
// links later.

import { useMemo, useState } from "react";

import { SourceLogo } from "@/components/icon/Icon";
import type { AaLlmsRow } from "@/lib/aa-llms";

type SortKey = "intel" | "price" | "speed" | "latency" | "total";
type SortDir = "asc" | "desc";
type PriceFilter = "all" | "free" | "lt1" | "1to10" | "gt10";
type SpeedFilter = "all" | "fast" | "med" | "slow";
type StatusFilter = "current" | "all";

interface Props {
  rows: AaLlmsRow[];
}

// Creator slugs that exist in /public/brand/sources/. Anything else falls
// back to a letter avatar. Wave 4.6 follow-up: add SVGs for google /
// alibaba / xiaomi / meta / mistralai / kimi / xai / z-ai.
const KNOWN_CREATOR_SLUGS = new Set([
  "anthropic",
  "deepseek",
  "openai",
]);

const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  intel: "desc",
  speed: "desc",
  price: "asc",
  latency: "asc",
  total: "asc",
};

const ONE_YEAR_MS = 365 * 86_400_000;

const PRICE_OPTIONS: Array<{ id: PriceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "free", label: "Free" },
  { id: "lt1", label: "< $1" },
  { id: "1to10", label: "$1–$10" },
  { id: "gt10", label: "> $10" },
];

const SPEED_OPTIONS: Array<{ id: SpeedFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "fast", label: "Fast" },
  { id: "med", label: "Med" },
  { id: "slow", label: "Slow" },
];

const STATUS_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: "current", label: "Current" },
  { id: "all", label: "All" },
];

export function LlmsLeaderboardTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("intel");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [speedFilter, setSpeedFilter] = useState<SpeedFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("current");

  const filtered = useMemo(() => {
    const now = Date.now();
    return rows.filter((r) => {
      if (statusFilter === "current" && r.releaseDate) {
        const t = Date.parse(r.releaseDate);
        if (Number.isFinite(t) && now - t > ONE_YEAR_MS) return false;
      }
      if (priceFilter !== "all") {
        const p = r.pricePerMTokens;
        if (p === null) return false;
        if (priceFilter === "free" && p > 0) return false;
        if (priceFilter === "lt1" && p >= 1) return false;
        if (priceFilter === "1to10" && (p < 1 || p > 10)) return false;
        if (priceFilter === "gt10" && p <= 10) return false;
      }
      if (speedFilter !== "all") {
        const s = r.outputTokensPerSec;
        if (s === null) return false;
        if (speedFilter === "fast" && s < 100) return false;
        if (speedFilter === "med" && (s < 30 || s >= 100)) return false;
        if (speedFilter === "slow" && s >= 30) return false;
      }
      return true;
    });
  }, [rows, priceFilter, speedFilter, statusFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const pickField = (r: AaLlmsRow): number => {
      if (sortKey === "intel") return r.intelligenceIndex ?? Number.NEGATIVE_INFINITY;
      if (sortKey === "price") return r.pricePerMTokens ?? Number.POSITIVE_INFINITY;
      if (sortKey === "speed") return r.outputTokensPerSec ?? Number.NEGATIVE_INFINITY;
      if (sortKey === "latency") return r.ttftSec ?? Number.POSITIVE_INFINITY;
      return r.ttfaSec ?? Number.POSITIVE_INFINITY;
    };
    return [...filtered].sort((a, b) => {
      const av = pickField(a);
      const bv = pickField(b);
      if (av === bv) return a.name.localeCompare(b.name);
      return dir * (av < bv ? -1 : 1);
    });
  }, [filtered, sortKey, sortDir]);

  const onHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(SORT_DEFAULT_DIR[key]);
    }
  };

  return (
    <div className="card aa-leaderboard-card">
      <div className="aa-leaderboard-head">
        <div>
          <h2 className="aa-leaderboard-title">LLM leaderboard</h2>
          <p className="aa-leaderboard-deck">
            Live model rankings via{" "}
            <a
              href="https://artificialanalysis.ai/leaderboards/models"
              target="_blank"
              rel="noopener"
              className="aa-leaderboard-source-link"
            >
              artificialanalysis.ai
            </a>{" "}
            · {sorted.length} models · sorted by{" "}
            {SORT_LABELS[sortKey]} {sortDir === "desc" ? "↓" : "↑"}
          </p>
        </div>
      </div>

      <div className="aa-filters">
        <FilterGroup
          label="Price"
          value={priceFilter}
          options={PRICE_OPTIONS}
          onChange={setPriceFilter}
        />
        <FilterGroup
          label="Speed"
          value={speedFilter}
          options={SPEED_OPTIONS}
          onChange={setSpeedFilter}
        />
        <FilterGroup
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={setStatusFilter}
        />
      </div>

      <div className="aa-leaderboard-scroll">
        <table className="aa-leaderboard">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-model">Model</th>
              <th className="col-creator">Creator</th>
              <SortableTh
                label="Intelligence"
                active={sortKey === "intel"}
                dir={sortDir}
                onClick={() => onHeaderClick("intel")}
              />
              <SortableTh
                label="Blended Price"
                sub="USD / 1M tok"
                active={sortKey === "price"}
                dir={sortDir}
                onClick={() => onHeaderClick("price")}
              />
              <SortableTh
                label="Speed"
                sub="Tok/s"
                active={sortKey === "speed"}
                dir={sortDir}
                onClick={() => onHeaderClick("speed")}
              />
              <SortableTh
                label="Latency"
                sub="First chunk (s)"
                active={sortKey === "latency"}
                dir={sortDir}
                onClick={() => onHeaderClick("latency")}
              />
              <SortableTh
                label="Total Response"
                sub="(s)"
                active={sortKey === "total"}
                dir={sortDir}
                onClick={() => onHeaderClick("total")}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="aa-empty">
                  No models match the current filters.
                </td>
              </tr>
            ) : (
              sorted.map((r, i) => (
                <tr key={r.slug}>
                  <td className="num col-rank">{i + 1}</td>
                  <td className="col-model">
                    <span className="aa-model-stripe" aria-hidden style={stripeStyle(r)} />
                    <span className="aa-model-name">{r.name}</span>
                  </td>
                  <td className="col-creator">
                    <CreatorBadge creator={r.creator} slug={r.creatorSlug} />
                  </td>
                  <td className="num">{fmtIntel(r.intelligenceIndex)}</td>
                  <td className="num">{fmtPrice(r.pricePerMTokens)}</td>
                  <td className="num">{fmtSpeed(r.outputTokensPerSec)}</td>
                  <td className="num">{fmtSec(r.ttftSec)}</td>
                  <td className="num">{fmtSec(r.ttfaSec)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FilterGroupProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (next: T) => void;
}

function FilterGroup<T extends string>({ label, value, options, onChange }: FilterGroupProps<T>) {
  return (
    <div className="aa-filter-group" role="group" aria-label={label}>
      <span className="aa-filter-label">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`aa-filter-chip${value === opt.id ? " active" : ""}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface SortableThProps {
  label: string;
  sub?: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}

function SortableTh({ label, sub, active, dir, onClick }: SortableThProps) {
  return (
    <th
      className={`num sortable${active ? " active" : ""}`}
      onClick={onClick}
      role="button"
      aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
    >
      <span className="aa-th-label">{label}</span>
      {sub && <span className="aa-th-sub">{sub}</span>}
      <span className="aa-th-arrow" aria-hidden>
        {active ? (dir === "desc" ? "↓" : "↑") : "⇅"}
      </span>
    </th>
  );
}

function CreatorBadge({ creator, slug }: { creator: string; slug: string | null }) {
  const slugLower = slug?.toLowerCase() ?? "";
  const hasLogo = slugLower && KNOWN_CREATOR_SLUGS.has(slugLower);
  return (
    <span className="aa-creator">
      {hasLogo ? (
        <SourceLogo
          source={slugLower as "anthropic" | "deepseek" | "openai"}
          size="sm"
        />
      ) : (
        <span className="aa-creator-letter" aria-hidden>
          {creator.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="aa-creator-name">{creator}</span>
    </span>
  );
}

const SORT_LABELS: Record<SortKey, string> = {
  intel: "Intelligence Index",
  price: "Blended price",
  speed: "Speed",
  latency: "Latency",
  total: "Total response time",
};

function fmtIntel(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(1);
}

function fmtPrice(v: number | null): string {
  if (v === null) return "—";
  if (v === 0) return "Free";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

function fmtSpeed(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(0);
}

function fmtSec(v: number | null): string {
  if (v === null) return "—";
  if (v < 1) return `${(v * 1000).toFixed(0)} ms`;
  return `${v.toFixed(2)}s`;
}

function stripeStyle(r: AaLlmsRow): React.CSSProperties {
  // Color stripe per intelligence tier — visual marker like the AA page.
  const intel = r.intelligenceIndex ?? 0;
  let color = "#71717a"; // zinc-500 (unknown)
  if (intel >= 55) color = "#22c55e"; // green
  else if (intel >= 45) color = "#84cc16"; // lime
  else if (intel >= 35) color = "#facc15"; // yellow
  else if (intel >= 25) color = "#f97316"; // orange
  else if (intel > 0) color = "#ef4444"; // red
  return { backgroundColor: color };
}
