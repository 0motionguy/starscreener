// Single idea card — v2-styled. Drop-in for /ideas feed and repo-detail panels.
//
// Reactions reuse the same <ObjectReactions> primitive as repos — the strip
// is wired against objectType="idea" + objectId=idea.id.

import Link from "next/link";
import type { JSX } from "react";
import { GitBranch, Sparkles, Wrench } from "lucide-react";

import type { ReactionCounts } from "@/lib/reactions-shape";
import type { IdeaBuildStatus, PublicIdea } from "@/lib/ideas";
import { getRelativeTime } from "@/lib/utils";
import { absoluteUrl } from "@/lib/seo";
import { ObjectReactions } from "@/components/reactions/ObjectReactions";
import { ShareToX } from "@/components/share/ShareToX";
import { ReactionBar, ConvictionBar } from "@/components/v2";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { profileLogoUrl, repoLogoUrl } from "@/lib/logos";

interface IdeaCardProps {
  idea: PublicIdea;
  reactionCounts: ReactionCounts;
  /** When true, links the card to the standalone /ideas/[id] page. */
  linkToDetail?: boolean;
  /** Optional conviction score (0–100). Computed by the parent feed loader. */
  conviction?: number;
  /** Optional rank badge (1 = gold, 2 = silver, 3 = bronze). */
  rank?: number;
  /** Optional 24h delta counts for the reaction highlight row. */
  delta24h?: ReactionCounts;
}

const BUILD_STATUS_COPY: Record<IdeaBuildStatus, { label: string; tone: string; bg: string; border: string }> = {
  exploring: {
    label: "Exploring",
    tone: "text-text-tertiary",
    bg: "bg-bg-muted/40",
    border: "border-border-primary",
  },
  scoping: {
    label: "Scoping",
    tone: "text-[var(--v4-amber)]",
    bg: "bg-warning/10",
    border: "border-warning/40",
  },
  building: {
    label: "Building",
    tone: "text-brand",
    bg: "bg-brand/15",
    border: "border-brand/40",
  },
  shipped: {
    label: "Shipped",
    tone: "text-[var(--v4-money)]",
    bg: "bg-up/10",
    border: "border-up/40",
  },
  abandoned: {
    label: "Abandoned",
    tone: "text-[var(--v4-red)]",
    bg: "bg-down/5",
    border: "border-down/40",
  },
};

function RankMedal({ rank }: { rank: number }): JSX.Element {
  if (rank === 1) {
    return (
      <span
        className="inline-flex items-center justify-center size-7 rounded-md font-mono text-xs font-bold tabular-nums text-bg-primary"
        style={{
          background: "linear-gradient(135deg, #FBBF24 0%, #F56E0F 100%)",
          boxShadow: "0 0 14px rgba(251,191,36,0.4)",
        }}
      >
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center size-7 rounded-md font-mono text-xs font-bold tabular-nums text-bg-primary bg-gradient-to-br from-[#D4D4D4] to-[#737373]">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center size-7 rounded-md font-mono text-xs font-bold tabular-nums text-bg-primary bg-gradient-to-br from-[#D97706] to-[#92400E]">
        3
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center size-7 rounded-md bg-bg-muted border border-border-primary font-mono text-xs font-bold tabular-nums text-text-tertiary">
      {rank}
    </span>
  );
}

export function IdeaCard({
  idea,
  reactionCounts,
  linkToDetail = true,
  conviction: convictionScore,
  rank,
  delta24h,
}: IdeaCardProps): JSX.Element {
  const status = BUILD_STATUS_COPY[idea.buildStatus];
  const total = reactionCounts.build + reactionCounts.use + reactionCounts.buy + reactionCounts.invest;
  const total24h = delta24h
    ? delta24h.build + delta24h.use + delta24h.buy + delta24h.invest
    : 0;

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
      className="v2-card group relative v2-card p-4 space-y-3 hover:border-brand/40 hover:-translate-y-0.5 transition-all overflow-hidden"
    >
      {/* Optional rank ribbon */}
      {rank !== undefined && rank <= 3 ? (
        <span className="absolute -top-px right-4 inline-flex items-center gap-1 rounded-b-md bg-brand px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-bg-primary">
          {rank === 1 ? "SIGNAL OF THE WEEK" : `RANK #${rank}`}
        </span>
      ) : null}

      {/* Header: rank + author + age + status */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {rank !== undefined ? <RankMedal rank={rank} /> : null}
          <EntityLogo
            src={profileLogoUrl(idea.authorHandle, 20)}
            name={idea.authorHandle}
            size={20}
            shape="circle"
            alt=""
          />
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            @{idea.authorHandle}
          </span>
          <span className="text-[11px] text-text-tertiary">·</span>
          <span className="text-[11px] text-text-tertiary">
            {getRelativeTime(idea.publishedAt ?? idea.createdAt)}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${status.tone} ${status.bg} ${status.border}`}
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

      {/* Target repos */}
      {idea.targetRepos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
          <GitBranch className="size-3" aria-hidden />
          <span>Targets:</span>
          {idea.targetRepos.map((fullName) => (
            <Link
              key={fullName}
              href={`/repo/${fullName}`}
              className="inline-flex items-center gap-1 rounded border border-border-primary bg-bg-muted px-1.5 py-0.5 font-mono text-[10px] text-text-secondary hover:text-text-primary"
            >
              <EntityLogo
                src={repoLogoUrl(fullName, 16)}
                name={fullName}
                size={16}
                shape="square"
                alt=""
              />
              {fullName}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Tags */}
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

      {/* V2 conviction + reaction bar */}
      {convictionScore !== undefined && (
        <div className="rounded-md border border-border-primary bg-bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-bold">
              Conviction
            </span>
            {total24h > 0 ? (
              <span className="font-mono text-[10px] text-[var(--v4-money)] font-semibold">
                +{total24h} today
              </span>
            ) : (
              <span className="font-mono text-[10px] text-text-muted">{total} total</span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-mono font-bold tabular-nums leading-none bg-clip-text text-transparent"
              style={{
                fontSize: "32px",
                backgroundImage: "linear-gradient(135deg, #FBBF24 0%, #F56E0F 50%, #EF4444 100%)",
              }}
            >
              {convictionScore}
            </span>
            <span className="font-mono text-sm text-text-tertiary">/100</span>
          </div>
          <ConvictionBar value={convictionScore} />
        </div>
      )}

      {/* V2 reaction mix bar */}
      {total > 0 && (
        <div className="space-y-1.5">
          <ReactionBar reactions={reactionCounts} />
          <div className="flex items-center gap-2.5 font-mono text-[10px]">
            <span className="inline-flex items-center gap-0.5 text-[#60A5FA]">
              <span className="size-1.5 rounded-full bg-[#60A5FA]" />
              {reactionCounts.build}
            </span>
            <span className="inline-flex items-center gap-0.5 text-text-secondary">
              <span className="size-1.5 rounded-full bg-[#C4C4C6]" />
              {reactionCounts.use}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[var(--v4-amber)]">
              <span className="size-1.5 rounded-full bg-[#FBBF24]" />
              {reactionCounts.buy}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[var(--v4-money)]">
              <span className="size-1.5 rounded-full bg-up" />
              {reactionCounts.invest}
            </span>
            <span className="ml-auto text-text-muted">{total} total</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
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
