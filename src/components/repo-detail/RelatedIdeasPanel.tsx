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
// Chrome mirrors RelatedReposPanel / WhyTrending: V4-token container
// (border + 2px radius via inline style), font-mono uppercase header, no
// invented colors.

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
      className="p-3 sm:p-4"
      style={{
        borderRadius: 2,
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-000)",
      }}
    >
      <header className="mb-3 flex items-center gap-2">
        <Lightbulb className="size-4" aria-hidden style={{ color: "var(--v4-ink-100)" }} />
        <h2
          className="font-mono text-[11px] uppercase tracking-wider"
          style={{ color: "var(--v4-ink-300)" }}
        >
          Ideas targeting this repo
        </h2>
        <span
          className="ml-auto font-mono text-[10px] uppercase tracking-wider"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {items.length} {items.length === 1 ? "idea" : "ideas"}
        </span>
      </header>

      <ul className="flex flex-col">
        {items.map((item, idx) => {
          const reactionsLabel = formatReactions(item.reactions);
          const handle = item.author ? item.author.replace(/^@+/, "") : null;
          const posted = safeRelativeTime(item.createdAt);

          return (
            <li
              key={item.id}
              className="py-3 first:pt-0 last:pb-0"
              style={
                idx > 0 ? { borderTop: "1px solid var(--v4-line-200)" } : undefined
              }
            >
              <Link
                href={item.url}
                className="group block"
                aria-label={`Open idea: ${item.title}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate font-mono text-[13px] group-hover:text-brand"
                      style={{ color: "var(--v4-ink-100)" }}
                    >
                      {item.title}
                    </p>
                    <p
                      className="mt-1 truncate font-mono text-[11px]"
                      style={{ color: "var(--v4-ink-200)" }}
                    >
                      {item.summary}
                    </p>
                    <div
                      className="mt-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider"
                      style={{ color: "var(--v4-ink-300)" }}
                    >
                      {handle ? <span>by @{handle}</span> : null}
                      {handle ? <span aria-hidden>·</span> : null}
                      <span>{posted}</span>
                    </div>
                  </div>

                  {reactionsLabel ? (
                    <span
                      className="inline-flex shrink-0 items-center rounded-full bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                      style={{
                        border: "1px solid var(--v4-line-200)",
                        color: "var(--v4-ink-200)",
                      }}
                    >
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
