// BuildTimelinePreview - right-rail preview of the project's public timeline.

import type { BuildSignal } from "./build-signals";

interface BuildTimelinePreviewProps {
  recentSignals: BuildSignal[];
}

const SEEDED_TIMELINE: BuildSignal[] = [
  {
    id: "timeline-readme",
    kind: "readme",
    title: "Improved onboarding",
    summary: "README setup, env checks, and first-run guidance are clearer.",
    detectedAge: "today",
    angle: "developer experience improved",
    strength: "strong",
  },
  {
    id: "timeline-release",
    kind: "release",
    title: "Released v0.4",
    summary: "A tagged milestone packages the latest CLI and docs updates.",
    detectedAge: "yesterday",
    angle: "milestone release",
    strength: "strong",
  },
  {
    id: "timeline-pr",
    kind: "pr",
    title: "Made failed repo operations easier",
    summary: "Recovery copy and retry guidance are clearer for maintainers.",
    detectedAge: "2 days ago",
    angle: "reliability improvement",
    strength: "med",
  },
  {
    id: "timeline-stars",
    kind: "stars",
    title: "Crossed visibility threshold",
    summary: "The project picked up fresh star velocity from tracked sources.",
    detectedAge: "3 days ago",
    angle: "momentum milestone",
    strength: "med",
  },
];

export function BuildTimelinePreview({
  recentSignals,
}: BuildTimelinePreviewProps) {
  const rows = recentSignals.length ? recentSignals.slice(0, 4) : SEEDED_TIMELINE;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Project timeline preview</h2>
        <span className="meta">public page</span>
      </div>
      <div className="timeline" id="timeline">
        {rows.map((s) => (
          <article className="timeline-item" key={`tl-${s.id}`}>
            <div className="timeline-dot" />
            <div className="timeline-card">
              <h3>{s.title}</h3>
              <p>{s.summary}</p>
              <div className="tag-row">
                <span className="tag">{s.angle}</span>
                <span className="tag">{s.kind}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
