import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";
import { relatedReposForIdea } from "@/lib/ideas/display-data";

interface IdeaRelatedReposTabProps {
  idea: IdeaRecord;
}

export function IdeaRelatedReposTab({ idea }: IdeaRelatedReposTabProps) {
  const repos = relatedReposForIdea(idea);
  return (
    <section className="tab-pane tab-related">
      <div className="section-block">
        <div className="section-title">
          <h2>Related repos</h2>
          <span>evidence links</span>
        </div>
        <div className="related-cards">
          {repos.map((repo, index) => (
            <Link
              key={repo}
              href={`/repo/${repo}`}
              className="related-card"
              prefetch={false}
            >
              <div className="rc-rank">0{index + 1}</div>
              <div>
                <div className="rc-name">{repo}</div>
                <div className="rc-meta">
                  {index === 0
                    ? "primary evidence"
                    : index === 1
                      ? "adjacent demand"
                      : "launch channel"}
                </div>
              </div>
              <div className="rc-cta">Open repo profile</div>
              <div className="repo-reason">
                Relevance: repeated demand around {idea.category ?? "developer"}
                workflows and setup confidence.
              </div>
            </Link>
          ))}
        </div>
        <Link href="/drop" className="btn" prefetch={false}>
          Add related repo
        </Link>
      </div>
    </section>
  );
}
