// IdeaDetailSummary — hero panel of /ideas/[id]. Pixel-faithful to
// ideas-detail.html:1081-1117 — mark + title + 4 hero actions + 7-pill
// meta row + reactions row.
//
// Hero actions (claim / brief / attach / save) wire through the existing
// /api/ideas/[id]/{claim,attach-repo}, /api/me/saved endpoints from a
// client component IdeaHeroActions. Reactions go through IdeaHeroReactions.

import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";
import type {
  ReactionCounts,
  UserReactionState,
} from "@/lib/reactions-shape";

import { IdeaHeroActions } from "./IdeaHeroActions";
import { IdeaHeroReactions } from "./IdeaHeroReactions";
import { IdeaMarkMini } from "./IdeaMarkMini";

interface IdeaDetailSummaryProps {
  idea: IdeaRecord;
  counts: ReactionCounts;
  mine: UserReactionState | null;
  signedIn: boolean;
}

function statusPillClass(status: IdeaRecord["status"]): string {
  switch (status) {
    case "published":
      return "pill open";
    case "shipped":
      return "pill good";
    case "archived":
      return "pill warn";
    default:
      return "pill";
  }
}

function statusLabel(status: IdeaRecord["status"]): string {
  switch (status) {
    case "published":
      return "Open";
    case "shipped":
      return "Shipped";
    case "archived":
      return "Archived";
    case "pending_moderation":
      return "Pending";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
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

function tractionLabel(counts: ReactionCounts): string {
  const total = counts.build + counts.use + counts.buy + counts.invest;
  if (total >= 50) return "Strong signal";
  if (total >= 10) return "Warming";
  if (total >= 1) return "Early";
  return "No signal yet";
}

export function IdeaDetailSummary({
  idea,
  counts,
  mine,
  signedIn,
}: IdeaDetailSummaryProps) {
  const topTags = idea.tags.slice(0, 3);

  return (
    <section className="summary-panel idea-summary" aria-label="Idea summary">
      <div className="summary-head">
        <IdeaMarkMini ideaId={idea.id} size="lg" />
        <div className="summary-title">
          <div className="summary-kicker idea-summary-eyebrow">
            <Link href="/ideas" className="back-link">
              ← Ideas board
            </Link>
            <span aria-hidden="true">·</span>
            <span>@{idea.authorHandle}</span>
            <span aria-hidden="true">·</span>
            <span>{relAge(idea.createdAt)}</span>
          </div>
          <h1>{idea.title}</h1>
          <p>{idea.pitch}</p>
          <IdeaHeroReactions
            ideaId={idea.id}
            initialCounts={counts}
            initialMine={mine}
            signedIn={signedIn}
          />
        </div>
        <IdeaHeroActions
          ideaId={idea.id}
          signedIn={signedIn}
          placement="hero"
          claimedBy={idea.claimedBy}
        />
      </div>

      {/* 7 meta-badges row — pulls from idea.* fields. */}
      <div className="meta-badges">
        <span className={statusPillClass(idea.status)} data-status-pill>
          {statusLabel(idea.status)}
        </span>
        {idea.category ? (
          <span className="pill">{idea.category}</span>
        ) : (
          <span className="pill">Uncategorised</span>
        )}
        {topTags.length > 0 ? (
          topTags.map((tag) => (
            <span className="pill" key={`tag-${tag}`}>
              {tag}
            </span>
          ))
        ) : (
          <span className="pill">No tags</span>
        )}
        <span className="pill hot">{tractionLabel(counts)}</span>
        <span className="pill">@{idea.authorHandle}</span>
        <span className="pill">{relAge(idea.createdAt)}</span>
      </div>
    </section>
  );
}
