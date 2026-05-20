// IdeaRelatedReposTab — cards for each entry in idea.targetRepos. We
// don't fetch repo profiles here (cheap to defer); each card links to
// /repo/[owner]/[name] which handles its own data load.

import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";

interface IdeaRelatedReposTabProps {
  idea: IdeaRecord;
}

export function IdeaRelatedReposTab({ idea }: IdeaRelatedReposTabProps) {
  return (
    <section
      className="tab-pane tab-related"
      role="tabpanel"
      aria-labelledby="idea-tab-related"
    >
      <div className="section-title">
        <h2>Related repos</h2>
        <span>evidence links</span>
      </div>
      {idea.targetRepos.length === 0 ? (
        <div className="empty-card">
          <h3>No related repos found</h3>
          <p>Add a repo URL to strengthen the opportunity evidence.</p>
        </div>
      ) : (
        <div className="related-cards repo-list">
          {idea.targetRepos.map((repo) => (
            <Link
              key={repo}
              href={`/repo/${repo}`}
              className="related-card repo-card"
              prefetch={false}
            >
              <div className="rc-name">{repo}</div>
              <div className="rc-meta">github.com/{repo}</div>
              <div className="rc-cta">Open repo profile →</div>
            </Link>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn"
        disabled
        title="Coming soon — the related-repo picker ships with Phase 4D. For now, attach a repo via the hero action button."
      >
        Add related repo
      </button>
    </section>
  );
}
