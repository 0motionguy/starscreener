// BuildEmptyStates — the 3 empty-state panels referenced in build.html.
// Rendered as a right-rail panel on the workspace view; on the
// no-repo-selected landing this is the primary content surface alongside
// the repo selector.

import Link from "next/link";

interface BuildEmptyStatesProps {
  /** When true, the "No repo connected" card is suppressed (we already
   *  have a repo selected and don't need to nag the user). */
  hasRepoSelected: boolean;
}

export function BuildEmptyStates({ hasRepoSelected }: BuildEmptyStatesProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Empty states</h2>
        <span className="meta">designed</span>
      </div>
      <div className="left-stack">
        {!hasRepoSelected ? (
          <div className="empty-state">
            <h3>No repo connected.</h3>
            <p>
              Connect or select a GitHub repo to detect meaningful build
              progress.
            </p>
            <Link
              className="tiny-btn primary"
              href="/sign-in?redirect_url=/build"
            >
              Connect GitHub
            </Link>
          </div>
        ) : null}
        <div className="empty-state">
          <h3>No publishable repo signals found yet.</h3>
          <p>
            TrendingRepo will suggest updates when releases, PRs, stars,
            milestones, contributors, or documentation changes appear.
          </p>
        </div>
        <div className="empty-state">
          <h3>All updates published.</h3>
          <p>
            The queue is clean. New suggestions appear when your repo ships
            something worth sharing.
          </p>
        </div>
      </div>
    </section>
  );
}
