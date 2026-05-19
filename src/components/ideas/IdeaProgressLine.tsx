// IdeaProgressLine — horizontal 4-step progress: exploring → scoping →
// building → shipped (abandoned renders as an off-state marker). Active
// step derives from idea.buildStatus.

import type { IdeaBuildStatus } from "@/lib/ideas";

interface IdeaProgressLineProps {
  buildStatus: IdeaBuildStatus;
}

const STEPS: { id: IdeaBuildStatus; label: string }[] = [
  { id: "exploring", label: "Open" },
  { id: "scoping", label: "Scoping" },
  { id: "building", label: "Building" },
  { id: "shipped", label: "Shipped" },
];

export function IdeaProgressLine({ buildStatus }: IdeaProgressLineProps) {
  const activeIdx = STEPS.findIndex((s) => s.id === buildStatus);
  const paused = buildStatus === "abandoned";
  return (
    <div
      className={`progress-line ${paused ? "paused" : ""}`}
      role="progressbar"
      aria-label="Build progress"
      aria-valuenow={activeIdx >= 0 ? activeIdx + 1 : 1}
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
          <span className="progress-dot" />
          <span className="progress-label">{s.label}</span>
        </div>
      ))}
      {paused ? (
        <span className="progress-paused" title="Build abandoned">
          abandoned
        </span>
      ) : null}
    </div>
  );
}
