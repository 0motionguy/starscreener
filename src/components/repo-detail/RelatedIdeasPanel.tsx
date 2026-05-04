// RelatedIdeasPanel — up to 5 community ideas targeting this repo.
//
// Server component. Consumes IdeaItem[] from @/lib/repo-ideas and renders
// a terminal-tone list directly after RelatedReposPanel. Returns null when
// the list is empty so the page collapses gracefully.
//
// Each row shows:
//   - Title (1-line truncate)
//   - Summary (1-line truncate)
//   - Reaction chip ("build 4 · use 12") when any count is present
//   - Footer: "by @author · 2d ago"
//
// Chrome mirrors RelatedReposPanel / WhyTrending: rounded-card container,
// font-mono uppercase header, no invented colors.

import type { JSX } from "react";
import Link from "next/link";
import { Lightbulb } from "lucide-react";

import type { IdeaItem, IdeaItemReactions } from "@/lib/repo-ideas";
import { getRelativeTime } from "@/lib/utils";

interface RelatedIdeasPanelProps {
  items: IdeaItem[];
}

function formatReactions(reactions: IdeaItemReactions | undefined): string | null {
  if (!reactions) return null;
  const parts: string[] = [];
  if ((reactions.build ?? 0) > 0) parts.push(`build ${reactions.build}`);
  if ((reactions.use ?? 0) > 0) parts.push(`use ${reactions.use}`);
  if ((reactions.buy ?? 0) > 0) parts.push(`buy ${reactions.buy}`);
  if ((reactions.invest ?? 0) > 0) parts.push(`invest ${reactions.invest}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function safeRelativeTime(iso: string): string {
  try {
    return getRelativeTime(iso);
  } catch {
    return "unknown";
  }
}

export function RelatedIdeasPanel({
  items,
}: RelatedIdeasPanelProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Ideas targeting this repo"
      className="rounded-card border border-border-primary bg-bg-primary p-3 sm:p-4"
    >
      <header className="mb-3 flex items-center gap-2">
        <Lightbulb className="size-4 text-text-primary" aria-hidden />
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
          Ideas targeting this repo
        </h2>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          {items.length} {items.length === 1 ? "idea" : "ideas"}
        </span>
      </header>

      <ul className="flex flex-col divide-y divide-border-primary">
        {items.map((item) => {
          const reactionsLabel = formatReactions(item.reactions);
          const handle = item.author ? item.author.replace(/^@+/, "") : null;
          const posted = safeRelativeTime(item.createdAt);

          return (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={item.url}
                className="group block"
                aria-label={`Open idea: ${item.title}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[13px] text-text-primary group-hover:text-brand">
                      {item.title}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-text-secondary">
                      {item.summary}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                      {handle ? <span>by @{handle}</span> : null}
                      {handle ? <span aria-hidden>·</span> : null}
                      <span>{posted}</span>
                    </div>
                  </div>

                  {reactionsLabel ? (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-border-primary bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                      {reactionsLabel}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default RelatedIdeasPanel;
