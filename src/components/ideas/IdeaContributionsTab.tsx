// IdeaContributionsTab — empty state for v1. Backend lib
// `src/lib/idea-contributions.ts` and endpoints
// `GET/POST /api/ideas/[id]/contributions` are Phase 4C deliverables.
//
// We still render the composer so the surface looks alive — submitting
// keeps the draft in local state with a "saved locally" note.

import { IdeaInlineComments } from "./IdeaInlineComments";

interface IdeaContributionsTabProps {
  ideaId: string;
}

export function IdeaContributionsTab({ ideaId }: IdeaContributionsTabProps) {
  return (
    <section className="tab-pane tab-contributions">
      <div className="contrib-empty">
        <h3>No contributions yet</h3>
        <p>
          The contributions feed (comments, evidence drops, repo links,
          would-build claims) goes live with Phase 4C. Until the backend
          lands, drafts you write here stay local to your browser tab.
        </p>
      </div>
      <IdeaInlineComments ideaId={ideaId} />
    </section>
  );
}
