// IdeaDetailSnapshotGrid — 4-cell snapshot above the tabs. Counts derived
// from reaction tallies + record fields.

import type { IdeaRecord } from "@/lib/ideas";
import type { ReactionCounts } from "@/lib/reactions-shape";

interface IdeaDetailSnapshotGridProps {
  idea: IdeaRecord;
  counts: ReactionCounts;
}

export function IdeaDetailSnapshotGrid({
  idea,
  counts,
}: IdeaDetailSnapshotGridProps) {
  const demand = counts.build + counts.use + counts.buy + counts.invest;
  const cells = [
    {
      label: "Demand signal",
      value: demand.toLocaleString(),
      hint: `${counts.build} build · ${counts.use} use`,
    },
    {
      label: "Commitment",
      value: (counts.buy + counts.invest).toLocaleString(),
      hint: `${counts.buy} buy · ${counts.invest} invest`,
    },
    {
      label: "Build status",
      value: idea.buildStatus,
      hint: idea.shippedRepoUrl ? "Shipped repo linked" : "Open for claim",
    },
    {
      label: "Target repos",
      value: idea.targetRepos.length.toLocaleString(),
      hint: idea.category ?? "no category",
    },
  ];
  return (
    <div className="idea-snapshot" role="group" aria-label="Idea snapshot">
      {cells.map((c) => (
        <div className="snap-cell" key={c.label}>
          <div className="snap-label">{c.label}</div>
          <div className="snap-value">{c.value}</div>
          <div className="snap-hint">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
