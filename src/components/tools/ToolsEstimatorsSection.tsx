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
        num="03"
        title="Estimators and contribution"
        meta={`${overlayCount.toLocaleString()} revenue overlays`}
      />
      <div className="g-3">
        {(filter === "all" || filter === "estimators") && (
          <ToolCard
            number="07"
            route="/tools/revenue-estimate"
            routeLabel="ARR"
            title="Revenue Estimate"
            description="Use verified overlays and benchmarks to frame OSS business traction."
            footMeta={`${submissionsApprovedThisWeek.toLocaleString()} approved / 7d`}
          >
            <ValuePreview label="overlays" value={overlayCount} />
          </ToolCard>
        )}
        {(filter === "all" || filter === "contribute") && (
          <ToolCard
            number="08"
            route="#ideas"
            routeLabel="IDEAS"
            title="Ideas Board"
            description={topIdeaTitle ?? "Published build ideas and shipped repo opportunities."}
            footMeta={`${ideasPublished.toLocaleString()} published`}
          >
            <ValuePreview label="shipped" value={ideasShipped} tone="green" />
          </ToolCard>
        )}
        {(filter === "all" || filter === "contribute") && (
          <ToolCard
            number="09"
            route="/submit/revenue"
            routeLabel="SUBMIT"
            title="Submit Revenue"
            description="Contribute verified revenue data for OSS-adjacent startups."
            footPrimary="SUBMIT"
            footMeta="moderated queue"
          >
            <ValuePreview label="queue" value={submissionsApprovedThisWeek} tone="cyan" />
          </ToolCard>
        )}
      </div>
    </section>
  );
}

function ValuePreview({
  label,
  value,
  tone = "accent",
}: {
  label: string;
  value: number;
  tone?: "accent" | "green" | "cyan";
}) {
  const color =
    tone === "green" ? "var(--up)" : tone === "cyan" ? "var(--cyan)" : "var(--accent)";
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 32, color }}>
        {value.toLocaleString()}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-faint)" }}>
        {label}
      </span>
    </div>
  );
}
