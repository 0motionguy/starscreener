"use client";

// TrendingRepo — Idea feed card.
// Rendered by /ideas and /repo/[owner]/[name] → "Ideas using this repo" rail.

import Link from "next/link";
import type { IdeaFeedCard } from "@/lib/builder/types";
import { ReactionsBar } from "./ReactionsBar";
import type { ReactionTally } from "@/lib/builder/types";

interface Props {
  idea: IdeaFeedCard;
  variant?: "full" | "compact";
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  const diffMs = Date.now() - t;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function phaseLabel(p: IdeaFeedCard["phase"]): string {
  return p.toUpperCase();
}

function phaseColor(p: IdeaFeedCard["phase"]): string {
  switch (p) {
    case "seed": return "text-text-tertiary";
    case "alpha": return "text-accent-orange";
    case "beta": return "text-accent-blue";
    case "live": return "text-accent-green";
    case "sunset": return "text-text-muted";
  }
}

export function IdeaFeedCardItem({ idea, variant = "full" }: Props) {
  // Synthesize an initial tally so the bar doesn't flicker.
  const initialTally: ReactionTally = {
    subjectType: "idea",
    subjectId: idea.slug,
    use: idea.tally.use,
    build: idea.tally.build,
    buy: idea.tally.buy,
    invest: idea.tally.invest,
    conviction: idea.tally.conviction,
    uniqueBuilders: idea.tally.uniqueBuilders,
    topPayloads: { use: [], build: [], buy: [], invest: [] },
    updatedAt: idea.createdAt,
  };

  return (
    <article className="rounded-card border border-border-primary bg-bg-card p-4 sm:p-5 shadow-card hover:border-border-accent transition-colors">
      <header className="flex items-center gap-2 text-xs text-text-tertiary font-mono">
        <span className="text-text-secondary">@{idea.authorHandle}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={idea.createdAt}>{formatRelative(idea.createdAt)}</time>
        <span aria-hidden="true">·</span>
        <span className={`font-bold ${phaseColor(idea.phase)}`}>
          {phaseLabel(idea.phase)}
        </span>
        {idea.sprintEndsInMs != null && idea.sprintEndsInMs < 48 * 3600 * 1000 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-accent-orange">
              sprint ends in{" "}
              {Math.max(1, Math.round(idea.sprintEndsInMs / 3600 / 1000))}h
            </span>
          </>
        )}
      </header>

      <h3 className="mt-2 text-base sm:text-lg font-semibold text-text-primary">
        <Link href={`/ideas/${idea.slug}`} className="hover:underline">
          {idea.thesis}
        </Link>
      </h3>

      {variant === "full" && (
        <p className="mt-2 text-sm text-text-secondary">
          <span className="font-mono text-xs uppercase tracking-wide text-text-tertiary mr-2">
            why now
          </span>
          {idea.whyNow}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {idea.linkedRepoIds.length > 0 && (
          <div className="flex items-center gap-1.5 font-mono text-text-tertiary">
            <span className="uppercase tracking-wide">anchor</span>
            {idea.linkedRepoIds.slice(0, 3).map((r) => (
              <Link
                key={r}
                href={`/repo/${r}`}
                className="text-text-secondary hover:text-accent-green"
              >
                {r}
              </Link>
            ))}
            {idea.linkedRepoIds.length > 3 && (
              <span className="text-text-tertiary">
                +{idea.linkedRepoIds.length - 3}
              </span>
            )}
          </div>
        )}

        {idea.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {idea.tags.slice(0, 4).map((t) => (
              <Link
                key={t}
                href={`/ideas?tag=${encodeURIComponent(t)}`}
                className="rounded-badge bg-bg-secondary px-2 py-0.5 font-mono text-[11px] text-text-tertiary hover:text-text-secondary"
              >
                #{t}
              </Link>
            ))}
          </div>
        )}
      </div>

      <footer className="mt-3">
        <ReactionsBar
          subjectType="idea"
          subjectId={idea.slug}
          initialTally={initialTally}
          compact={variant === "compact"}
        />
      </footer>
    </article>
  );
}
