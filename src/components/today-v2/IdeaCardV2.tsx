// V2 idea card — Node/01 chrome on the existing TodayHeroIdeaCard data.
// Wears a mini terminal bar (// IDEA-A7F2 · @author · category · sig:78),
// then the title, pitch, sparkline, reaction count.
//
// The first card on the feed (rank 1) gets bracket markers — system says
// "this is the focused idea right now."

import Link from "next/link";

import type { ReactionCounts } from "@/lib/reactions-shape";
import type { PublicIdea } from "@/lib/ideas";
import { cn, getRelativeTime } from "@/lib/utils";
import {
  getIdeaCategory,
  getIdeaHistory,
  getIdeaSignal,
  Sparkline,
  StatusDot,
} from "@/components/ideas/IdeaVisuals";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { BracketMarkers } from "@/components/today-v2/primitives/BracketMarkers";

interface IdeaCardV2Props {
  idea: PublicIdea;
  reactionCounts: ReactionCounts;
  hotScore?: number;
  rank?: number;
}

export function IdeaCardV2({
  idea,
  reactionCounts,
  hotScore,
  rank,
}: IdeaCardV2Props) {
  const signal = getIdeaSignal(idea, reactionCounts, hotScore);
  const category = getIdeaCategory(idea);
  const history = getIdeaHistory(idea, signal);
  const publishedAt = idea.publishedAt ?? idea.createdAt;
  const totalReactions =
    (reactionCounts.build ?? 0) +
    (reactionCounts.use ?? 0) +
    (reactionCounts.buy ?? 0) +
    (reactionCounts.invest ?? 0);

  const isFeatured = rank === 1;

  return (
    <Link
      href={`/ideas/${idea.id}`}
      className={cn(
        "v2-card v2-card-hover overflow-hidden block group relative",
        isFeatured && "v2-bracket",
      )}
    >
      {isFeatured ? <BracketMarkers /> : null}

      <TerminalBar
        label={
          <span className="flex items-center gap-2">
            <span className="text-[color:var(--v2-ink-200)]">
              IDEA-{idea.id.slice(0, 6).toUpperCase()}
            </span>
            <span className="text-[color:var(--v2-ink-500)]">·</span>
            <span className="text-[color:var(--v2-ink-300)] normal-case">
              @{idea.authorHandle}
            </span>
          </span>
        }
        status={
          <span className="flex items-center gap-2">
            <span className="text-[color:var(--v2-ink-300)]">{category}</span>
            <span className="text-[color:var(--v2-ink-500)]">·</span>
            <span className="text-[color:var(--v2-ink-100)] tabular-nums">
              SIG:{signal}
            </span>
          </span>
        }
      />

      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h3
            className="line-clamp-2 text-[color:var(--v2-ink-000)] group-hover:text-white"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontWeight: 510,
              fontSize: 17,
              lineHeight: 1.25,
              letterSpacing: "-0.012em",
            }}
          >
            {idea.title}
          </h3>
          <Sparkline
            data={history.slice(-10)}
            className="text-[color:var(--v2-acc)] shrink-0"
          />
        </div>

        <p className="line-clamp-2 text-[color:var(--v2-ink-200)] text-[13px] leading-relaxed">
          {idea.pitch}
        </p>

        <div className="flex items-center gap-3 v2-mono">
          <StatusDot status={idea.buildStatus} />
          <span aria-hidden className="text-[color:var(--v2-line-300)]">
            ·
          </span>
          <span>{getRelativeTime(publishedAt).toUpperCase()}</span>
          {totalReactions > 0 ? (
            <>
              <span aria-hidden className="text-[color:var(--v2-line-300)] ml-auto">
                →
              </span>
              <span className="text-[color:var(--v2-ink-100)] tabular-nums">
                {totalReactions} REACTIONS
              </span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
