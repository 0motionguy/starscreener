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
        meta={`${trackedRepoCount.toLocaleString()} tracked repos`}
      />
      <div className="g-3" style={{ alignItems: "stretch" }}>
        <ToolCard
          number="01"
          route="/tools/star-history"
          routeLabel="CHART"
          title="Star History"
          description="Compare momentum curves for tracked repos without leaving the desk."
          footMeta={`${trackedRepoCount.toLocaleString()} repos indexed`}
        >
          <PreviewBars values={[30, 48, 44, 68, 84, 76, 96]} />
        </ToolCard>
        <ToolCard
          number="02"
          route="/tools/treemap"
          routeLabel="MAP"
          title="Treemap"
          description="Scan category concentration and spot where repo velocity is clustering."
          footMeta={`${treemapCategoryCount.toLocaleString()} categories`}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 0.8fr", gap: 4, height: "100%" }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                style={{
                  minHeight: i % 2 ? 34 : 22,
                  background: i === 1 ? "var(--accent)" : "var(--surface-3)",
                  opacity: i === 1 ? 0.85 : 1,
                }}
              />
            ))}
          </div>
        </ToolCard>
        <ToolCard
          number="03"
          route="/market-signals"
          routeLabel="SIGNALS"
          title="Market Signals"
          description="Jump into npm, arXiv, and cross-source signal walls from the tool hub."
          footMeta={`${treemapRepoCount.toLocaleString()} repo rows`}
        >
          <PreviewBars values={[18, 36, 28, 58, 40, 72, 63]} tone="cyan" />
        </ToolCard>
      </div>
    </section>
  );
}

function PreviewBars({
  values,
  tone = "accent",
}: {
  values: number[];
  tone?: "accent" | "cyan";
}) {
  return (
    <div style={{ display: "flex", alignItems: "end", gap: 5, height: "100%" }}>
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          style={{
            flex: 1,
            height: `${value}%`,
            minHeight: 8,
            background: tone === "cyan" ? "var(--cyan)" : "var(--accent)",
            opacity: 0.35 + index / (values.length * 1.7),
          }}
        />
      ))}
    </div>
  );
}
