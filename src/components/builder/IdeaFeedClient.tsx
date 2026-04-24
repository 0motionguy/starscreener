"use client";

// TrendingRepo — Idea feed client.
// P0 shows tabs, but Hot/Resolving are disabled until there's enough volume.

import { useState, useTransition } from "react";
import type { IdeaFeedCard, IdeaFeedSort } from "@/lib/builder/types";
import { IdeaFeedCardItem } from "./IdeaFeedCardItem";

interface IdeaFeedClientProps {
  initial: IdeaFeedCard[];
}

export function IdeaFeedClient({ initial }: IdeaFeedClientProps) {
  const [sort, setSort] = useState<IdeaFeedSort>("new");
  const [ideas, setIdeas] = useState<IdeaFeedCard[]>(initial);
  const [pending, startTransition] = useTransition();

  const pickSort = (next: IdeaFeedSort) => {
    if (next === sort) return;
    setSort(next);
    startTransition(async () => {
      const res = await fetch(`/api/ideas?sort=${next}&limit=30`);
      if (!res.ok) return;
      const data = (await res.json()) as { ideas: IdeaFeedCard[] };
      setIdeas(data.ideas);
    });
  };

  return (
    <>
      <nav
        aria-label="Idea feed sort"
        className="mb-5 flex gap-1 rounded-card border border-border-primary bg-bg-secondary p-1 w-fit"
      >
        {(["new", "hot", "resolving"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pickSort(k)}
            aria-pressed={sort === k}
            disabled={pending && sort !== k}
            className={`rounded-badge px-3 py-1 text-xs font-mono uppercase tracking-wide transition-colors ${
              sort === k
                ? "bg-bg-card text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {k}
          </button>
        ))}
      </nav>

      {ideas.length === 0 ? (
        <EmptyFeed />
      ) : (
        <ol className="flex flex-col gap-3">
          {ideas.map((i) => (
            <li key={i.id}>
              <IdeaFeedCardItem idea={i} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function EmptyFeed() {
  return (
    <div className="rounded-card border border-dashed border-border-primary bg-bg-secondary p-6 text-center">
      <p className="text-sm font-medium text-text-primary">
        No ideas yet in this view.
      </p>
      <p className="mt-2 text-xs text-text-tertiary">
        Be the first. Head to{" "}
        <a href="/submit?tab=idea" className="text-accent-green underline">
          /submit
        </a>{" "}
        and post one — it takes about two minutes.
      </p>
    </div>
  );
}
