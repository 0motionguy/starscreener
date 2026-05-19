// IdeaSelectedPreviewPanel — sticky right rail. Shows whichever idea is
// currently selected on the board. For v1 we pin it to the top idea so
// the surface ships with content; future Phase 4C work will wire it to a
// client-side selection store.

import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";

import { IdeaMarkMini } from "./IdeaMarkMini";

interface IdeaSelectedPreviewPanelProps {
  idea: IdeaRecord | null;
}

export function IdeaSelectedPreviewPanel({
  idea,
}: IdeaSelectedPreviewPanelProps) {
  if (!idea) {
    return (
      <aside
        className="idea-preview-empty"
        style={{
          padding: 16,
          color: "var(--fg-faint)",
          fontSize: 13,
        }}
      >
        Pick an idea to preview its brief, evidence, and demand signal.
      </aside>
    );
  }
  return (
    <aside className="idea-preview">
      <header className="idea-preview-head">
        <IdeaMarkMini ideaId={idea.id} />
        <div>
          <div className="idea-preview-eyebrow">Selected idea</div>
          <h3 className="idea-preview-title">{idea.title}</h3>
        </div>
      </header>
      <p className="idea-preview-pitch">{idea.pitch}</p>
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
        {idea.targetRepos[0] ? (
          <li>
            <b>Repo</b> {idea.targetRepos[0]}
          </li>
        ) : null}
        {idea.category ? (
          <li>
            <b>Category</b> {idea.category}
          </li>
        ) : null}
      </ul>
      <Link
        href={`/ideas/${idea.id}`}
        className="idea-preview-cta"
        prefetch={false}
      >
        Open workspace →
      </Link>
    </aside>
  );
}
