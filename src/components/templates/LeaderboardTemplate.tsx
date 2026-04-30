// V4 — LeaderboardTemplate
//
// Layout primitive consumed by W8 (ecosystem-leaderboards-v4): one
// template, 8 pages (Skills, MCP, AgentRepos, AgentCommerce, ModelUsage,
// Categories, Collections + their /[slug] details).
//
// Reference: home.html top10 panel + consensus.html banded leaderboard
// chrome.
//
// Layout:
//   PageHead
//   KpiBand (caller composes)
//   FilterBar (caller composes — Chip + ChipGroup + TabBar)
//   Banded leaderboard rows OR flat list
//
// Bands are optional: pass `bands` for the consensus-style verdict groups
// (Strong / Early / Divergence / External / Single), or just `rows` for a
// flat ranked list.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";

export interface LeaderboardBand {
  /** Band key — drives the band-pip color. */
  key: "cons" | "early" | "div" | "ext" | "single" | "default";
  /** Band header label (e.g. "STRONG CONSENSUS"). */
  title: ReactNode;
  /** Optional eyebrow / num prefix (e.g. "// 01"). */
  num?: ReactNode;
  /** Band rows — typically RankRow stack. */
  rows: ReactNode;
  /** Per-band meta (e.g. "7 · in band"). */
  meta?: ReactNode;
}

export interface LeaderboardTemplateProps {
  // PageHead slots
  crumb?: ReactNode;
  title?: ReactNode;
  lede?: ReactNode;
  clock?: ReactNode;

  // Above-fold composition
  kpiBand?: ReactNode;
  filterBar?: ReactNode;

  // Body — ONE of these:
  bands?: LeaderboardBand[];
  rows?: ReactNode;
  rowsEyebrow?: ReactNode;

  /** Optional right-rail panel (e.g. methodology, recent activity). */
  rightRail?: ReactNode;

  className?: string;
}

export function LeaderboardTemplate({
  crumb,
  title,
  lede,
  clock,
  kpiBand,
  filterBar,
  bands,
  rows,
  rowsEyebrow = "LEADERBOARD",
  rightRail,
  className,
}: LeaderboardTemplateProps) {
  const hasBands = bands && bands.length > 0;
  return (
    <div className={cn("v4-leaderboard-template", className)}>
      <PageHead crumb={crumb} h1={title} lede={lede} clock={clock} />

      {kpiBand ? <div className="v4-leaderboard-template__kpi">{kpiBand}</div> : null}
      {filterBar ? <div className="v4-leaderboard-template__filter">{filterBar}</div> : null}

      <div
        className={cn(
          "v4-leaderboard-template__body",
          Boolean(rightRail) && "v4-leaderboard-template__body--with-rail",
        )}
      >
        <div className="v4-leaderboard-template__main">
          {hasBands ? (
            bands.map((band) => (
              <section
                key={band.key}
                className={cn(
                  "v4-leaderboard-template__band",
                  `v4-leaderboard-template__band--${band.key}`,
                )}
              >
                <header className="v4-leaderboard-template__band-head">
                  <span className="v4-leaderboard-template__band-pip" aria-hidden="true" />
                  <div>
                    {band.num ? (
                      <div className="v4-leaderboard-template__band-num">
                        {band.num}
                      </div>
                    ) : null}
                    <h2 className="v4-leaderboard-template__band-title">
                      {band.title}
                    </h2>
                  </div>
                  {band.meta ? (
                    <span className="v4-leaderboard-template__band-meta">
                      {band.meta}
                    </span>
                  ) : null}
                </header>
                <div className="v4-leaderboard-template__band-rows">
                  {band.rows}
                </div>
              </section>
            ))
          ) : rows ? (
            <>
              <SectionHead num="// 01" title={rowsEyebrow} />
              <div className="v4-leaderboard-template__rows">{rows}</div>
            </>
          ) : null}
        </div>
        {rightRail ? (
          <aside className="v4-leaderboard-template__rail">{rightRail}</aside>
        ) : null}
      </div>
    </div>
  );
}
