// V4 — SourceFeedTemplate
//
// W7 unblocker — layout primitive consumed by 16 source-feed routes:
//
//   /hackernews/trending  /reddit/trending  /bluesky/trending
//   /devto                /lobsters         /producthunt
//   /twitter              /npm              /arxiv/trending
//   /papers               /huggingface/trending
//   /huggingface/datasets /huggingface/spaces
//   /breakouts            (+ huggingface landing, +1 reserved)
//
// Mockup reference: sub-pages.html § "/hackernews" — the canonical "source
// feed" shape: PageHead, optional KpiBand, filter strip (sources × window),
// optional tab strip (Trending / All / Top), main feed with optional right
// rail, optional pagination footer.
//
// The template is a pure server component — no `'use client'`, no data
// fetching, no business logic. All slots are nodes; caller composes with
// V4 primitives (PanelHead, KpiBand, Chip, ChipGroup, FilterBar, TabBar,
// SectionHead, …).
//
// Layout:
//   PageHead
//   ├─ KpiBand (slot)
//   ├─ FilterBar (slot — Chip/ChipGroup/FilterBar)
//   ├─ TabBar (slot — optional Trending/All/Top tabs)
//   ├─ Body (1 col, or 2 col when rightRail set)
//   │   ├─ mainPanels — the feed
//   │   └─ rightRail  — optional sidebar (freshness, related, etc.)
//   └─ Footer (slot — pagination / "load more")
//
// Usage:
//   <SourceFeedTemplate
//     crumb={<><b>HN</b> · TERMINAL · /HACKERNEWS</>}
//     title="Hacker News · trending"
//     lede="Stories from the past 72 hours, scored by velocity…"
//     clock={<LiveClock />}
//     kpiBand={<KpiBand cells={[…]} />}
//     filterBar={<FilterBar><ChipGroup label="WINDOW">…</ChipGroup></FilterBar>}
//     tabBar={<TabBar items={…} active="trending" hrefFor={(id) => `?tab=${id}`} />}
//     mainPanels={<HnFeedTable rows={rows} />}
//     rightRail={<SourceRunFreshnessPanel … />}
//     footer={<Pagination page={1} total={42} />}
//   />

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PageHead } from "@/components/ui/PageHead";

export interface SourceFeedTemplateProps {
  // PageHead slots — caller can pass either (title + lede) for the standard
  // case, or override the entire head via `head` for fully custom heros
  // (e.g. /huggingface landing with a model picker).
  /** Top crumb. Example: <><b>HN</b> · TERMINAL · /HACKERNEWS</> */
  crumb?: ReactNode;
  /** H1 — sans 30px, ink-000. */
  title?: ReactNode;
  /** Lede paragraph below H1. */
  lede?: ReactNode;
  /** Right-aligned clock / actions slot inside PageHead. */
  clock?: ReactNode;
  /**
   * Escape hatch — when set, replaces the default <PageHead> entirely.
   * Use only when the standard head shape isn't enough (e.g. /huggingface
   * landing with a model-family picker).
   */
  head?: ReactNode;

  /** KPI band slot — typically <KpiBand cells={…} />. */
  kpiBand?: ReactNode;
  /** Filter strip slot — typically <FilterBar><ChipGroup …/>…</FilterBar>. */
  filterBar?: ReactNode;
  /** Tab bar slot — typically <TabBar items={…} active=… />. */
  tabBar?: ReactNode;

  /** Main body — the feed list / table / cards. */
  mainPanels?: ReactNode;
  /** Optional right rail — freshness, related sources, share/embed. */
  rightRail?: ReactNode;

  /** Optional bottom slot — pagination / "load more" / live wire. */
  footer?: ReactNode;

  className?: string;
  /**
   * Optional class overrides per slot — useful when a single page needs
   * tweak (e.g. wider rail). Each value is appended via cn().
   */
  classNames?: {
    head?: string;
    kpi?: string;
    filters?: string;
    tabs?: string;
    body?: string;
    main?: string;
    rail?: string;
    footer?: string;
  };
}

export function SourceFeedTemplate({
  crumb,
  title,
  lede,
  clock,
  head,
  kpiBand,
  filterBar,
  tabBar,
  mainPanels,
  rightRail,
  footer,
  className,
  classNames,
}: SourceFeedTemplateProps) {
  return (
    <div className={cn("v4-source-feed-template", className)}>
      <div className={cn("v4-source-feed-template__head", classNames?.head)}>
        {head ?? (
          <PageHead crumb={crumb} h1={title} lede={lede} clock={clock} />
        )}
      </div>

      {kpiBand ? (
        <div className={cn("v4-source-feed-template__kpi", classNames?.kpi)}>
          {kpiBand}
        </div>
      ) : null}

      {filterBar ? (
        <div
          className={cn(
            "v4-source-feed-template__filters",
            classNames?.filters,
          )}
        >
          {filterBar}
        </div>
      ) : null}

      {tabBar ? (
        <div className={cn("v4-source-feed-template__tabs", classNames?.tabs)}>
          {tabBar}
        </div>
      ) : null}

      <div
        className={cn(
          "v4-source-feed-template__body",
          Boolean(rightRail) && "v4-source-feed-template__body--with-rail",
          classNames?.body,
        )}
      >
        <div className={cn("v4-source-feed-template__main", classNames?.main)}>
          {mainPanels}
        </div>
        {rightRail ? (
          <aside
            className={cn("v4-source-feed-template__rail", classNames?.rail)}
          >
            {rightRail}
          </aside>
        ) : null}
      </div>

      {footer ? (
        <div
          className={cn("v4-source-feed-template__footer", classNames?.footer)}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
