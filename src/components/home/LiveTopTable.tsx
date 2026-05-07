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
  DollarSign,
} from "lucide-react";
import { BrandStar } from "@/components/shared/BrandStar";

import {
  GithubIcon,
  HackerNewsIcon,
  RedditIcon,
  BlueskyIcon,
  DevtoIcon,
  LobstersIcon,
  XIcon,
  ProductHuntIcon,
} from "@/components/brand/BrandIcons";
import { RankStarMark } from "@/components/brand/RankStarMark";
import { useCompareStore, useWatchlistStore } from "@/lib/store";
import {
  toastCompareAdded,
  toastCompareFull,
  toastCompareRemoved,
  toastWatchAdded,
  toastWatchRemoved,
} from "@/lib/toast";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { EChartSparkline } from "@/components/charts/EChartSparkline";
import { FreshnessChip } from "@/components/shared/FreshnessChip";
import { repoLogoUrl } from "@/lib/logos";
import { useViewportPrefetch } from "@/hooks/useViewportPrefetch";
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
  | "arxiv"
  | "ph"
  | "fund";

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
  /**
   * AGN-450: per-row freshness timestamp. ISO string of when the underlying
   * row data was last fetched. Falls back to the page-level lastFetchedAt
   * when the row doesn't carry its own (most rows in v1).
   */
  updatedAt?: string | null;
}

// Wrap brand icons to swallow extra lucide props (className, strokeWidth) the
// shared icon-component shape passes through, AND force `monochrome` so the
// icon glyph is drawn in `currentColor` (set by the .sd-* chip CSS) instead
// of its canonical brand fill. Without this, dev.to (#0A0A0A) is invisible
// on the dark row bg, Lobsters' inset cutout disappears at chip scale, and
// the assorted brand colours fight for attention. Monochrome glyphs +
// brand-coloured chip backgrounds keep every chip legible at 20×20.
type IconCmp = (props: { size?: number; className?: string }) => React.ReactElement;
const NpmIcon: IconCmp = (p) => <Package {...p} />;
const HfIcon: IconCmp = (p) => <Brain {...p} />;
const ArxivIcon: IconCmp = (p) => <FileText {...p} />;
const FundingIcon: IconCmp = (p) => <DollarSign {...p} />;
const GithubMono: IconCmp = (p) => <GithubIcon {...p} monochrome />;
const XMono: IconCmp = (p) => <XIcon {...p} monochrome />;
const RedditMono: IconCmp = (p) => <RedditIcon {...p} monochrome />;
const HnMono: IconCmp = (p) => <HackerNewsIcon {...p} monochrome />;
const BlueskyMono: IconCmp = (p) => <BlueskyIcon {...p} monochrome />;
const DevtoMono: IconCmp = (p) => <DevtoIcon {...p} monochrome />;
const LobstersMono: IconCmp = (p) => <LobstersIcon {...p} monochrome />;
const PhMono: IconCmp = (p) => <ProductHuntIcon {...p} monochrome />;

const ROW_SOURCE_ICONS = [
  { key: "gh", label: "GitHub", Icon: GithubMono },
  { key: "x", label: "X / Twitter", Icon: XMono },
  { key: "r", label: "Reddit", Icon: RedditMono },
  { key: "hn", label: "Hacker News", Icon: HnMono },
  { key: "b", label: "Bluesky", Icon: BlueskyMono },
  { key: "d", label: "dev.to", Icon: DevtoMono },
  { key: "lobsters", label: "Lobsters", Icon: LobstersMono },
  { key: "ph", label: "Product Hunt", Icon: PhMono },
  { key: "npm", label: "npm", Icon: NpmIcon },
  { key: "hf", label: "HuggingFace", Icon: HfIcon },
  { key: "arxiv", label: "arXiv", Icon: ArxivIcon },
  { key: "fund", label: "Funding news", Icon: FundingIcon },
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
  const raw = (delta / Math.max(1, base - delta)) * 100;
  // For tiny deltas (e.g. +45 stars on a 25k repo = 0.18%) Math.round drops
  // to 0 and we render "+0%" which looks broken. Use one decimal place when
  // the magnitude is below 1, integer otherwise. Floor-toward-zero on the
  // integer cast so "+0.4%" stays "+0.4%" instead of getting double-rounded.
  const sign = raw >= 0 ? "+" : "";
  if (Math.abs(raw) < 1) {
    const oneDecimal = Math.round(raw * 10) / 10;
    if (oneDecimal === 0) {
      // Even 1dp rounds to zero — surface a '<0.1%' marker rather than 0.
      return raw > 0 ? "+<0.1%" : "-<0.1%";
    }
    return `${sign}${oneDecimal.toFixed(1)}%`;
  }
  const pct = Math.round(raw);
  return `${sign}${pct}%`;
}

