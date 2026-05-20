import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";
import { ideaEvidenceLabel } from "@/lib/ideas/display-data";
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
  const claimed = Boolean(idea.claimedBy) || idea.buildStatus !== "exploring";

  return (
    <aside className="idea-side side-stack">
      <section className="idea-side-card side-card">
        <h3>Workspace facts</h3>
        <div className="side-list">
          <div className="side-row">
            <span>Status</span>
            <b>{idea.buildStatus}</b>
          </div>
          <div className="side-row">
            <span>Category</span>
            <b>{idea.category ?? "devtools"}</b>
          </div>
          <div className="side-row">
            <span>Signal strength</span>
            <b>{totalReactions >= 400 ? "Strong" : "Emerging"}</b>
          </div>
          <div className="side-row">
            <span>Evidence</span>
            <b>{ideaEvidenceLabel(idea)}</b>
          </div>
          <div className="side-row">
            <span>Difficulty</span>
            <b>{idea.tags.includes("easy-win") ? "Easy" : "Medium"}</b>
          </div>
          <div className="side-row">
            <span>MVP estimate</span>
            <b>{idea.buildStatus === "shipped" ? "Done" : "2-3 weeks"}</b>
          </div>
          <div className="side-row">
            <span>Launch potential</span>
            <b>High</b>
          </div>
          <div className="side-row">
            <span>Would build</span>
            <b>{counts.build}</b>
          </div>
          <div className="side-row">
            <span>Would use</span>
            <b>{counts.use}</b>
          </div>
          <div className="side-row">
            <span>Saved</span>
            <b>{Math.max(18, Math.round(totalReactions / 5))}</b>
          </div>
          <div className="side-row">
            <span>Related trend</span>
            <b>{idea.targetRepos[0] ?? "Repo momentum"}</b>
          </div>
        </div>
        <div className="side-actions">
          <button type="button" className="btn primary" data-idea-action="claim">
            Claim idea
          </button>
          <button
            type="button"
            className="btn"
            data-idea-action="brief"
            data-idea-id={idea.id}
          >
            Generate brief
          </button>
          <Link href="/drop" className="btn ghost" prefetch={false}>
            Attach repo
          </Link>
          <button type="button" className="btn ghost" data-watch-toggle>
            Save
          </button>
        </div>
      </section>

      <section className="idea-side-card side-card">
        <h3>Claimed state</h3>
        <IdeaClaimedBox idea={idea} signedIn={signedIn} />
        <IdeaProgressLine buildStatus={idea.buildStatus} claimed={claimed} />
      </section>
    </aside>
  );
}
