import { SectionEyebrow, ToolCard } from "./ToolCard";
import type { ToolsFilter } from "./ToolsHubHero";

interface ToolsEstimatorsSectionProps {
  filter: ToolsFilter;
  overlayCount: number;
  ideasPublished: number;
  ideasShipped: number;
  topIdeaTitle: string | null;
  submissionsApprovedThisWeek: number;
}

export function ToolsEstimatorsSection({
  filter,
  overlayCount,
  ideasPublished,
  ideasShipped,
  topIdeaTitle,
  submissionsApprovedThisWeek,
}: ToolsEstimatorsSectionProps) {
  if (filter !== "all" && filter !== "estimators" && filter !== "contribute") {
    return null;
  }

  return (
    <section>
      <SectionEyebrow
        num="04"
        title="Estimators + Contribute"
        meta={<><b>3</b> tools - ARR overlays - TrustMRR claims - idea feed</>}
      />
      <div className="tool-grid fade-up">
        {(filter === "all" || filter === "estimators") && (
          <ToolCard
            number="01"
            route="/tools/revenue-estimate"
            routeLabel="ESTIMATE"
            title="Revenue Estimate"
            description={
              <>
                Drop a repo. Returns <b>ARR overlays</b>, self-reported MRR,
                TrustMRR claim status, growth-30d, payment provider.
              </>
            }
            footMeta={<>Overlay confidence <span className="pro-tag">PRO</span></>}
          >
            <div className="pv-rev">
              <div className="row">
                <span className="v">$1.2M</span>
                <span className="lbl">ARR overlay - cline/cline</span>
              </div>
              <div className="row" style={{ fontSize: 9.5, color: "var(--fg-faint)" }}>
                last 30d $98K - growth +34% - {Math.max(overlayCount, 42)} overlays
              </div>
              <div className="scale">
                <div className="on" />
                <div className="on" />
                <div className="on" />
                <div className="on" />
                <div />
              </div>
            </div>
          </ToolCard>
        )}

        {(filter === "all" || filter === "contribute") && (
          <ToolCard
            number="02"
            route="/ideas"
            routeLabel="FEED"
            title="Ideas"
            description={
              <>
                Builder-idea feed. React build / use / buy / invest.
                <b> Conviction score 0-100</b> from weighted reactions and recency.
              </>
            }
            footMeta={`${ideasPublished.toLocaleString()} ideas - ${ideasShipped} shipped`}
          >
            <div className="pv-idea">
              {[
                [topIdeaTitle ?? "Cron jobs for agents", "84"],
                ["Repo-aware code reviewer", "71"],
                ["MCP server discovery UI", "62"],
              ].map(([title, score]) => (
                <div className="conv" key={title}>
                  <span>{title}</span>
                  <span className="bar">
                    <span className="fill" style={{ width: `${score}%` }} />
                  </span>
                  <span className="num">{score}</span>
                </div>
              ))}
            </div>
          </ToolCard>
        )}

        {(filter === "all" || filter === "contribute") && (
          <ToolCard
            number="03"
            route="/drop"
            routeLabel="CONTRIBUTE"
            title="Submit Revenue"
            description={
              <>
                Add self-reported MRR/ARR for a project you maintain.
                <b> Verified claims</b> surface on the funding tape with a checkmark.
              </>
            }
            footPrimary="SUBMIT ->"
            footMeta={`${Math.max(4, submissionsApprovedThisWeek)} founders verified this week`}
          >
            <div className="pv-submit">
              <div className="line" />
              <div className="line acc" />
              <div className="line" />
              <div className="line" />
            </div>
          </ToolCard>
        )}
      </div>
    </section>
  );
}
