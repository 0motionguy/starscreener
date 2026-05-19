// IdeaOverviewTab — body content + meta block. Long-form is the idea's
// `body` field; falls back to the pitch if body is empty.

import type { IdeaRecord } from "@/lib/ideas";

interface IdeaOverviewTabProps {
  idea: IdeaRecord;
}

export function IdeaOverviewTab({ idea }: IdeaOverviewTabProps) {
  const lines = (idea.body ?? idea.pitch).split(/\n\n+/);
  return (
    <section className="tab-pane tab-overview">
      <div className="overview-body">
        {lines.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <aside className="overview-meta">
        <h4>Tags</h4>
        {idea.tags.length === 0 ? (
          <p className="muted">No tags</p>
        ) : (
          <ul className="tag-list">
            {idea.tags.map((t) => (
              <li key={t} className="tag-pill">
                {t}
              </li>
            ))}
          </ul>
        )}
        <h4>Posted</h4>
        <p className="muted">{new Date(idea.createdAt).toLocaleString()}</p>
        {idea.publishedAt ? (
          <>
            <h4>Published</h4>
            <p className="muted">
              {new Date(idea.publishedAt).toLocaleString()}
            </p>
          </>
        ) : null}
      </aside>
    </section>
  );
}
