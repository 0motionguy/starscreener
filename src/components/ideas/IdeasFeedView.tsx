import Link from "next/link";
import { Lightbulb, Plus } from "lucide-react";

import type { ReactionCounts } from "@/lib/reactions-shape";
import type { PublicIdea } from "@/lib/ideas";
import { cn, formatNumber } from "@/lib/utils";
import { IdeaCard } from "@/components/ideas/IdeaCard";
import { IdeaComposer } from "@/components/ideas/IdeaComposer";
import { getIdeaCategory, getIdeaSignal, SidePanel } from "@/components/ideas/IdeaVisuals";

export type IdeasSortKey = "hot" | "new" | "shipped";

export interface RankedIdea {
  idea: PublicIdea;
  reactionCounts: ReactionCounts;
  hotScore?: number;
}

interface IdeasFeedViewProps {
  feed: RankedIdea[];
  sortKey: IdeasSortKey;
  allCount: number;
  shippedCount: number;
}

export function IdeasFeedView({
  feed,
  sortKey,
  allCount,
  shippedCount,
}: IdeasFeedViewProps) {
  const tags = tagStats(feed);
  const topIdeas = [...feed]
    .sort(
      (a, b) =>
        getIdeaSignal(b.idea, b.reactionCounts, b.hotScore) -
        getIdeaSignal(a.idea, a.reactionCounts, a.hotScore),
    )
    .slice(0, 4);

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-micro mb-2 inline-flex items-center gap-2">
            <Lightbulb className="size-3 text-brand" aria-hidden />
            Builder ideas
          </p>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            Ideas
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Product concepts, co-signs, build intent, and discussion from the TrendingRepo community.
          </p>
        </div>
        <a
          href="#drop-idea"
          className="inline-flex h-9 items-center gap-2 rounded-card border border-brand/60 bg-brand px-3 text-sm font-semibold text-black transition hover:bg-brand-hover"
        >
          <Plus className="size-4" aria-hidden />
          Drop idea
        </a>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <nav
              aria-label="Sort ideas"
              className="flex rounded-card border border-border-primary bg-bg-card p-1"
            >
              <SortLink href="/ideas?sort=hot" label="Signal" active={sortKey === "hot"} />
              <SortLink href="/ideas?sort=new" label="New" active={sortKey === "new"} />
              <SortLink href="/ideas?sort=shipped" label="Shipped" active={sortKey === "shipped"} />
            </nav>
            <span className="font-mono text-[11px] text-text-tertiary tabular-nums">
              {feed.length} shown / {allCount} total / {shippedCount} shipped
            </span>
          </div>

          <div id="drop-idea" className="mb-4 scroll-mt-20">
            <IdeaComposer />
          </div>

          {feed.length === 0 ? (
            <div className="rounded-card border border-dashed border-border-primary bg-bg-card px-4 py-14 text-center text-sm text-text-tertiary">
              <Lightbulb className="mx-auto mb-3 size-6 opacity-50" aria-hidden />
              No ideas in this view yet.
            </div>
          ) : (
            <ul className="space-y-3" data-testid="idea-feed">
              {feed.slice(0, 50).map((row, index) => (
                <li key={row.idea.id}>
                  <IdeaCard
                    idea={row.idea}
                    reactionCounts={row.reactionCounts}
                    hotScore={row.hotScore}
                    featured={index === 0 && sortKey === "hot"}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="hidden xl:block">
          <div className="sticky top-20 space-y-3">
            <SidePanel title="Live idea signal" className="bg-bg-card">
              <div className="space-y-3">
                {topIdeas.map((row) => (
                  <Link
                    key={row.idea.id}
                    href={`/ideas/${row.idea.id}`}
                    className="block rounded-md border border-border-secondary bg-bg-inset/60 p-3 transition hover:border-border-strong"
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="truncate font-mono text-[10px] uppercase text-text-tertiary">
                        {getIdeaCategory(row.idea)}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-text-primary">
                        {getIdeaSignal(row.idea, row.reactionCounts, row.hotScore)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[12px] leading-relaxed text-text-secondary">
                      {row.idea.title}
                    </p>
                  </Link>
                ))}
              </div>
            </SidePanel>

            <SidePanel title="Reaction mix" className="bg-bg-card">
              <div className="grid grid-cols-2 gap-2">
                <MiniMetric label="Build" value={reactionTotal(feed, "build")} />
                <MiniMetric label="Use" value={reactionTotal(feed, "use")} />
                <MiniMetric label="Buy" value={reactionTotal(feed, "buy")} />
                <MiniMetric label="Invest" value={reactionTotal(feed, "invest")} />
              </div>
            </SidePanel>

            <SidePanel title="Trending tags" className="bg-bg-card">
              <div className="flex flex-wrap gap-1.5">
                {tags.slice(0, 12).map((tag) => (
                  <span
                    key={tag.label}
                    className="rounded border border-border-secondary bg-bg-inset px-2 py-1 font-mono text-[10px] text-text-tertiary"
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </SidePanel>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SortLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-[12px] font-semibold transition",
        active
          ? "bg-functional-subtle text-functional"
          : "text-text-tertiary hover:text-text-primary",
      )}
    >
      {label}
    </Link>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border-secondary bg-bg-inset p-3">
      <div className="label-micro mb-2">{label}</div>
      <div className="font-mono text-lg font-bold text-text-primary">
        {formatNumber(value)}
      </div>
    </div>
  );
}

function tagStats(feed: RankedIdea[]) {
  const counts = new Map<string, number>();
  for (const row of feed) {
    for (const tag of row.idea.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function reactionTotal(feed: RankedIdea[], key: keyof ReactionCounts): number {
  return feed.reduce((sum, row) => sum + row.reactionCounts[key], 0);
}

export default IdeasFeedView;