// sparkline rendering moved to <EChartSparkline /> — the inline-SVG
// sparkPath / sparkEnd / stableLiveSparkGradientId helpers were dropped
// when the sparkline column swapped to ECharts canvas.

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
  // AGN-1782: viewport-triggered prefetch for /repo/{owner}/{name} routes.
  // Each row anchor uses the ref to opt into the IntersectionObserver. The
  // hook caps in-flight prefetches at 5 and skips entirely under Save-Data.
  const observePrefetch = useViewportPrefetch();

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
                        <RankStarMark />
                      </span>
                    ) : null}
                    <span className="rk-n">
                      #{String(index + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td>
                    <a
                      className="repo-cell"
                      href={row.href}
                      ref={(el) => observePrefetch(row.href, el)}
                    >
                      <EntityLogo
                        src={repoLogoUrl(row.fullName, 64)}
                        name={row.fullName}
                        size={28}
                      />
                      <span className="repo-txt">
                        <span>{row.fullName}</span>
                        <small>
                          {row.categoryLabel} / {row.language ?? "mixed"}
                          {row.updatedAt ? (
                            <>
                              {" · "}
                              <FreshnessChip updatedAt={row.updatedAt} size="xs" />
                            </>
                          ) : null}
                        </small>
                      </span>
                    </a>
                  </td>
                  <td className="mentions-cell">
                    <span className="mentions-pills" aria-label="Source mentions">
                      {ROW_SOURCE_ICONS.flatMap(({ key, label, Icon }) => {
                        const count = row.sources[key] ?? 0;
                        // Skip sources with zero matches entirely — pre-fix
                        // every row rendered all 12 source slots with the
                        // empty ones greyed out, which made every row look
                        // mostly-cold even when 4-5 chips were firing.
                        // Showing only the matched chips makes coverage
                        // legible at a glance.
                        if (count <= 0) return [];
                        const tooltip = `${label}: ${count} mention${count === 1 ? "" : "s"} (7d)`;
                        return [
                          <span
                            key={key}
                            className={`sd sd-${key} on`}
                            title={tooltip}
                            aria-label={tooltip}
                          >
                            <Icon size={14} />
                          </span>,
                        ];
                      })}
                    </span>
                    <span className="mentions-count">
                      {formatCompact(row.mentionCount24h)}
                    </span>
                  </td>
                  <td className="num metric-num stars-num">
                    <span className="stars-main">
                      <BrandStar size={12} />
                      {formatCompact(row.stars)}
                    </span>
                  </td>
                  <td className={`num metric-num ${row.starsDelta24h < 0 ? "dn" : "up"}`}>
                    {formatDelta(row.starsDelta24h)}
                    {pct24 ? <small className="pct">{pct24}</small> : null}
                  </td>
                  <td className={`num metric-num ${row.starsDelta7d < 0 ? "dn" : "up"}`}>
                    {formatDelta(row.starsDelta7d)}
                    {pct7 ? <small className="pct">{pct7}</small> : null}
                  </td>
                  <td className={`num metric-num ${row.starsDelta30d < 0 ? "dn" : "up"}`}>
                    {formatDelta(row.starsDelta30d)}
                    {pct30 ? <small className="pct">{pct30}</small> : null}
                  </td>
                  <td className="ch">
                    <EChartSparkline
                      values={row.sparklineData}
                      className="spark-row"
                      color={
                        row.starsDelta24h < 0
                          ? "var(--sig-red)"
                          : "var(--sig-green)"
                      }
                      tooltipLabel="stars"
                    />
                  </td>
                  <td className="num metric-num">{formatCompact(row.forks)}</td>
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
