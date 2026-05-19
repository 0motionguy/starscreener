// IdeaSideStack — sticky right rail on /ideas/[id]. Stacks the workspace
// facts list, the progress line, and the claimed box.

import type { IdeaRecord } from "@/lib/ideas";
import type { ReactionCounts } from "@/lib/reactions-shape";

import { IdeaClaimedBox } from "./IdeaClaimedBox";
import { IdeaProgressLine } from "./IdeaProgressLine";

interface IdeaSideStackProps {
  idea: IdeaRecord;
  counts: ReactionCounts;
  signedIn: boolean;
}

export function IdeaSideStack({
  idea,
  counts,
  signedIn,
}: IdeaSideStackProps) {
  const totalReactions =
    counts.build + counts.use + counts.buy + counts.invest;

  return (
    <aside className="idea-side">
      <section className="idea-side-card">
        <h4>Workspace</h4>
        <ul className="side-facts">
          <li>
            <span className="fact-label">Author</span>
            <span className="fact-value">@{idea.authorHandle}</span>
          </li>
          <li>
            <span className="fact-label">Posted</span>
            <span className="fact-value">
              {new Date(idea.createdAt).toLocaleDateString()}
            </span>
          </li>
          <li>
            <span className="fact-label">Status</span>
            <span className="fact-value">{idea.status}</span>
          </li>
          <li>
            <span className="fact-label">Category</span>
            <span className="fact-value">{idea.category ?? "—"}</span>
          </li>
          <li>
            <span className="fact-label">Reactions</span>
            <span className="fact-value">{totalReactions}</span>
          </li>
        </ul>
      </section>

      <section className="idea-side-card">
        <h4>Build progress</h4>
        <IdeaProgressLine buildStatus={idea.buildStatus} />
      </section>

      <section className="idea-side-card">
        <IdeaClaimedBox idea={idea} signedIn={signedIn} />
      </section>

      <section className="idea-side-card">
        <h4>Save</h4>
        <p className="side-hint">
          Save endpoint <code>POST /api/me/saved</code> lands in Phase 4C.
        </p>
      </section>
    </aside>
  );
}
