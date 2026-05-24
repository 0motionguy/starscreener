"use client";

// LlmsLeaderboardTable — clone of the artificialanalysis.ai leaderboard,
// dressed in trendingrepo's existing design system (.card.trending-table-card
// + table.tdata + .repo-id rows). Featured-row at the top renders TOP /
// NEWEST / CHEAPEST as 3 hero cards mirroring FeaturedRepos.
//
// 2026-05-24 operator-locked scope: 7 columns + 3 filter chips. Context
// Window / Modalities / Weights / Size / Reasoning omitted — AA API doesn't
// expose those.

import { useMemo, useState } from "react";

import { SourceLogo, type SourceName } from "@/components/icon/Icon";
import type { AaLlmsRow } from "@/lib/aa-llms";

type SortKey = "intel" | "price" | "speed" | "latency" | "total";
type SortDir = "asc" | "desc";
type PriceFilter = "all" | "free" | "lt1" | "1to10" | "gt10";
type SpeedFilter = "all" | "fast" | "med" | "slow";
type StatusFilter = "current" | "all";

interface Props {
  rows: AaLlmsRow[];
  /** When false, the featured-row above the table is skipped (caller renders it
   *  elsewhere — typically above the trending control bar). Defaults to true. */
  showFeatured?: boolean;
}

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

