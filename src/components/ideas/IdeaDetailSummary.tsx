import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";
import { ideaEvidenceLabel } from "@/lib/ideas/display-data";
import type {
  ReactionCounts,
  UserReactionState,
} from "@/lib/reactions-shape";

import { IdeaMarkMini } from "./IdeaMarkMini";
import { IdeaReactionsRow } from "./IdeaReactionsRow";

interface IdeaDetailSummaryProps {
  idea: IdeaRecord;
  counts: ReactionCounts;
  mine: UserReactionState | null;
  signedIn: boolean;
}

function relAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  return "just now";
}

export function IdeaDetailSummary({
  idea,
  counts,
  mine,
  signedIn,
}: IdeaDetailSummaryProps) {
  const demand = counts.build + counts.use + counts.buy + counts.invest;
  return (
    <section className="idea-summary">
      <header className="idea-summary-head">
        <IdeaMarkMini ideaId={idea.id} size="lg" />
        <div className="idea-summary-title-wrap">
          <div className="idea-summary-eyebrow">
            <Link href="/ideas" className="back-link">
              Ideas board
            </Link>
            <span>/</span>
            <span>@{idea.authorHandle}</span>
            <span>/</span>
            <span>{relAge(idea.createdAt)}</span>
          </div>
          <div className="idea-summary-kicker">Ideas / opportunity workspace</div>
          <h1 className="idea-summary-title">{idea.title}</h1>
          <p className="idea-summary-pitch">{idea.pitch}</p>
        </div>
        <div className="summary-actions">
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
          <span className="idea-pill pill-live">{idea.buildStatus}</span>
        </div>
      </header>
      <div className="idea-meta-badges" aria-label="Idea metadata">
        <span>{idea.category ?? "devtools"}</span>
        <span>{ideaEvidenceLabel(idea)}</span>
        <span>{demand.toLocaleString()} demand score</span>
        <span>{counts.build} would build</span>
        <span>{counts.use} would use</span>
        <span>{counts.buy} would buy</span>
        <span>{counts.invest} would invest</span>
      </div>
      <div className="idea-summary-react">
        <IdeaReactionsRow
          ideaId={idea.id}
          initialCounts={counts}
          initialMine={mine}
          signedIn={signedIn}
        />
      </div>
    </section>
  );
}
