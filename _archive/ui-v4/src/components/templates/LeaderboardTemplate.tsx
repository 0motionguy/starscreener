// V4 — LeaderboardTemplate
//
// Layout primitive consumed by W8 (ecosystem-leaderboards-v4): one template,
// 6 leaderboard pages — Skills, MCP, Agents, AgentCommerce, ModelUsage,
// Categories — plus their /[slug] details (which use ProfileTemplate).
//
// Reference: home.html top10 panel + consensus.html banded leaderboard
// chrome (master plan §223–226).
//
// Slot composition (mirrors ProfileTemplate):
//   PageHead             — crumb / h1 / lede / clock pass-through
//   __kpi                — KpiBand slot (caller composes)
//   __filters            — FilterBar slot (Chip + ChipGroup + TabBar)
//   __featured           — hero band for the #1 entry (consensus banding)
//   __body               — 1- or 2-col grid (with-rail modifier)
//     __main             — main __leaderboard slot (RankRow × N or bands)
//     __rail             — optional right rail (methodology, related)
//   __footer             — optional related / methodology / collections
//
// Two body modes are supported:
//   1. `leaderboard` — caller passes a flat <RankRow> stack (canonical W8
//      shape per master plan).
//   2. `bands` — caller passes consensus-style verdict groups (Strong /
//      Early / Divergence / External / Single). Mutually exclusive with
//      `leaderboard`; bands win when both are provided.
//
// Server component — no `'use client'`. Tokens only — zero hardcoded hex.

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
  /** Top crumb. */
  crumb?: ReactNode;
  /** H1 — sans 30px, weight 500, leading 1.05, ink-000. */
  h1?: ReactNode;
  /** Lede paragraph. */
  lede?: ReactNode;
  /** Right-aligned clock / metadata column in PageHead. */
  clock?: ReactNode;

  /** KPI band slot (caller passes <KpiBand cells=…/>). */
  kpiBand?: ReactNode;
  /** Category / window filters strip (caller composes). */
  filterBar?: ReactNode;
  /** Featured band — hero treatment for the #1 entry. */
  featuredBand?: ReactNode;

  /** Main leaderboard slot — typically <RankRow> × N. */
  leaderboard?: ReactNode;
  /** Eyebrow above the leaderboard slot when used. */
  leaderboardEyebrow?: ReactNode;
  /** Mono prefix for the leaderboard SectionHead (e.g. "// 01"). */
  leaderboardNum?: string;

  /**
   * Optional banded leaderboard (consensus.html shape) — mutually exclusive
   * with `leaderboard`. When provided, replaces the flat list with one
   * `__band` section per entry. Bands win if both props are set.
   */
  bands?: LeaderboardBand[];

  /** Optional right-rail panel (methodology, recent activity, etc.). */
  rightRail?: ReactNode;

  /** Optional footer block — related leaderboards, methodology link, etc. */
  footer?: ReactNode;

  className?: string;
}

export function LeaderboardTemplate({
  crumb,
  h1,
  lede,
  clock,
  kpiBand,
  filterBar,
  featuredBand,
  leaderboard,
  leaderboardEyebrow = "LEADERBOARD",
  leaderboardNum = "// 01",
  bands,
  rightRail,
  footer,
  className,
}: LeaderboardTemplateProps) {
  const hasBands = Boolean(bands && bands.length > 0);
  return (
    <div className={cn("v4-leaderboard-template", className)}>
      <PageHead crumb={crumb} h1={h1} lede={lede} clock={clock} />

      {kpiBand ? (
        <div className="v4-leaderboard-template__kpi">{kpiBand}</div>
      ) : null}
      {filterBar ? (
        <div className="v4-leaderboard-template__filters">{filterBar}</div>
      ) : null}
      {featuredBand ? (
        <div className="v4-leaderboard-template__featured">{featuredBand}</div>
      ) : null}

      <div
        className={cn(
          "v4-leaderboard-template__body",
          Boolean(rightRail) && "v4-leaderboard-template__body--with-rail",
        )}
      >
        <div className="v4-leaderboard-template__main">
          {hasBands ? (
            bands!.map((band) => (
              <section
                key={band.key}
                className={cn(
                  "v4-leaderboard-template__band",
                  `v4-leaderboard-template__band--${band.key}`,
                )}
              >
                <header className="v4-leaderboard-template__band-head">
                  <span
                    className="v4-leaderboard-template__band-pip"
                    aria-hidden="true"
                  />
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
          ) : leaderboard ? (
            <>
              <SectionHead num={leaderboardNum} title={leaderboardEyebrow} />
              <div className="v4-leaderboard-template__leaderboard">
                {leaderboard}
              </div>
            </>
          ) : null}
        </div>
        {rightRail ? (
          <aside className="v4-leaderboard-template__rail">{rightRail}</aside>
        ) : null}
      </div>

      {footer ? (
        <div className="v4-leaderboard-template__footer">{footer}</div>
      ) : null}
    </div>
  );
}
