// BuildTimelinePreview — right-rail preview of the project's public
// timeline. Phase 4C ships GET /api/build/timeline?repoId=... which will
// hydrate this list with real published updates; for Phase 3E we render
// either:
//   - up to 4 most-recent placeholder rows derived from the same signal
//     pool that feeds the suggested updates grid, or
//   - an empty state when there's no published timeline yet.

import type { BuildSignal } from "./build-signals";

interface BuildTimelinePreviewProps {
  recentSignals: BuildSignal[];
}

export function BuildTimelinePreview({
  recentSignals,
}: BuildTimelinePreviewProps) {
  if (recentSignals.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Project timeline preview</h2>
          <span className="meta">public page</span>
        </div>
        <div className="empty-state">
          <h3>No published updates yet.</h3>
          <p>
            Approved updates will appear here and on the public project
            timeline.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Project timeline preview</h2>
        <span className="meta">public page</span>
      </div>
      <div className="timeline" id="timeline">
        {recentSignals.slice(0, 4).map((s) => (
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
