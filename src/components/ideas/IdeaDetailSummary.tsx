// IdeaDetailSummary — hero of /ideas/[id]. Large gradient mark + title +
// quick-react row. The quick-react row reuses IdeaReactionsRow.

import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";
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
  if (!Number.isFinite(ms) || ms < 0) return "—";
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
  return (
    <section className="idea-summary">
      <header className="idea-summary-head">
        <IdeaMarkMini ideaId={idea.id} size="lg" />
        <div>
          <div className="idea-summary-eyebrow">
            <Link href="/ideas" className="back-link">
              ← Ideas board
            </Link>
            <span>·</span>
            <span>@{idea.authorHandle}</span>
            <span>·</span>
            <span>{relAge(idea.createdAt)}</span>
          </div>
          <h1 className="idea-summary-title">{idea.title}</h1>
          <p className="idea-summary-pitch">{idea.pitch}</p>
        </div>
      </header>
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
