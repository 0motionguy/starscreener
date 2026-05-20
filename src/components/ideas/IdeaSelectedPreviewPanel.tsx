import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";
import {
  ideaEvidenceLabel,
  ideaMvpCopy,
  relatedReposForIdea,
} from "@/lib/ideas/display-data";

import { IdeaMarkMini } from "./IdeaMarkMini";

interface IdeaSelectedPreviewPanelProps {
  idea: IdeaRecord | null;
}

export function IdeaSelectedPreviewPanel({
  idea,
}: IdeaSelectedPreviewPanelProps) {
  if (!idea) return null;
  const repos = relatedReposForIdea(idea);
  return (
    <aside className="idea-preview selected-preview">
      <header className="idea-preview-head">
        <IdeaMarkMini ideaId={idea.id} />
        <div>
          <div className="idea-preview-eyebrow">Selected idea</div>
          <h2 className="idea-preview-title">{idea.title}</h2>
        </div>
      </header>
      <p className="idea-preview-pitch">{ideaEvidenceLabel(idea)}</p>
      <p className="idea-preview-copy">{idea.pitch}</p>
      <div>
        <div className="section-label">Top related repos</div>
        <div className="preview-repos">
          {repos.map((repo, index) => (
            <div className="preview-repo" key={repo}>
              <span>{repo}</span>
              <span>
                {index === 0 ? "+18.4%" : index === 1 ? "+12.1%" : "signal"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="section-label">Suggested MVP</div>
        <div className="preview-mvp">{ideaMvpCopy(idea)}</div>
      </div>
      <ul className="idea-preview-meta">
        <li>
          <b>Author</b> @{idea.authorHandle}
        </li>
        <li>
          <b>Status</b> {idea.status}
        </li>
        <li>
          <b>Build</b> {idea.buildStatus}
        </li>
        <li>
          <b>Category</b> {idea.category ?? "devtools"}
        </li>
      </ul>
      <div className="row-actions-inline">
        <Link
          href={`/ideas/${idea.id}`}
          className="idea-preview-cta"
          prefetch={false}
        >
          Open brief
        </Link>
        <button
          type="button"
          className="idea-preview-cta secondary"
          data-idea-action="brief"
          data-idea-id={idea.id}
        >
          Generate brief
        </button>
      </div>
    </aside>
  );
}
