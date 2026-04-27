import Link from "next/link";
import type { JSX } from "react";
import { GitBranch, MessageSquare, Users } from "lucide-react";

import type { ReactionCounts } from "@/lib/reactions-shape";
import type { PublicIdea } from "@/lib/ideas";
import { getRelativeTime } from "@/lib/utils";
import { absoluteUrl } from "@/lib/seo";
import { ObjectReactions } from "@/components/reactions/ObjectReactions";
import { ShareToX } from "@/components/share/ShareToX";
import { IdeaDiscussion } from "@/components/ideas/IdeaDiscussion";
import {
  DeltaPill,
  getIdeaCategory,
  getIdeaDelta,
  getIdeaHistory,
  getIdeaSignal,
  getIdeaStackRows,
  IdeaLogoMark,
  IdeaPreview,
  Sparkline,
  StatusDot,
} from "@/components/ideas/IdeaVisuals";

interface IdeaCardProps {
  idea: PublicIdea;
  reactionCounts: ReactionCounts;
  linkToDetail?: boolean;
  hotScore?: number;
  featured?: boolean;
}

export function IdeaCard({
  idea,
  reactionCounts,
  linkToDetail = true,
  hotScore,
  featured = false,
}: IdeaCardProps): JSX.Element {
  const signal = getIdeaSignal(idea, reactionCounts, hotScore);
  const history = getIdeaHistory(idea, signal);
  const delta = getIdeaDelta(history);
  const category = getIdeaCategory(idea);
  const stackRows = getIdeaStackRows(idea).slice(0, 5);
  const totalReactions = Object.values(reactionCounts).reduce((sum, value) => sum + value, 0);
  const publishedAt = idea.publishedAt ?? idea.createdAt;

  const title = linkToDetail ? (
    <Link
      href={`/ideas/${idea.id}`}
      className="text-[17px] font-semibold leading-snug text-text-primary transition hover:text-white hover:underline"
    >
      {idea.title}
    </Link>
  ) : (
    <h1 className="text-[26px] font-semibold leading-tight text-text-primary sm:text-[34px]">
      {idea.title}
    </h1>
  );

  return (
    <article
      data-testid="idea-card"
      className="group overflow-hidden rounded-card border border-border-primary bg-bg-card shadow-card transition hover:border-border-strong hover:bg-bg-card-hover"
    >
      <div
        className={
          featured
            ? "grid gap-0 lg:grid-cols-[1fr_300px]"
            : "grid gap-0 md:grid-cols-[1fr_240px]"
        }
      >
        <div className="min-w-0 px-4 py-4 sm:px-5 sm:py-5">
          <header className="mb-4 flex items-center gap-3">
            <IdeaLogoMark idea={idea} size={38} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase text-text-tertiary">
                  {category}
                </span>
                <span className="size-1 rounded-full bg-white/20" aria-hidden="true" />
                <StatusDot status={idea.buildStatus} />
              </div>
              <div className="mt-1 font-mono text-[10px] text-text-muted">
                IDEA-{idea.id.toUpperCase()} / @{idea.authorHandle} / {getRelativeTime(publishedAt)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-white">
              <div className="text-right">
                <div className="font-mono text-[20px] font-bold leading-none tabular-nums">
                  {signal}
                </div>
                <div className="mt-1 font-mono text-[9px] font-semibold uppercase text-text-muted">
                  signal
                </div>
              </div>
              <div className="hidden flex-col items-start gap-1 sm:flex">
                <Sparkline data={history.slice(-10)} className="text-white" />
                <DeltaPill value={delta} />
              </div>
            </div>
          </header>

          <div className="space-y-3">
            {title}
            <p className="text-[13px] leading-relaxed text-text-secondary">
              {idea.pitch}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {(idea.tags.length > 0 ? idea.tags : [category.toLowerCase()]).slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="rounded border border-white/8 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] font-medium text-text-tertiary"
              >
                {tag}
              </span>
            ))}
          </div>

          {idea.targetRepos.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
              <GitBranch className="size-3" aria-hidden />
              {idea.targetRepos.map((fullName) => (
                <Link
                  key={fullName}
                  href={`/repo/${fullName}`}
                  className="rounded border border-white/8 bg-black/20 px-2 py-1 font-mono text-[10px] text-text-secondary transition hover:border-white/18 hover:text-text-primary"
                >
                  {fullName}
                </Link>
              ))}
            </div>
          ) : null}

          {stackRows.length > 0 ? (
            <div className="mt-4 rounded-card border border-border-secondary bg-bg-inset/60 p-3">
              <div className="mb-2 flex items-center gap-2">
                <GitBranch className="size-3 text-text-tertiary" aria-hidden />
                <span className="font-mono text-[10px] font-semibold uppercase text-text-muted">
                  Stack
                </span>
              </div>
              <div className="space-y-1.5">
                {stackRows.map((row) => (
                  <div key={row.label} className="grid gap-2 sm:grid-cols-[78px_1fr]">
                    <span className="font-mono text-[10px] uppercase text-text-muted">
                      {row.label}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {row.values.slice(0, 5).map((value) => (
                        <span
                          key={`${row.label}-${value}`}
                          className="rounded border border-border-secondary bg-bg-card px-2 py-0.5 font-mono text-[10px] text-text-tertiary"
                        >
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/6 pt-4">
            <ObjectReactions
              objectType="idea"
              objectId={idea.id}
              initialCounts={reactionCounts}
              variant="mono"
            />
            <div className="flex-1" />
            <div className="hidden items-center gap-3 text-[11px] text-text-tertiary sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3" aria-hidden />
                {Math.max(1, reactionCounts.build)} building
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="size-3" aria-hidden />
                {Math.max(0, Math.round(totalReactions / 3))} notes
              </span>
            </div>
            <ShareToX
              text={`Idea: "${idea.title}" by @${idea.authorHandle}`}
              url={absoluteUrl(`/ideas/${idea.id}`)}
              compact
            />
          </div>
        </div>

        <div className="hidden border-l border-border-secondary bg-bg-inset/70 p-3 md:block">
          <IdeaPreview idea={idea} history={history} compact={!featured} />
        </div>
      </div>
      <IdeaDiscussion
        idea={idea}
        reactionCounts={reactionCounts}
        compact
      />
    </article>
  );
}

export default IdeaCard;
