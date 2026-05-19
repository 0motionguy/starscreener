// /tools/treemap — V4 W6 (master plan §417).
//
// Treemap explorer. Two views:
//   - § 01  By stars     — cell size = star count
//   - § 02  By momentum  — cell size = momentum score (0-100)
//
// Server component. Reads the same derived Repo[] the homepage uses, no
// client interactivity beyond hover tooltips on the Treemap primitive
// itself (tooltips are SVG <title> via the cell, exposed by the OS).
//
// Layout algorithm (small in-file adapter — does NOT modify the Treemap
// primitive, which only renders pre-positioned cells per its contract):
//   1. Take the top N repos by value, group by language.
//   2. Each language becomes a vertical column whose width is proportional
//      to its total value across all repos in that language.
//   3. Within each column, repos are stacked top-to-bottom in horizontal
//      slices, slice height proportional to the repo's value share of its
//      language column.
//   4. Color comes from the V4 chart palette, keyed off language.
//
// This is the textbook "slice and dice" layout — not squarified, but
// dependable, deterministic, and readable at the cell counts we render
// (32 by stars, 32 by momentum). Squarified would be ~80 lines of layout
// code; slice-and-dice is ~30 and reads cleanly. If we ever need
// squarified, drop d3-hierarchy in.

import type { Metadata } from "next";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { Treemap, type TreemapCell } from "@/components/tools/Treemap";
import { getDerivedRepos } from "@/lib/derived-repos";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 1800;

export function generateMetadata(): Metadata {
  return {
    title: "Treemap explorer — TrendingRepo",
    description:
      "Visualize the top repos by star count and momentum, grouped by language. Two views drawn from the same momentum pipeline.",
  };
}

// V4 chart palette — repeats across the language list. Ordered roughly by
// "punchiness" so the most populous bands get the most distinct hues.
const LANGUAGE_PALETTE = [
  "var(--v4-cyan)",
  "var(--v4-violet)",
  "var(--v4-acc)",
  "var(--v4-money)",
  "var(--v4-blue)",
  "var(--v4-amber)",
  "var(--v4-pink)",
  "var(--v4-red)",
] as const;

const TREEMAP_W = 1180;
const TREEMAP_H = 480;
const TOP_N = 32;

interface RepoDatum {
  repo: Repo;
  value: number;
}

function languageLabel(lang: string | null | undefined): string {
  if (!lang) return "OTHER";
  return lang.toUpperCase();
}

/**
 * Layout slice-and-dice. Returns one TreemapCell per datum. Stable: cells
 * within a language column are ordered by value desc; columns are ordered
 * by total value desc.
 */
