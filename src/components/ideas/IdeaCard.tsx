// Single idea card. Drop-in for both the /ideas feed and the future
// "ideas about this repo" tab on /repo/[owner]/[name].
//
// Reactions reuse the same <Reactions> primitive as repos — the strip
// is wired against objectType="idea" + objectId=idea.id. When the
// strategy doc adds a reactions component for non-repo objects, this
// card switches to it without other changes.

import Link from "next/link";
import type { JSX } from "react";
import { GitBranch, Sparkles, Wrench } from "lucide-react";

import type { ReactionCounts } from "@/lib/reactions-shape";
import type { IdeaBuildStatus, PublicIdea } from "@/lib/ideas";
import { getRelativeTime } from "@/lib/utils";
import { absoluteUrl } from "@/lib/seo";
import { ObjectReactions } from "@/components/reactions/ObjectReactions";
import { ShareToX } from "@/components/share/ShareToX";

interface IdeaCardProps {
  idea: PublicIdea;
  reactionCounts: ReactionCounts;
  /** When true, links the card to the standalone /ideas/[id] page. */
  linkToDetail?: boolean;
}

const BUILD_STATUS_COPY: Record<IdeaBuildStatus, { label: string; tone: string }> = {
  exploring: { label: "Exploring", tone: "text-text-tertiary" },
  scoping: { label: "Scoping", tone: "text-warning" },
  building: { label: "Building", tone: "text-brand" },
  shipped: { label: "Shipped", tone: "text-up" },
  abandoned: { label: "Abandoned", tone: "text-down" },
};

export function IdeaCard({
  idea,
  reactionCounts,
  linkToDetail = true,
}: IdeaCardProps): JSX.Element {
  const status = BUILD_STATUS_COPY[idea.buildStatus];
  const titleNode = linkToDetail ? (
    <Link
      href={`/ideas/${idea.id}`}
      className="font-mono text-base font-semibold text-text-primary hover:underline"
    >
      {idea.title}
    </Link>
  ) : (
    <h3 className="font-mono text-base font-semibold text-text-primary">
      {idea.title}
    </h3>
  );

  return (
    <article
      data-testid="idea-card"
      className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card space-y-3"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            @{idea.authorHandle}
          </span>
          <span className="text-[11px] text-text-tertiary">·</span>
          <span className="text-[11px] text-text-tertiary">
            {getRelativeTime(idea.publishedAt ?? idea.createdAt)}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-border-primary bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${status.tone}`}
        >
          {idea.buildStatus === "shipped" ? (
            <Sparkles className="size-3" aria-hidden />
          ) : (
            <Wrench className="size-3" aria-hidden />
          )}
          {status.label}
        </span>
      </header>

      {titleNode}
      <p className="text-sm text-text-secondary leading-relaxed">{idea.pitch}</p>

      {idea.targetRepos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
          <GitBranch className="size-3" aria-hidden />
          <span>Targets:</span>
          {idea.targetRepos.map((fullName) => (
            <Link
              key={fullName}
              href={`/repo/${fullName}`}
              className="rounded border border-border-primary bg-bg-muted px-1.5 py-0.5 font-mono text-[10px] text-text-secondary hover:text-text-primary"
            >
              {fullName}
            </Link>
          ))}
        </div>
      ) : null}

      {idea.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {idea.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border-primary bg-bg-muted px-2 py-0.5 font-mono text-[10px] text-text-tertiary"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ObjectReactions
          objectType="idea"
          objectId={idea.id}
          initialCounts={reactionCounts}
        />
        <ShareToX
          text={`💡 "${idea.title}" — @${idea.authorHandle}`}
          url={absoluteUrl(`/ideas/${idea.id}`)}
          compact
        />
      </div>
    </article>
  );
}

export default IdeaCard;
