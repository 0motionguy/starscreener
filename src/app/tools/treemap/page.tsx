// /tools/treemap — sector treemap of every tracked repo.
//
// Server Component. Pulls derived-repos and lays the top-80 out as a
// squarified treemap (one SVG, no client JS, scales with container).
// Each tile's area is proportional to the active metric; category drives
// fill color. `?category=` filters; out-of-category tiles render as muted
// background ghosts so the filter visualizes "this slice of the corpus
// inside the whole" without changing the overall layout footprint.
//
// Algorithm: classic Bruls–Huijbregts–van Wijk squarified treemap. Each
// recursion lays a strip whose worst aspect ratio is closest to 1 against
// the bounding rectangle's shorter side, then recurses on the leftover.
// Pure SVG output — no echarts, no client component.
//
// Falls back gracefully on empty data: renders an empty-state panel inside
// the treemap card instead of crashing the route.

import type { Metadata } from "next";
import Link from "next/link";

import { getDerivedRepos } from "@/lib/derived-repos";
import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";
import { getLastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Sector Treemap — TrendingRepo",
  description:
    "Every tracked open-source repository laid out as a squarified treemap. Tile area = weekly star momentum; color = category. Filter by category, pick the metric, click any tile to inspect.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// ── SVG geometry ────────────────────────────────────────────────────────
const VB_W = 1200;
const VB_H = 720;
const PAD_X = 6;
const PAD_Y = 6;
const TILE_GAP = 1.5;
const MAX_TILES = 80;

// ── Metric model ────────────────────────────────────────────────────────
type Metric = "delta7d" | "delta24h" | "stars";

const METRICS: { id: Metric; label: string; sub: string }[] = [
  { id: "delta7d", label: "7d Δ stars", sub: "weekly momentum" },
  { id: "delta24h", label: "24h Δ stars", sub: "today" },
  { id: "stars", label: "Total stars", sub: "lifetime size" },
];

function parseMetric(value: string | string[] | undefined): Metric {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "stars" || raw === "delta24h") return raw;
  return "delta7d";
}