function layoutCells(
  data: RepoDatum[],
  width: number,
  height: number,
  colorByLanguage: Map<string, string>,
): TreemapCell[] {
  const totalValue = data.reduce((acc, d) => acc + d.value, 0);
  if (totalValue <= 0) return [];

  const byLanguage = new Map<string, RepoDatum[]>();
  for (const d of data) {
    const key = languageLabel(d.repo.language);
    const list = byLanguage.get(key) ?? [];
    list.push(d);
    byLanguage.set(key, list);
  }

  // Order: language columns by total value desc, repos within column by
  // value desc.
  const columns = Array.from(byLanguage.entries())
    .map(([lang, items]) => ({
      lang,
      items: [...items].sort((a, b) => b.value - a.value),
      total: items.reduce((acc, d) => acc + d.value, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const cells: TreemapCell[] = [];
  let cursorX = 0;
  for (const col of columns) {
    const colWidth = (col.total / totalValue) * width;
    if (colWidth <= 0) continue;
    const color =
      colorByLanguage.get(col.lang) ?? "var(--v4-ink-300)";
    let cursorY = 0;
    let placed = 0;
    for (const item of col.items) {
      const isLast = placed === col.items.length - 1;
      const rowHeight = isLast
        ? Math.max(0, height - cursorY)
        : (item.value / col.total) * height;
      // Hero treatment for the largest cell in the column when it
      // dominates (>= 50% of column total) and the column is wide enough
      // for the secondary subtitle to render legibly.
      const isHero =
        placed === 0 && item.value / col.total >= 0.5 && colWidth >= 110;
      cells.push({
        x: cursorX,
        y: cursorY,
        w: colWidth,
        h: rowHeight,
        color,
        label: col.lang,
        sub: item.repo.fullName,
        big: isHero,
      });
      cursorY += rowHeight;
      placed += 1;
    }
    cursorX += colWidth;
  }
  return cells;
}

function buildColorMap(data: RepoDatum[]): Map<string, string> {
  const totals = new Map<string, number>();
  for (const d of data) {
    const key = languageLabel(d.repo.language);
    totals.set(key, (totals.get(key) ?? 0) + d.value);
  }
  const ordered = Array.from(totals.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const colorMap = new Map<string, string>();
  ordered.forEach(([lang], i) => {
    colorMap.set(lang, LANGUAGE_PALETTE[i % LANGUAGE_PALETTE.length]);
  });
  return colorMap;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function TreemapToolPage() {
  const repos = getDerivedRepos();

  // By-stars dataset — drop archived/deleted/zero-star rows.
  const byStarsRaw: RepoDatum[] = repos
    .filter((r) => !r.archived && !r.deleted && r.stars > 0)
    .map((r) => ({ repo: r, value: r.stars }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N);

  // By-momentum dataset — drop zero-score rows.
  const byMomentumRaw: RepoDatum[] = repos
    .filter((r) => !r.archived && !r.deleted && r.momentumScore > 0)
    .map((r) => ({ repo: r, value: r.momentumScore }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N);

  const starsColors = buildColorMap(byStarsRaw);
  const momentumColors = buildColorMap(byMomentumRaw);

  const starsCells = layoutCells(byStarsRaw, TREEMAP_W, TREEMAP_H, starsColors);
  const momentumCells = layoutCells(
    byMomentumRaw,
    TREEMAP_W,
    TREEMAP_H,
    momentumColors,
  );

  const totalStars = byStarsRaw.reduce((acc, d) => acc + d.repo.stars, 0);

  // Top-language metric — share of cells occupied by the most-populous
  // language in the by-stars view (matches what a viewer first reads off
  // the chart).
  const langTallies = new Map<string, number>();
  for (const d of byStarsRaw) {
    const k = languageLabel(d.repo.language);
    langTallies.set(k, (langTallies.get(k) ?? 0) + 1);
  }
  const topLanguage = Array.from(langTallies.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const topLanguagePct =
    topLanguage && byStarsRaw.length > 0
      ? Math.round((topLanguage[1] / byStarsRaw.length) * 100)
      : 0;

  // Top-tag metric — most common tag across the rendered set.
  const tagTallies = new Map<string, number>();
  for (const d of byStarsRaw) {
    for (const t of d.repo.tags ?? []) {
      tagTallies.set(t, (tagTallies.get(t) ?? 0) + 1);
    }
  }
  const topTag = Array.from(tagTallies.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];

  const reposVisualized = byStarsRaw.length;

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>TREEMAP</b> · TERMINAL · /TOOLS/TREEMAP
          </>
        }
        h1="Treemap explorer."
        lede="Two views of the trending corpus: cells sized by star count and by momentum score, grouped and colored by language. Drawn from the same pipeline that feeds /signals and /consensus."
        clock={
          <>
            <span className="big">{reposVisualized}</span>
            <span className="muted">REPOS RENDERED</span>
            <LiveDot label="PIPELINE LIVE" />
          </>
        }
      />

      <KpiBand
        cells={[
          {
            label: "Repos visualized",
            value: String(reposVisualized),
            sub: `top ${TOP_N} per view`,
          },
          {
            label: "Total stars · view 01",
            value: formatNumber(totalStars),
            sub: "sum across rendered cells",
          },
          {
            label: "Top language · view 01",
            value: topLanguage ? topLanguage[0] : "—",
            tone: "acc",
            sub: topLanguage
              ? `${topLanguagePct}% of cells · ${topLanguage[1]} repos`
              : undefined,
          },
          {
            label: "Top tag · rendered set",
            value: topTag ? `#${topTag[0]}` : "—",
            tone: "money",
            sub: topTag ? `${topTag[1]} repos` : undefined,
          },
        ]}
      />

      <SectionHead
        num="// 01"
        title="By stars"
        meta={
          <>
            cell size · <b>star count</b> · group · language
          </>
        }
      />
      <div
        style={{
          padding: 0,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-025)",
          marginBottom: 28,
        }}
      >
        {starsCells.length > 0 ? (
          <Treemap cells={starsCells} width={TREEMAP_W} height={TREEMAP_H} />
        ) : (
          <div
            style={{
              padding: 24,
              color: "var(--v4-ink-300)",
              fontFamily: "var(--v4-mono)",
              fontSize: 12,
            }}
          >
            no rendered cells — pipeline returned no rows with stars &gt; 0
          </div>
        )}
      </div>

      <SectionHead
        num="// 02"
        title="By momentum"
        meta={
          <>
            cell size · <b>momentum score</b> · group · language
          </>
        }
      />
      <div
        style={{
          padding: 0,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-025)",
        }}
      >
        {momentumCells.length > 0 ? (
          <Treemap
            cells={momentumCells}
            width={TREEMAP_W}
            height={TREEMAP_H}
          />
        ) : (
          <div
            style={{
              padding: 24,
              color: "var(--v4-ink-300)",
              fontFamily: "var(--v4-mono)",
              fontSize: 12,
            }}
          >
            no rendered cells — pipeline returned no rows with momentum &gt; 0
          </div>
        )}
      </div>
    </main>
  );
}
