import Link from "next/link";

import { IdeaAddRelatedRepoButton } from "@/components/ideas/IdeaAddRelatedRepoButton";
import type { IdeaRecord } from "@/lib/ideas";
import { relatedReposForIdea } from "@/lib/ideas/display-data";

interface IdeaRelatedReposTabProps {
  idea: IdeaRecord;
  /** Forwarded to the add-related-repo button so it can prompt sign-in
   * without forcing a Clerk round-trip on every render. */
  signedIn: boolean;
}

export function IdeaRelatedReposTab({
  idea,
  signedIn,
}: IdeaRelatedReposTabProps) {
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
      <IdeaAddRelatedRepoButton ideaId={idea.id} signedIn={signedIn} />
    </section>
  );
}
