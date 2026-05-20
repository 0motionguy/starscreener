import type { IdeaRecord, ReactionTallyForIdea } from "@/lib/ideas";
import { ideaEvidenceLabel } from "@/lib/ideas/display-data";
import type { ReactionCounts } from "@/lib/reactions-shape";

interface IdeaDetailSnapshotGridProps {
  idea: IdeaRecord;
  counts: ReactionCounts;
  tally: ReactionTallyForIdea;
}

export function IdeaDetailSnapshotGrid({
  idea,
  counts,
  tally,
}: IdeaDetailSnapshotGridProps) {
  const demand = counts.build + counts.use + counts.buy + counts.invest;
  const signal =
    demand >= 450 ? "Very strong" : demand >= 260 ? "Strong" : "Emerging";
  const cells = [
    {
      label: "Signal",
      value: signal,
      hint: "Category momentum plus repeated setup pain.",
    },
    {
      label: "Evidence",
      value: ideaEvidenceLabel(idea),
      hint: "Repos, issues, discussions, and demand comments.",
    },
    {
      label: "MVP",
      value: idea.buildStatus === "shipped" ? "Launched" : "2-3 weeks",
      hint: "One workflow, one target user, one proof surface.",
    },
    {
      label: "Demand",
      value: `${tally.use.toLocaleString()} would use`,
      hint: `${tally.build} build, ${tally.buy + tally.invest} high-intent`,
    },
  ];
  return (
    <section className="idea-snapshot" role="group" aria-label="Idea snapshot">
      {cells.map((c) => (
        <div className="snap-cell" key={c.label}>
          <div className="snap-label">{c.label}</div>
          <div className="snap-value">{c.value}</div>
          <div className="snap-hint">{c.hint}</div>
        </div>
      ))}
    </section>
  );
}
