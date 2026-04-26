// /ideas — V2 public idea feed.
//
// Three views (URL-driven via ?sort=hot|new|shipped):
//   - hot     (default) — weighted reactions × recency decay
//   - new     — chronological by publish time
//   - shipped — only ideas that reached buildStatus = "shipped"
//
// V2 design: TerminalBar header, V2 sort tabs, IdeaCardV2 grid (rank 1
// gets bracket markers via the component's isFeatured rule).

import type { Metadata } from "next";

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
import { IdeaCardV2 } from "@/components/today-v2/IdeaCardV2";
import { IdeaComposer } from "@/components/ideas/IdeaComposer";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
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
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>IDEAS · BUILDER FEED
              </>
            }
            status={`${feed.length} IDEA${feed.length === 1 ? "" : "S"}`}
          />

          <h1
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            IDEAS · WHAT TO BUILD NEXT
            <span
              aria-hidden
              className="inline-block ml-1"
              style={{
                width: 6,
                height: 6,
                background: "var(--v2-acc)",
                borderRadius: 1,
                boxShadow: "0 0 6px var(--v2-acc-glow)",
              }}
            />
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[80ch] mt-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Post a 1-line idea. Builders react with{" "}
            <strong style={{ color: "var(--v2-acc)" }}>build</strong>,{" "}
            <strong style={{ color: "var(--v2-acc)" }}>use</strong>,{" "}
            <strong style={{ color: "var(--v2-acc)" }}>buy</strong>, and{" "}
            <strong style={{ color: "var(--v2-acc)" }}>invest</strong>. The
            signal helps decide what to ship.
          </p>
        </div>
      </section>

      <section
        aria-label="Post an idea"
        className="border-b border-[color:var(--v2-line-100)]"
        data-testid="idea-composer-section"
      >
        <div className="v2-frame py-6">
          <p
            className="v2-mono mb-3"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            COMPOSE · NEW IDEA
          </p>
          <IdeaComposer />
        </div>
      </section>

      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-6">
          <nav
            aria-label="Sort ideas"
            className="flex flex-wrap items-center gap-2"
          >
            {(["hot", "new", "shipped"] as SortKey[]).map((view) => {
              const active = view === sortKey;
              return (
                <a
                  key={view}
                  href={`/ideas?sort=${view}`}
                  aria-current={active ? "page" : undefined}
                  className="v2-mono px-3 py-1.5 inline-block transition"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.20em",
                    color: active
                      ? "var(--v2-bg-000)"
                      : "var(--v2-ink-300)",
                    background: active
                      ? "var(--v2-acc)"
                      : "transparent",
                    border: `1px solid ${
                      active ? "var(--v2-acc)" : "var(--v2-line-200)"
                    }`,
                  }}
                >
                  {view.toUpperCase()}
                </a>
              );
            })}
            <span
              className="ml-auto v2-mono tabular-nums"
              style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
            >
              <span aria-hidden>{"// "}</span>
              {feed.length} IDEA{feed.length === 1 ? "" : "S"}
            </span>
          </nav>
        </div>
      </section>

      <section>
        <div className="v2-frame py-6">
          <p
            className="v2-mono mb-4"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            FEED · {sortKey.toUpperCase()}
          </p>

          {feed.length === 0 ? (
            <div className="v2-card p-8">
              <p
                className="v2-mono mb-3"
                style={{ color: "var(--v2-acc)" }}
              >
                <span aria-hidden>{"// "}</span>
                NO IDEAS · {sortKey.toUpperCase()}
              </p>
              <p
                className="text-[14px] leading-relaxed max-w-[60ch]"
                style={{ color: "var(--v2-ink-200)" }}
              >
                No ideas yet in this view. Post the first.
              </p>
            </div>
          ) : (
            <ul
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              data-testid="idea-feed"
            >
              {feed.slice(0, 50).map((row, index) => (
                <li key={row.idea.id}>
                  <IdeaCardV2
                    idea={row.idea}
                    reactionCounts={row.reactionCounts}
                    hotScore={row.hotScore}
                    rank={index + 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
