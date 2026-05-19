// IdeaRelatedReposTab — cards for each entry in idea.targetRepos. We
// don't fetch repo profiles here (cheap to defer); each card links to
// /repo/[owner]/[name] which handles its own data load.

import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";

interface IdeaRelatedReposTabProps {
  idea: IdeaRecord;
}

export function IdeaRelatedReposTab({ idea }: IdeaRelatedReposTabProps) {
  if (idea.targetRepos.length === 0) {
    return (
      <section className="tab-pane tab-related">
        <p className="muted">
          No related repos cited. When contributors drop GitHub URLs in the
          discussion (Phase 4C), they&apos;ll surface here.
        </p>
      </section>
    );
  }
  return (
    <section className="tab-pane tab-related">
      <div className="related-cards">
        {idea.targetRepos.map((repo) => (
          <Link
            key={repo}
            href={`/repo/${repo}`}
            className="related-card"
            prefetch={false}
          >
            <div className="rc-name">{repo}</div>
            <div className="rc-meta">github.com/{repo}</div>
            <div className="rc-cta">Open repo profile →</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
