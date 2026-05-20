import type { IdeaBuildStatus } from "@/lib/ideas";

interface IdeaProgressLineProps {
  buildStatus: IdeaBuildStatus;
  claimed?: boolean;
}

const STEPS = [
  { id: "open", label: "Open" },
  { id: "claimed", label: "Claimed" },
  { id: "repo", label: "Repo attached" },
  { id: "building", label: "Building" },
  { id: "launched", label: "Launched" },
] as const;

function activeIndex(buildStatus: IdeaBuildStatus, claimed: boolean): number {
  if (buildStatus === "shipped") return 4;
  if (buildStatus === "building") return 3;
  if (buildStatus === "scoping") return claimed ? 1 : 0;
  return claimed ? 1 : 0;
}

export function IdeaProgressLine({
  buildStatus,
  claimed = false,
}: IdeaProgressLineProps) {
  const activeIdx = activeIndex(buildStatus, claimed);
  const paused = buildStatus === "abandoned";
  return (
    <div
      className={`progress-line ${paused ? "paused" : ""}`}
      role="progressbar"
      aria-label="Build progress"
      aria-valuenow={activeIdx + 1}
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
    >
      {STEPS.map((s, i) => (
        <div
          key={s.id}
          className={`progress-step ${
            i <= activeIdx ? "done" : ""
          } ${i === activeIdx ? "active" : ""}`}
        >
          <span className="progress-dot">{i + 1}</span>
          <span className="progress-label">{s.label}</span>
        </div>
      ))}
      {paused ? <span className="progress-paused">paused</span> : null}
    </div>
  );
}