export function LlmsLeaderboardTable({ rows, showFeatured = true }: Props) {
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
    <>
      {showFeatured && <FeaturedLlms rows={rows} />}

      <div className="card trending-table-card">
        <div className="card-head">
          <h2 className="card-title">
            <b>Live · {sorted.length} models</b> · sorted by {SORT_LABELS[sortKey]}{" "}
            {sortDir === "desc" ? "↓" : "↑"}
          </h2>
          <span className="grow" />
          <span className="fresh fresh-live">
            <span className="pip" aria-hidden="true" /> AA · refreshed every 6h
          </span>
        </div>

        <div className="period-switcher">
          <span className="period-label">Filters:</span>
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
          <span className="period-hint">
            Source:{" "}
            <a
              href="https://artificialanalysis.ai/leaderboards/models"
              target="_blank"
              rel="noopener"
            >
              artificialanalysis.ai
            </a>
            {" · "}
            <a href="https://aiso.tools" target="_blank" rel="noopener">
              aiso.tools
            </a>
          </span>
        </div>

        <table className="tdata">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th>Model</th>
              <SortableTh
                label="Intelligence"
                active={sortKey === "intel"}
                dir={sortDir}
                onClick={() => onHeaderClick("intel")}
              />
              <SortableTh
                label="Price"
                sub="USD / 1M tok"
                active={sortKey === "price"}
                dir={sortDir}
                onClick={() => onHeaderClick("price")}
              />
              <SortableTh
                label="Speed"
                sub="tok/s"
                active={sortKey === "speed"}
                dir={sortDir}
                onClick={() => onHeaderClick("speed")}
              />
              <SortableTh
                label="Latency"
                sub="first chunk"
                active={sortKey === "latency"}
                dir={sortDir}
                onClick={() => onHeaderClick("latency")}
              />
              <SortableTh
                label="Total"
                sub="response s"
                active={sortKey === "total"}
                dir={sortDir}
                onClick={() => onHeaderClick("total")}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-message">
                  No models match the current filters.
                </td>
              </tr>
            ) : (
              sorted.map((r, i) => {
                const rankClass =
                  i === 0
                    ? "rank top top-1"
                    : i === 1
                      ? "rank top top-2"
                      : i === 2
                        ? "rank top top-3"
                        : "rank";
                return (
                  <tr
                    key={r.slug}
                    className="stagger-row"
                    style={{ animationDelay: `${Math.min(i * 0.03, 0.25)}s` }}
                  >
                    <td data-label="Rank">
                      <span className={rankClass}>{String(i + 1).padStart(2, "0")}</span>
                    </td>
                    <td data-label="Model">
                      <div className="repo-id">
                        <CreatorAvatar creator={r.creator} slug={r.creatorSlug} />
                        <div className="repo-text">
                          <span className="repo-name" data-repo={r.slug}>
                            <span className="repo-owner">{r.creator}/</span>
                            {r.name}
                          </span>
                          <div className="repo-desc">{modelBlurb(r)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num" data-label="Intelligence">
                      <span className="star-value">{fmtIntel(r.intelligenceIndex)}</span>
                    </td>
                    <td className="num" data-label="Price">
                      <span className="star-value">{fmtPrice(r.pricePerMTokens)}</span>
                    </td>
                    <td className="num" data-label="Speed">
                      <span className="star-value">{fmtSpeed(r.outputTokensPerSec)}</span>
                    </td>
                    <td className="num" data-label="Latency">
                      <span className="star-value">{fmtSec(r.ttftSec)}</span>
                    </td>
                    <td className="num" data-label="Total">
                      <span className="star-value">{fmtSec(r.ttfaSec)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="table-foot">
          <div className="muted">
            Showing <span className="num">{sorted.length}</span> of{" "}
            <span className="num">{rows.length}</span> · sorted by{" "}
            {SORT_LABELS[sortKey]} {sortDir === "desc" ? "↓" : "↑"}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// FeaturedLlms — 3 hero cards: TOP / NEWEST / CHEAPEST
// ---------------------------------------------------------------------------

interface FeaturedTriple {
  top: AaLlmsRow | null;
  newest: AaLlmsRow | null;
  cheapest: AaLlmsRow | null;
}

function pickFeatured(rows: AaLlmsRow[]): FeaturedTriple {
  const withIntel = rows.filter((r) => r.intelligenceIndex !== null);
  const top =
    withIntel.length > 0
      ? [...withIntel].sort(
          (a, b) => (b.intelligenceIndex ?? 0) - (a.intelligenceIndex ?? 0),
        )[0]
      : null;

  const withDate = rows.filter((r) => r.releaseDate);
  const newest =
    withDate.length > 0
      ? [...withDate].sort((a, b) =>
          (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""),
        )[0]
      : null;

  const withPrice = rows.filter((r) => r.pricePerMTokens !== null);
  const cheapest =
    withPrice.length > 0
      ? [...withPrice].sort(
          (a, b) => (a.pricePerMTokens ?? 0) - (b.pricePerMTokens ?? 0),
        )[0]
      : null;

  return { top, newest, cheapest };
}

const FEATURED_VARIANTS = [
  { className: "hot", label: "TOP", stat: "Intelligence Index" },
  { className: "trend", label: "NEWEST", stat: "Released" },
  { className: "cool", label: "CHEAPEST", stat: "Blended price" },
] as const;

export function FeaturedLlms({ rows }: { rows: AaLlmsRow[] }) {
  const featured = useMemo(() => pickFeatured(rows), [rows]);
  const cards: Array<{ row: AaLlmsRow; statValue: string; chipClass: string }> = [];
  if (featured.top) {
    cards.push({
      row: featured.top,
      statValue: fmtIntel(featured.top.intelligenceIndex),
      chipClass: "rank-top",
    });
  }
  if (featured.newest) {
    cards.push({
      row: featured.newest,
      statValue: fmtReleaseDate(featured.newest.releaseDate),
      chipClass: "rank-breakout",
    });
  }
  if (featured.cheapest) {
    cards.push({
      row: featured.cheapest,
      statValue: fmtPrice(featured.cheapest.pricePerMTokens),
      chipClass: "rank-trend",
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="featured-row" aria-label="Featured LLMs">
      {cards.map(({ row, statValue, chipClass }, i) => {
        const variant = FEATURED_VARIANTS[i] ?? FEATURED_VARIANTS[0];
        const intel = row.intelligenceIndex ?? null;
        const intelTier = intelTierLabel(intel);
        return (
          <article key={`${variant.label}-${row.slug}`} className={`feat ${variant.className}`}>
            <div className="feat-head">
              <div className="feat-rank">{String(i + 1).padStart(2, "0")}</div>
              <div className="repo-id grow">
                <CreatorAvatar
                  creator={row.creator}
                  slug={row.creatorSlug}
                  className="feat-avatar"
                />
                <div className="repo-text">
                  <span className="repo-name" data-repo={row.slug}>
                    <span className="repo-owner">{row.creator}/</span>
                    {row.name}
                  </span>
                </div>
              </div>
              <span className={`feat-rank-chip ${chipClass}`}>{variant.label}</span>
            </div>

            <div className="feat-body">
              <p className="feat-desc">{featuredBlurb(row, variant.label)}</p>
              <div className="row gap-2 feat-meta">
                <span className="chip up">
                  {variant.stat} · {statValue}
                </span>
                {intelTier && (
                  <span className="fresh fresh-live">
                    <span className="pip" aria-hidden="true" /> {intelTier}
                  </span>
                )}
              </div>
            </div>

            <div className="feat-foot">
              <div className="feat-stat">
                <span className="feat-stat-label">Intelligence</span>
                <span className="feat-stat-value">{fmtIntel(row.intelligenceIndex)}</span>
              </div>
              <div className="feat-stat">
                <span className="feat-stat-label">Price · 1M tok</span>
                <span className="feat-stat-value">{fmtPrice(row.pricePerMTokens)}</span>
              </div>
              <div className="feat-stat">
                <span className="feat-stat-label">Speed</span>
                <span className="feat-stat-value">
                  {fmtSpeed(row.outputTokensPerSec)}
                  <span className="muted"> tok/s</span>
                </span>
              </div>
              <div className="feat-stat">
                <span className="feat-stat-label">Latency</span>
                <span className="feat-stat-value">{fmtSec(row.ttftSec)}</span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function intelTierLabel(intel: number | null): string | null {
  if (intel === null) return null;
  if (intel >= 55) return "Frontier tier";
  if (intel >= 45) return "Pro tier";
  if (intel >= 35) return "Mid tier";
  if (intel >= 25) return "Lite tier";
  return "Entry tier";
}

function featuredBlurb(row: AaLlmsRow, label: string): string {
  const bits: string[] = [];
  if (row.codingIndex !== null) bits.push(`coding ${row.codingIndex.toFixed(0)}`);
  if (row.mathIndex !== null) bits.push(`math ${row.mathIndex.toFixed(0)}`);
  if (row.mmluPro !== null) bits.push(`MMLU-Pro ${(row.mmluPro * 100).toFixed(0)}`);
  if (row.gpqa !== null) bits.push(`GPQA ${(row.gpqa * 100).toFixed(0)}`);
  if (bits.length === 0) return `${row.creator}'s ${label.toLowerCase()} pick — ${row.name}.`;
  return bits.slice(0, 3).join(" · ");
}

// ---------------------------------------------------------------------------
// Avatar + helpers
// ---------------------------------------------------------------------------

// Per-creator brand identity. SourceLogo SVG used when we have a brand mark in
// /public/brand/sources/; otherwise a monogram tile on the official brand color
// with WHITE (or dark-on-yellow) contrast text. Both branches share the same
// .repo-avatar dimensions so the table column lines up.
const CREATOR_BRAND: Record<
  string,
  { color: string; fg?: string; initials?: string; svg?: boolean }
> = {
  // SVG-backed (drop into /public/brand/sources to add more)
  openai: { color: "#10a37f", svg: true },
  anthropic: { color: "#d97757", svg: true },
  deepseek: { color: "#4d6bfe", svg: true },
  // Monogram-only (real SVG would be nicer; using brand color tile for now)
  google: { color: "#4285f4", initials: "G" },
  meta: { color: "#0467df", initials: "M" },
  alibaba: { color: "#ff6a00", initials: "A" },
  cohere: { color: "#39594d", initials: "Co" },
  mistralai: { color: "#fa520f", initials: "M" },
  mistral: { color: "#fa520f", initials: "M" },
  kimi: { color: "#111111", initials: "K" },
  xai: { color: "#111111", initials: "X" },
  minimax: { color: "#f54a00", initials: "Mx" },
  xiaomi: { color: "#ff6900", initials: "Mi" },
  "z-ai": { color: "#2563eb", initials: "Z" },
  zai: { color: "#2563eb", initials: "Z" },
  microsoft: { color: "#00a4ef", initials: "Ms" },
  nvidia: { color: "#76b900", initials: "N", fg: "#000" },
  amazon: { color: "#ff9900", initials: "A", fg: "#000" },
  perplexity: { color: "#20808d", initials: "Pp" },
  reka: { color: "#bb1f4a", initials: "R" },
  databricks: { color: "#ff3621", initials: "Db" },
  ai21: { color: "#7c3aed", initials: "21" },
  inflection: { color: "#7c3aed", initials: "If" },
  "01-ai": { color: "#0891b2", initials: "01" },
  "01ai": { color: "#0891b2", initials: "01" },
  yi: { color: "#0891b2", initials: "Yi" },
  liquid: { color: "#10b981", initials: "Lq" },
  upstage: { color: "#0ea5e9", initials: "Up" },
  baidu: { color: "#2932e1", initials: "Ba" },
  tencent: { color: "#0052d9", initials: "Tc" },
  bytedance: { color: "#1c1d22", initials: "Bd" },
};

function brandFor(slug: string | null, creatorName: string): {
  color: string;
  fg: string;
  initials: string;
  svg: boolean;
} {
  const key = slug?.toLowerCase() ?? "";
  const entry = CREATOR_BRAND[key];
  if (entry) {
    return {
      color: entry.color,
      fg: entry.fg ?? "#fff",
      initials: entry.initials ?? defaultInitials(creatorName),
      svg: entry.svg ?? false,
    };
  }
  // Unknown creator → deterministic neutral tile (operator preferred uniform look).
  return {
    color: deterministicColor(creatorName),
    fg: "#fff",
    initials: defaultInitials(creatorName),
    svg: false,
  };
}

function defaultInitials(name: string): string {
  const cleaned = (name || "??").trim();
  if (!cleaned) return "??";
  // 1-word creator → first 1-2 letters; multi-word → first letter of first 2
  const words = cleaned.split(/\s+/);
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

const NEUTRAL_COLORS = [
  "#475569",
  "#52525b",
  "#334155",
  "#3f3f46",
  "#404040",
  "#4b5563",
];

function deterministicColor(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return NEUTRAL_COLORS[Math.abs(h) % NEUTRAL_COLORS.length]!;
}

function CreatorAvatar({
  creator,
  slug,
  className,
}: {
  creator: string;
  slug: string | null;
  className?: string;
}) {
  const brand = brandFor(slug, creator);
  const klass = className ? `repo-avatar ${className}` : "repo-avatar";

  if (brand.svg) {
    // Use the SourceLogo SVG. Wrap in a brand-tinted tile so the SVG sits on
    // its actual brand color (matches the monogram pattern visually).
    return (
      <span
        className={klass}
        aria-label={creator}
        style={{ background: brand.color, color: brand.fg, padding: 2 }}
      >
        <SourceLogo
          source={(slug?.toLowerCase() ?? "openai") as SourceName}
          size="sm"
        />
      </span>
    );
  }

  // Monogram fallback: brand color tile + contrast text.
  return (
    <span
      className={klass}
      aria-label={creator}
      style={{
        background: brand.color,
        color: brand.fg,
        fontWeight: 700,
        fontSize: brand.initials.length > 1 ? 9 : 11,
      }}
    >
      <span aria-hidden="true">{brand.initials}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Filter chip group (reuses .period-tab look so it lives inside .period-switcher)
// ---------------------------------------------------------------------------

interface FilterGroupProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (next: T) => void;
}

function FilterGroup<T extends string>({ label, value, options, onChange }: FilterGroupProps<T>) {
  return (
    <span className="aa-filter-group" role="group" aria-label={label}>
      <span className="aa-filter-label">{label}</span>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`period-tab${value === opt.id ? " active" : ""}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </span>
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
      className={`num col-velocity sortable${active ? " active" : ""}`}
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

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const SORT_LABELS: Record<SortKey, string> = {
  intel: "intelligence",
  price: "price",
  speed: "speed",
  latency: "latency",
  total: "total response",
};

function modelBlurb(r: AaLlmsRow): string {
  const parts: string[] = [];
  if (r.releaseDate) parts.push(`released ${fmtReleaseDate(r.releaseDate)}`);
  if (r.codingIndex !== null) parts.push(`coding ${r.codingIndex.toFixed(0)}`);
  if (r.mathIndex !== null) parts.push(`math ${r.mathIndex.toFixed(0)}`);
  if (parts.length === 0) return r.creator;
  return parts.join(" · ");
}

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
  return `${v.toFixed(2)} s`;
}

function fmtReleaseDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const days = Math.round((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
