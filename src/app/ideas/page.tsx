// /ideas — public idea feed (v2-styled).
//
// Three views (URL-driven via ?sort=hot|new|shipped):
//   - hot     (default) — weighted reactions × recency decay
//   - new     — chronological by publish time
//   - shipped — only ideas that reached buildStatus = "shipped"
//
// Server component. Computes conviction scores server-side and hands
// them to IdeaCard for v2 chrome (conviction gauge + reaction bar).

import type { Metadata } from "next";
import { Lightbulb, Plus } from "lucide-react";

import {
  hotScore,
  listIdeas,
  toPublicIdea,
  type PublicIdea,
  HOT_SCORE_WEIGHTS,
  RECENCY_HALF_LIFE_HOURS,
} from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import type { ReactionCounts } from "@/lib/reactions-shape";
import { IdeaCard } from "@/components/ideas/IdeaCard";
import { IdeaComposer } from "@/components/ideas/IdeaComposer";
import { TerminalBar, MonoLabel, BarcodeTicker } from "@/components/v2";
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
  conviction: number;
}

/** Conviction = weighted reactions decayed by recency, scaled to 0–100. */
function conviction(idea: PublicIdea, reactions: ReactionCounts): number {
  const raw =
    reactions.build * HOT_SCORE_WEIGHTS.build +
    reactions.use * HOT_SCORE_WEIGHTS.use +
    reactions.buy * HOT_SCORE_WEIGHTS.buy +
    reactions.invest * HOT_SCORE_WEIGHTS.invest;
  const createdAt = idea.publishedAt ?? idea.createdAt;
  const hoursAgo = (Date.now() - Date.parse(createdAt)) / 36e5;
  const decay = Math.exp(-hoursAgo / RECENCY_HALF_LIFE_HOURS);
  return Math.min(100, Math.round(Math.log1p(raw * decay) * 18));
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
      const reactionCounts = countReactions(reactions);
      return {
        idea: toPublicIdea(record),
        reactionCounts,
        conviction: conviction(toPublicIdea(record), reactionCounts),
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

  const hero = feed[0];
  const list = feed.slice(1);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* V2 terminal-bar — operator chrome */}
        <div className="v2-frame overflow-hidden">
          <TerminalBar
            label={`// IDEAS · ${sortKey.toUpperCase()}`}
            status={`${feed.length} ROWS · LIVE`}
            live
          />
          <BarcodeTicker count={120} height={12} seed={feed.length || 33} />
        </div>

        <header className="border-b border-[var(--v2-line-std)] pb-6 space-y-3">
          <MonoLabel index="01" name="IDEAS" hint="BUILDERS' QUEUE" tone="muted" />
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-display text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <Lightbulb className="size-5 text-warning" aria-hidden />
              Ideas
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// what builders should ship next"}
            </span>
          </div>
          <p className="max-w-2xl text-sm text-text-secondary">
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
          <div className="space-y-4" data-testid="idea-feed">
            {/* Hero card — top-ranked idea gets full-width treatment */}
            {hero ? (
              <div className="v2-frame overflow-hidden">
                <TerminalBar
                  label={`// HERO · CONVICTION ${hero.conviction}/100`}
                  status={`${hero.reactionCounts.build + hero.reactionCounts.use + hero.reactionCounts.buy + hero.reactionCounts.invest} REACTIONS`}
                  live={sortKey === "hot"}
                />
                <div className="p-1">
                  <IdeaCard
                    idea={hero.idea}
                    reactionCounts={hero.reactionCounts}
                    conviction={hero.conviction}
                    rank={1}
                  />
                </div>
              </div>
            ) : null}

            {/* Leaderboard grid */}
            {list.length > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-3 border-b border-border-primary/60 pb-2">
                  <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-text-tertiary font-semibold">
                    <span className="inline-block size-1.5 rounded-full bg-brand animate-pulse" />
                    LEADERBOARD · LIVE CONVICTION
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-3">
                  {list.slice(0, 49).map((row, idx) => (
                    <li key={row.idea.id}>
                      <IdeaCard
                        idea={row.idea}
                        reactionCounts={row.reactionCounts}
                        conviction={row.conviction}
                        rank={idx + 2}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