function parseCategory(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

// ── Category palette ────────────────────────────────────────────────────
// 7 distinct hues drawn from existing shell.css variables so the treemap
// stays on-palette without inventing new colors. Categories outside this
// rotation reuse the 8th "neutral" swatch.
interface CategoryDef {
  id: string;
  label: string;
  color: string;
  fill: string;
}

const CATEGORY_DEFS: CategoryDef[] = [
  { id: "ai-agents", label: "AI Agents", color: "var(--accent)", fill: "rgba(255, 107, 53, 0.42)" },
  { id: "mcp", label: "MCP", color: "var(--violet)", fill: "rgba(167, 139, 250, 0.42)" },
  { id: "devtools", label: "DevTools", color: "var(--cyan)", fill: "rgba(58, 214, 197, 0.40)" },
  { id: "ai-ml", label: "AI / ML", color: "var(--pink)", fill: "rgba(244, 114, 182, 0.40)" },
  { id: "local-llm", label: "Local LLM", color: "var(--warning)", fill: "rgba(255, 181, 71, 0.40)" },
  { id: "browser-automation", label: "Browser Automation", color: "var(--info)", fill: "rgba(96, 165, 250, 0.42)" },
  { id: "security", label: "Security", color: "var(--down)", fill: "rgba(255, 77, 77, 0.40)" },
  { id: "infrastructure", label: "Infrastructure", color: "var(--up)", fill: "rgba(34, 197, 94, 0.40)" },
  { id: "design-engineering", label: "Design Eng", color: "var(--accent)", fill: "rgba(255, 132, 88, 0.32)" },
  { id: "web-frameworks", label: "Web Frameworks", color: "var(--cyan)", fill: "rgba(58, 214, 197, 0.30)" },
  { id: "databases", label: "Databases", color: "var(--violet)", fill: "rgba(167, 139, 250, 0.30)" },
  { id: "mobile", label: "Mobile / Desktop", color: "var(--info)", fill: "rgba(96, 165, 250, 0.32)" },
  { id: "data-analytics", label: "Data & Analytics", color: "var(--pink)", fill: "rgba(244, 114, 182, 0.30)" },
  { id: "crypto-web3", label: "Crypto / Web3", color: "var(--warning)", fill: "rgba(255, 181, 71, 0.30)" },
  { id: "rust-ecosystem", label: "Rust", color: "var(--down)", fill: "rgba(255, 77, 77, 0.30)" },
];

const CATEGORY_BY_ID = new Map<string, CategoryDef>(
  CATEGORY_DEFS.map((d) => [d.id, d]),
);
const NEUTRAL: CategoryDef = {
  id: "other",
  label: "Other",
  color: "var(--fg-muted)",
  fill: "rgba(140, 140, 140, 0.28)",
};

function lookupCategory(id: string | undefined): CategoryDef {
  if (!id) return NEUTRAL;
  return CATEGORY_BY_ID.get(id) ?? NEUTRAL;
}

// ── Treemap layout ──────────────────────────────────────────────────────
interface Tile {
  repo: Repo;
  metricValue: number;
  category: CategoryDef;
  inFilter: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function metricFor(repo: Repo, metric: Metric): number {
  switch (metric) {
    case "delta24h":
      return Math.max(0, repo.starsDelta24h ?? 0);
    case "stars":
      return Math.max(0, (repo.stars ?? 0) / 1000);
    case "delta7d":
    default: {
      const d7 = Math.max(0, repo.starsDelta7d ?? 0);
      // Tiny-fallback: repos with zero weekly delta still get a faint
      // presence proportional to their lifetime size so the canvas doesn't
      // collapse to ~5 mega-tiles in a 0-delta corpus.
      return d7 > 0 ? d7 : (repo.stars ?? 0) / 1000;
    }
  }
}

/**
 * Bruls–Huijbregts–van Wijk squarified treemap.
 *
 * `values` is the descending-sorted array of metric values; their sum must
 * equal the rectangle area so each tile gets its share.
 *
 * Returns an array of {x, y, w, h} in the same order as `values`.
 */
function squarify(values: number[], rect: Rect): Rect[] {
  const out: Rect[] = new Array(values.length);
  if (values.length === 0 || rect.w <= 0 || rect.h <= 0) return out;

  const sumAll = values.reduce((acc, v) => acc + v, 0);
  if (sumAll <= 0) return out;

  // Pre-scale every value into the rectangle's area space, so working in
  // absolute pixel area keeps the algorithm simple.
  const scale = (rect.w * rect.h) / sumAll;
  const areas = values.map((v) => v * scale);

  let curRect: Rect = { ...rect };
  let idx = 0;

  while (idx < areas.length && curRect.w > 0 && curRect.h > 0) {
    const shortSide = Math.min(curRect.w, curRect.h);
    let row: number[] = [];
    let rowSum = 0;
    let bestWorst = Infinity;

    // Greedy: extend the row as long as the worst aspect ratio improves
    // (or stays flat).
    while (idx + row.length < areas.length) {
      const candidate = areas[idx + row.length];
      const nextRow = [...row, candidate];
      const nextSum = rowSum + candidate;
      const worst = worstAspect(nextRow, nextSum, shortSide);
      if (row.length === 0 || worst <= bestWorst) {
        row = nextRow;
        rowSum = nextSum;
        bestWorst = worst;
      } else {
        break;
      }
    }

    // Lay this row along the rectangle's shorter side.
    const isHorizontalStrip = curRect.w >= curRect.h;
    if (isHorizontalStrip) {
      // strip is `rowSum / curRect.h` wide, full height
      const stripW = rowSum / curRect.h;
      let cursorY = curRect.y;
      for (let i = 0; i < row.length; i++) {
        const tileH = (row[i] / rowSum) * curRect.h;
        out[idx + i] = {
          x: curRect.x,
          y: cursorY,
          w: stripW,
          h: tileH,
        };
        cursorY += tileH;
      }
      curRect = {
        x: curRect.x + stripW,
        y: curRect.y,
        w: curRect.w - stripW,
        h: curRect.h,
      };
    } else {
      const stripH = rowSum / curRect.w;
      let cursorX = curRect.x;
      for (let i = 0; i < row.length; i++) {
        const tileW = (row[i] / rowSum) * curRect.w;
        out[idx + i] = {
          x: cursorX,
          y: curRect.y,
          w: tileW,
          h: stripH,
        };
        cursorX += tileW;
      }
      curRect = {
        x: curRect.x,
        y: curRect.y + stripH,
        w: curRect.w,
        h: curRect.h - stripH,
      };
    }

    idx += row.length;
  }

  return out;
}

/** Worst aspect ratio of a row of areas laid against `side`. */
function worstAspect(row: number[], rowSum: number, side: number): number {
  if (rowSum <= 0 || side <= 0) return Infinity;
  const s2 = side * side;
  const sum2 = rowSum * rowSum;
  let max = 0;
  let min = Infinity;
  for (const v of row) {
    if (v > max) max = v;
    if (v < min) min = v;
  }
  if (min <= 0) return Infinity;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
}

// ── Helpers ─────────────────────────────────────────────────────────────
function formatStars(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function formatDelta(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${Math.round(n).toLocaleString()}`;
}

function repoHref(repo: Repo): string {
  return `/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

function buildHref(params: { metric?: Metric; category?: string | null }) {
  const sp = new URLSearchParams();
  if (params.metric && params.metric !== "delta7d") sp.set("metric", params.metric);
  if (params.category) sp.set("category", params.category);
  const qs = sp.toString();
  return qs ? `/tools/treemap?${qs}` : "/tools/treemap";
}

/** Truncate to fit the tile's pixel width given a rough char width budget. */
function truncateToFit(text: string, maxChars: number): string {
  if (maxChars <= 1) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 1)) + "…";
}

// ── Page ────────────────────────────────────────────────────────────────
export default async function TreemapPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const metric = parseMetric(params.metric);
  const categoryFilter = parseCategory(params.category);

  await refreshTrendingFromStore();
  const allRepos = getDerivedRepos();

  // Build the candidate set:
  //   1. Sort the entire corpus by metric desc.
  //   2. Take the top 80 (regardless of category) — that's the canvas.
  //   3. When a category filter is active, tiles outside the filter are
  //      still laid out at their natural size but rendered dim so the user
  //      sees the filtered slice inside the whole.
  const ranked = [...allRepos]
    .filter((r) => r.fullName.includes("/"))
    .map((r) => ({ repo: r, value: metricFor(r, metric) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_TILES);

  const layoutValues = ranked.map((x) => x.value);
  const layoutRect: Rect = {
    x: PAD_X,
    y: PAD_Y,
    w: VB_W - PAD_X * 2,
    h: VB_H - PAD_Y * 2,
  };
  const rects = squarify(layoutValues, layoutRect);

  const tiles: Tile[] = ranked.map((entry, i) => {
    const cat = lookupCategory(entry.repo.categoryId);
    const r = rects[i] ?? { x: 0, y: 0, w: 0, h: 0 };
    return {
      repo: entry.repo,
      metricValue: entry.value,
      category: cat,
      inFilter: !categoryFilter || entry.repo.categoryId === categoryFilter,
      x: r.x + TILE_GAP / 2,
      y: r.y + TILE_GAP / 2,
      w: Math.max(0, r.w - TILE_GAP),
      h: Math.max(0, r.h - TILE_GAP),
    };
  });

  // Category counts (over the visible top-80 set, not the full corpus —
  // matches what the user can actually see).
  const counts = new Map<string, number>();
  for (const t of tiles) {
    counts.set(t.category.id, (counts.get(t.category.id) ?? 0) + 1);
  }

  // Freshness + chrome
  const lastUpdatedAt = getLastFetchedAt() ?? null;
  const fresh = classifyFreshness("repos", lastUpdatedAt);
  const statusLabel = getStatusLabel(fresh.status);

  const totalRepos = allRepos.length;
  const renderedRepos = tiles.length;

  return (
    <div
      className="treemap-tool"
      style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}
    >
      <TreemapStyles />

      <div className="page-head tm-hero">
        <div className="tm-hero-left">
          <div className="page-eyebrow">
            <span className={`live-dot ${fresh.status}`} /> <b>{statusLabel}</b>
            {" "}· scanned {fresh.ageLabel} · sector treemap ·{" "}
            <b>{renderedRepos}</b>/<b>{totalRepos}</b> repos
          </div>
          <h1 className="page-title tm-title">Sector Treemap</h1>
          <p className="page-sub">
            Every tracked repo as a single rectangle. Tile area scales with
            the active momentum metric; color encodes category. Click a tile
            to open the repo. Pick a category to highlight just that slice —
            the rest dims into context.
          </p>
        </div>
        <div className="tm-hero-right">
          <div className="tm-toggle-group" role="group" aria-label="Metric">
            <div className="tm-toggle-label">Metric</div>
            <div className="tm-toggle-row">
              {METRICS.map((m) => {
                const active = m.id === metric;
                return (
                  <Link
                    key={m.id}
                    href={buildHref({ metric: m.id, category: categoryFilter })}
                    className={`tm-pill ${active ? "on" : ""}`}
                    prefetch={false}
                  >
                    <span className="tm-pill-label">{m.label}</span>
                    <span className="tm-pill-sub">{m.sub}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <section className="tm-board-card">
        <div className="tm-board-head">
          <div className="tm-eyebrow">
            <span className="num">{"// 01"}</span>
            <span className="title">
              {categoryFilter
                ? `${lookupCategory(categoryFilter).label} · in context`
                : `Top ${renderedRepos} by ${METRICS.find((m) => m.id === metric)?.label}`}
            </span>
            <span className="meta">
              {categoryFilter ? (
                <>
                  <b>{tiles.filter((t) => t.inFilter).length}</b> in filter ·{" "}
                  <Link href={buildHref({ metric })} className="tm-clear" prefetch={false}>
                    clear
                  </Link>
                </>
              ) : (
                <>squarified · 1200×720 viewBox</>
              )}
            </span>
          </div>
        </div>
        <div className="tm-board-body">
          {tiles.length > 0 ? (
            <TreemapSvg tiles={tiles} metric={metric} categoryFilter={categoryFilter} />
          ) : (
            <EmptyBoard />
          )}
        </div>
      </section>

      <CategoryLegend
        counts={counts}
        metric={metric}
        activeCategory={categoryFilter}
      />
    </div>
  );
}

// ── SVG ─────────────────────────────────────────────────────────────────
interface TreemapSvgProps {
  tiles: Tile[];
  metric: Metric;
  categoryFilter: string | null;
}

function TreemapSvg({ tiles, metric, categoryFilter }: TreemapSvgProps) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Sector treemap of ${tiles.length} repositories`}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <defs>
        <linearGradient id="tm-tile-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
        </linearGradient>
      </defs>
      {tiles.map((tile) => (
        <Tile
          key={tile.repo.id}
          tile={tile}
          metric={metric}
          dim={categoryFilter !== null && !tile.inFilter}
        />
      ))}
    </svg>
  );
}

function Tile({
  tile,
  metric,
  dim,
}: {
  tile: Tile;
  metric: Metric;
  dim: boolean;
}) {
  const { x, y, w, h, repo, category, metricValue } = tile;
  if (w < 2 || h < 2) return null;

  // Pixel-area driven label policy. Tiny tiles in the tail of the canvas
  // get nothing (avoids garbled glyphs); medium tiles get the name only;
  // large tiles get name + delta.
  const area = w * h;
  const showLabel = area > 1500 && w > 60 && h > 28;
  const showDelta = area > 5500 && w > 90 && h > 56;

  // Crude monospace char-width estimate: ~6.4px per char at 11px font.
  const charBudget = Math.max(1, Math.floor((w - 16) / 6.4));
  const labelText = truncateToFit(repo.fullName, charBudget);
  const deltaText =
    metric === "stars"
      ? formatStars(repo.stars ?? 0)
      : formatDelta(metricValue);

  const tileOpacity = dim ? 0.18 : 1;
  const accentStroke = dim ? "rgba(255,255,255,0.05)" : category.color;

  return (
    <a href={repoHref(repo)} className="tm-tile-link">
      <title>
        {`${repo.fullName} — ${category.label}\n${
          metric === "stars" ? formatStars(repo.stars ?? 0) + " stars" : deltaText + " (" + metric + ")"
        }`}
      </title>
      <g opacity={tileOpacity} className="tm-tile">
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={category.fill}
          stroke={accentStroke}
          strokeWidth={1}
          rx={2}
        />
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="url(#tm-tile-grad)"
          rx={2}
          pointerEvents="none"
        />
        {showLabel ? (
          <text
            x={x + 8}
            y={y + 18}
            className="tm-tile-name"
            pointerEvents="none"
          >
            {labelText}
          </text>
        ) : null}
        {showDelta ? (
          <text
            x={x + w - 8}
            y={y + 18}
            textAnchor="end"
            className="tm-tile-delta"
            pointerEvents="none"
          >
            {deltaText}
          </text>
        ) : null}
        {showDelta ? (
          <text
            x={x + 8}
            y={y + h - 8}
            className="tm-tile-cat"
            pointerEvents="none"
          >
            {category.label}
          </text>
        ) : null}
      </g>
    </a>
  );
}

function EmptyBoard() {
  return (
    <div className="tm-empty">
      <span className="tm-empty-icon" aria-hidden="true">▦</span>
      <div>
        <div className="tm-empty-title">No repos to plot</div>
        <div className="tm-empty-sub">
          The derived-repos corpus is empty or every repo metric value is
          zero. The treemap will populate once the trending pipeline
          publishes a fresh snapshot.
        </div>
      </div>
    </div>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────
interface CategoryLegendProps {
  counts: Map<string, number>;
  metric: Metric;
  activeCategory: string | null;
}

function CategoryLegend({
  counts,
  metric,
  activeCategory,
}: CategoryLegendProps) {
  // Only show categories that have at least one tile in the current view —
  // a legend full of empty buckets is noise.
  const visible = CATEGORY_DEFS.filter((c) => (counts.get(c.id) ?? 0) > 0);
  const otherCount = counts.get(NEUTRAL.id) ?? 0;
  return (
    <section className="tm-legend-card">
      <div className="tm-eyebrow">
        <span className="num">{"// 02"}</span>
        <span className="title">Category legend</span>
        <span className="meta">
          {activeCategory ? (
            <>
              filtered to <b>{lookupCategory(activeCategory).label}</b>
            </>
          ) : (
            <>click a chip to filter</>
          )}
        </span>
      </div>
      <div className="tm-legend-grid">
        {visible.map((c) => {
          const active = c.id === activeCategory;
          const count = counts.get(c.id) ?? 0;
          return (
            <Link
              key={c.id}
              href={buildHref({
                metric,
                category: active ? null : c.id,
              })}
              className={`tm-chip ${active ? "on" : ""}`}
              prefetch={false}
            >
              <span
                className="tm-chip-swatch"
                style={{ background: c.color }}
                aria-hidden="true"
              />
              <span className="tm-chip-label">{c.label}</span>
              <span className="tm-chip-count">{count}</span>
            </Link>
          );
        })}
        {otherCount > 0 ? (
          <span className="tm-chip muted" aria-disabled="true">
            <span
              className="tm-chip-swatch"
              style={{ background: NEUTRAL.color }}
              aria-hidden="true"
            />
            <span className="tm-chip-label">{NEUTRAL.label}</span>
            <span className="tm-chip-count">{otherCount}</span>
          </span>
        ) : null}
      </div>
    </section>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
function TreemapStyles() {
  return (
    <style>{`
      .treemap-tool .tm-hero {
        align-items: stretch;
        gap: 22px;
      }
      .treemap-tool .tm-hero-left { flex: 1 1 480px; min-width: 0; }
      .treemap-tool .tm-hero-right {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: stretch;
      }
      .treemap-tool .tm-title {
        font-family: var(--font-mono);
        font-weight: 500;
        letter-spacing: -0.01em;
        margin-top: 2px;
      }

      .treemap-tool .tm-toggle-label {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .treemap-tool .tm-toggle-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .treemap-tool .tm-pill {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 12px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        font-family: var(--font-mono);
        text-decoration: none;
        color: var(--fg);
        transition: background var(--d-fast) var(--ease),
                    border-color var(--d-fast) var(--ease);
      }
      .treemap-tool .tm-pill:hover {
        background: var(--surface-2);
        border-color: var(--border);
      }
      .treemap-tool .tm-pill.on {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--fg-bright);
      }
      .treemap-tool .tm-pill-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--fg-bright);
      }
      .treemap-tool .tm-pill-sub {
        font-size: 9.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }

      .treemap-tool .tm-board-card {
        margin-top: 18px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        overflow: hidden;
      }
      .treemap-tool .tm-board-head {
        padding: 14px 16px 10px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .treemap-tool .tm-board-body { padding: 6px; background: var(--surface-2, var(--surface)); }

      .treemap-tool .tm-eyebrow {
        display: flex; align-items: center; gap: 10px;
        flex-wrap: wrap;
      }
      .treemap-tool .tm-eyebrow .num {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .treemap-tool .tm-eyebrow .title {
        font-size: 13.5px;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .treemap-tool .tm-eyebrow .meta {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }
      .treemap-tool .tm-eyebrow .meta b { color: var(--fg); font-weight: 500; }
      .treemap-tool .tm-clear {
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
      }
      .treemap-tool .tm-clear:hover { text-decoration: underline; }

      .treemap-tool .tm-tile-link { cursor: pointer; }
      .treemap-tool .tm-tile {
        transition: filter var(--d-fast) var(--ease),
                    transform var(--d-fast) var(--ease);
        transform-origin: center;
      }
      .treemap-tool .tm-tile-link:hover .tm-tile {
        filter: brightness(1.18) saturate(1.1);
      }
      .treemap-tool .tm-tile-link:hover .tm-tile rect:first-of-type {
        stroke-width: 2;
      }

      .treemap-tool .tm-tile-name {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        fill: var(--fg-bright);
        paint-order: stroke;
        stroke: rgba(0, 0, 0, 0.55);
        stroke-width: 2.5px;
        stroke-linejoin: round;
      }
      .treemap-tool .tm-tile-delta {
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 600;
        fill: var(--fg-bright);
        paint-order: stroke;
        stroke: rgba(0, 0, 0, 0.55);
        stroke-width: 2.5px;
        stroke-linejoin: round;
      }
      .treemap-tool .tm-tile-cat {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        fill: rgba(255,255,255,0.78);
        paint-order: stroke;
        stroke: rgba(0, 0, 0, 0.55);
        stroke-width: 2px;
        stroke-linejoin: round;
      }

      .treemap-tool .tm-empty {
        display: flex; align-items: center; gap: 14px;
        padding: 36px 22px;
        color: var(--fg-muted);
        font-family: var(--font-mono);
      }
      .treemap-tool .tm-empty-icon {
        font-size: 36px;
        color: var(--fg-faint);
      }
      .treemap-tool .tm-empty-title {
        font-size: 13px;
        color: var(--fg-bright);
        margin-bottom: 4px;
      }
      .treemap-tool .tm-empty-sub {
        font-size: 11.5px;
        color: var(--fg-muted);
        max-width: 60ch;
      }

      .treemap-tool .tm-legend-card {
        margin-top: 18px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 14px 16px 16px;
      }
      .treemap-tool .tm-legend-grid {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .treemap-tool .tm-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: var(--surface-2, var(--surface));
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--fg);
        text-decoration: none;
        transition: background var(--d-fast) var(--ease),
                    border-color var(--d-fast) var(--ease);
      }
      .treemap-tool .tm-chip:hover {
        background: var(--surface-3, var(--surface-2));
        border-color: var(--border);
      }
      .treemap-tool .tm-chip.on {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--fg-bright);
      }
      .treemap-tool .tm-chip.muted {
        opacity: 0.6;
        cursor: default;
      }
      .treemap-tool .tm-chip-swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        display: inline-block;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.35) inset;
      }
      .treemap-tool .tm-chip-label {
        font-weight: 500;
        color: var(--fg-bright);
      }
      .treemap-tool .tm-chip-count {
        font-variant-numeric: tabular-nums;
        color: var(--fg-faint);
        font-size: 10px;
        margin-left: 2px;
      }

      @media (max-width: 900px) {
        .treemap-tool .tm-toggle-row { flex-direction: column; }
        .treemap-tool .tm-pill { flex-direction: row; align-items: baseline; justify-content: space-between; }
      }
      @media (max-width: 560px) {
        .treemap-tool .tm-legend-grid { gap: 4px; }
      }
    `}</style>
  );
}
