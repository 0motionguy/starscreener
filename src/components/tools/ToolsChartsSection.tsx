import { SectionEyebrow, ToolCard } from "./ToolCard";
import type { ToolsFilter } from "./ToolsHubHero";

interface ToolsChartsSectionProps {
  filter: ToolsFilter;
  trackedRepoCount: number;
  treemapRepoCount: number;
  treemapCategoryCount: number;
}

export function ToolsChartsSection({
  filter,
  trackedRepoCount,
  treemapRepoCount,
  treemapCategoryCount,
}: ToolsChartsSectionProps) {
  if (filter !== "all" && filter !== "charts") return null;

  return (
    <section>
      <SectionEyebrow
        num="01"
        title="Charts"
        meta={<><b>2</b> live - multi-repo plots</>}
      />
      <div className="tool-grid compact fade-up">
        <ToolCard
          number="01"
          route="#starhistory"
          routeLabel="CHART"
          title="Star History"
          description={
            <>
              Plot up to <b>6 repos head-to-head</b> with editorial export themes
              (Blueprint, Neon, NYT). Server-rendered PNGs for embed.
            </>
          }
          footMeta={<>{trackedRepoCount.toLocaleString()} repos - PNG export <span className="pro-tag">PRO</span></>}
        >
          <div className="pv-stars">
            <svg viewBox="0 0 240 80" preserveAspectRatio="none" aria-hidden="true">
              <path className="l1" d="M0,70 Q40,60 60,50 Q90,32 130,22 Q170,14 200,8 L240,4" />
              <path className="l2" d="M0,72 Q40,68 60,62 Q90,52 130,46 Q170,40 200,34 L240,28" />
              <path className="l3" d="M0,74 Q40,72 60,70 Q90,66 130,62 Q170,58 200,54 L240,48" />
            </svg>
          </div>
        </ToolCard>
        <ToolCard
          number="02"
          route="#treemap"
          routeLabel="CHART"
          title="Treemap"
          description={
            <>
              Sector treemap of trending repos: <b>area scales with momentum</b>,
              color encodes category. Drill into any tile.
            </>
          }
          footMeta={`${treemapRepoCount.toLocaleString()} repos - ${treemapCategoryCount.toLocaleString()} sectors`}
        >
          <div className="pv-tree">
            <div className="t1" />
            <div className="t2" />
            <div className="t3" />
          </div>
        </ToolCard>
      </div>
    </section>
  );
}
