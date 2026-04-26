// /ideas — public idea feed.
//
// Three views (URL-driven via ?sort=hot|new|shipped):
//   - hot     (default) — weighted reactions × recency decay
//   - new     — chronological by publish time
//   - shipped — only ideas that reached buildStatus = "shipped"
//
// Server-renders the first 20 rows so the page is interactive immediately.
// The composer is client-side; once a user posts, the new idea appears at
// the top of "new" / hot-ranked into "hot" depending on its score.

import type { Metadata } from "next";
import { Lightbulb, Plus } from "lucide-react";

import {
  hotScore,
  listIdeas,
  toPublicIdea,
  type PublicIdea,
} from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import type { ReactionCounts } from "@/lib/reactions-shape";
import { IdeaCard } from "@/components/ideas/IdeaCard";
import { IdeaComposer } from "@/components/ideas/IdeaComposer";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

type SortKey = "hot" | "new" | "shipped";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ sort?: string }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { sort } = await searchParams;
  const sortKey = parseSort(sort);
  const title = `Ideas — what to build · ${SITE_NAME}`;
  const description =
    "Builder ideas with reaction signals (build / use / buy / invest). Post yours, react to others, see what gets shipped.";
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(`/ideas?sort=${sortKey}`) },
    openGraph: {
      type: "website",
      title,
      description,
      url: absoluteUrl(`/ideas`),
      siteName: SITE_NAME,
    },
  };
}

function parseSort(raw: string | undefined): SortKey {
  if (raw === "new" || raw === "shipped") return raw;
  return "hot";
}

interface RankedIdea {
  idea: PublicIdea;
  reactionCounts: ReactionCounts;
  hotScore?: number;
}

async function loadFeed(sort: SortKey): Promise<RankedIdea[]> {
  const all = await listIdeas();
  const visible = all.filter(
    (r) =>
      r.status === "published" ||
      r.status === "shipped" ||
      r.status === "archived",
  );
  const withCounts: RankedIdea[] = await Promise.all(
    visible.map(async (record) => {
      const reactions = await listReactionsForObject("idea", record.id);
      return {
        idea: toPublicIdea(record),
        reactionCounts: countReactions(reactions),
      };
    }),
  );
  if (sort === "shipped") {
    return withCounts
      .filter(
        (r) =>
          r.idea.buildStatus === "shipped" || r.idea.status === "shipped",
      )
      .sort(
        (a, b) =>
          Date.parse(b.idea.publishedAt ?? b.idea.createdAt) -
          Date.parse(a.idea.publishedAt ?? a.idea.createdAt),
      );
  }
  if (sort === "new") {
    return withCounts.sort(
      (a, b) =>
        Date.parse(b.idea.publishedAt ?? b.idea.createdAt) -
        Date.parse(a.idea.publishedAt ?? a.idea.createdAt),
    );
  }
  const now = Date.now();
  return withCounts
    .map((r) => ({
      ...r,
      hotScore: hotScore(
        { createdAt: r.idea.publishedAt ?? r.idea.createdAt },
        r.reactionCounts,
        now,
      ),
    }))
    .sort((a, b) => (b.hotScore ?? 0) - (a.hotScore ?? 0));
}

export default async function IdeasPage({ searchParams }: PageProps) {
  const { sort } = await searchParams;
  const sortKey = parseSort(sort);
  const feed = await loadFeed(sortKey);

  return (
    <>
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <header className="border-b border-border-primary pb-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <Lightbulb className="size-5 text-warning" aria-hidden />
              Ideas
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// what builders should ship next"}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Post a 1-line idea. Builders react with{" "}
            <strong className="text-brand">build</strong>,{" "}
            <strong className="text-brand">use</strong>,{" "}
            <strong className="text-brand">buy</strong>, and{" "}
            <strong className="text-brand">invest</strong>. The signal helps
            decide what to ship.
          </p>
        </header>

        <section
          aria-label="Post an idea"
          className="space-y-2"
          data-testid="idea-composer-section"
        >
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary inline-flex items-center gap-1.5">
            <Plus className="size-3" aria-hidden /> New idea
          </h2>
          <IdeaComposer />
        </section>

        <nav
          aria-label="Sort ideas"
          className="flex flex-wrap items-center gap-2 text-xs"
        >
          {(["hot", "new", "shipped"] as SortKey[]).map((view) => {
            const active = view === sortKey;
            return (
              <a
                key={view}
                href={`/ideas?sort=${view}`}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition " +
                  (active
                    ? "border-brand bg-brand/10 text-text-primary"
                    : "border-border-primary bg-bg-muted text-text-secondary hover:text-text-primary")
                }
              >
                {view}
              </a>
            );
          })}
          <span className="ml-auto text-[10px] text-text-tertiary tabular-nums">
            {feed.length} idea{feed.length === 1 ? "" : "s"}
          </span>
        </nav>

        {feed.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 px-4 py-12 text-center text-sm text-text-tertiary">
            <Lightbulb className="size-6 mx-auto mb-3 opacity-50" aria-hidden />
            No ideas yet in this view. Post the first.
          </div>
        ) : (
          <ul className="space-y-3" data-testid="idea-feed">
            {feed.slice(0, 50).map((row) => (
              <li key={row.idea.id}>
                <IdeaCard
                  idea={row.idea}
                  reactionCounts={row.reactionCounts}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
