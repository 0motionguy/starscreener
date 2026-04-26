// /collections — V2 collections index.
//
// Server component. Lists every collection shipped in data/collections/.
// Each card is a v2-card with collection name, total/live counts, and a
// "moving" tag when members are hot/breakout. Links into /collections/[slug].
//
// Collections are Apache 2.0 data imported from pingcap/ossinsight; see
// data/collections/NOTICE.md for attribution and the resync procedure.

import Link from "next/link";
import type { Metadata } from "next";
import { pipeline, repoStore } from "@/lib/pipeline/pipeline";
import {
  loadAllCollections,
  indexReposByFullName,
  summarizeCollection,
  formatFreshness,
} from "@/lib/collections";
import {
  getCollectionRankingsFetchedAt,
  refreshCollectionRankingsFromStore,
} from "@/lib/collection-rankings";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Curated AI repo collections — agents, RAG, inference, vector DBs, MCP, and more — ranked live against current trending data.";

export const metadata: Metadata = {
  title: `Collections — ${SITE_NAME}`,
  description: DESCRIPTION,
  keywords: [
    "AI collections",
    "GitHub AI repos",
    "LLM tools",
    "agent frameworks",
    "MCP servers",
    "curated lists",
  ],
  alternates: { canonical: absoluteUrl("/collections") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/collections"),
    title: `Collections — ${SITE_NAME}`,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `Collections — ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

export default async function CollectionsIndexPage() {
  await pipeline.ensureReady();
  await refreshCollectionRankingsFromStore();
  const collectionRankingsFetchedAt = getCollectionRankingsFetchedAt();
  const collections = loadAllCollections();
  const liveIndex = indexReposByFullName(repoStore.getAll());
  const freshness = formatFreshness(collectionRankingsFetchedAt);

  const cards = collections.map((c) => {
    const stats = summarizeCollection(c, liveIndex);
    return {
      slug: c.slug,
      name: c.name,
      total: stats.total,
      live: stats.live,
      moving: stats.breakoutCount + stats.hotCount,
    };
  });

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>COLLECTIONS · CURATED · LIVE
              </>
            }
            status={`${cards.length} LIST${cards.length === 1 ? "" : "S"}`}
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
            COLLECTIONS · AI REPO LISTS
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
            Curated AI repo lists ranked live against current trending data.
            Each list pulls from OSS Insight&apos;s open collections; the live
            counter on each card shows how many members are currently in our
            tracking corpus.
          </p>
          {freshness ? (
            <p
              className="v2-mono mt-3 inline-flex items-center gap-2"
              style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
              title={`Rankings last refreshed at ${collectionRankingsFetchedAt}`}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--v2-sig-green)",
                  borderRadius: 1,
                  display: "inline-block",
                }}
              />
              <span aria-hidden>{"// "}</span>
              UPDATED {freshness.toUpperCase()} · {cards.length} COLLECTIONS
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <div className="v2-frame py-6">
          {cards.length === 0 ? (
            <div className="v2-card p-12 text-center">
              <p
                className="v2-mono mb-3"
                style={{ color: "var(--v2-acc)" }}
              >
                <span aria-hidden>{"// "}</span>
                NO COLLECTIONS · COLD
              </p>
              <p
                className="text-[14px] leading-relaxed max-w-md mx-auto"
                style={{ color: "var(--v2-ink-200)" }}
              >
                Collections are curated via{" "}
                <code
                  className="v2-mono-tight"
                  style={{ color: "var(--v2-ink-100)" }}
                >
                  data/collections/*.yml
                </code>
                . Run the sync script to populate.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map((c) => (
                <Link
                  key={c.slug}
                  href={`/collections/${c.slug}`}
                  title={`${c.name} — ${c.total} curated · ${c.live} with live data${c.moving > 0 ? ` · ${c.moving} moving` : ""}`}
                  className="v2-card v2-card-hover p-5 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2
                      className="text-[16px] font-medium"
                      style={{
                        color: "var(--v2-ink-000)",
                        fontFamily: "var(--font-geist), Inter, sans-serif",
                        fontWeight: 510,
                        letterSpacing: "-0.012em",
                      }}
                    >
                      {c.name}
                    </h2>
                    {c.moving > 0 ? (
                      <span
                        className="v2-tag v2-tag-acc shrink-0"
                        title={`${c.moving} member${c.moving === 1 ? "" : "s"} currently hot or breakout`}
                      >
                        {c.moving} MOVING
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-baseline gap-3 v2-mono-tight tabular-nums">
                    <span style={{ color: "var(--v2-ink-100)" }}>
                      {c.total} REPOS
                    </span>
                    <span style={{ color: "var(--v2-ink-500)" }}>·</span>
                    <span style={{ color: "var(--v2-ink-400)" }}>
                      {c.live} LIVE
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-6">
          <p
            className="v2-mono"
            style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
          >
            <span aria-hidden>{"// "}</span>
            CURATED FROM{" "}
            <a
              href="https://github.com/pingcap/ossinsight"
              className="underline decoration-dotted"
              style={{ color: "var(--v2-ink-200)" }}
              rel="noopener noreferrer"
              target="_blank"
            >
              OSS INSIGHT
            </a>{" "}
            · APACHE 2.0 ·{" "}
            <a
              href="https://github.com/Kermit457/starscreener/blob/main/data/collections/NOTICE.md"
              className="underline decoration-dotted"
              style={{ color: "var(--v2-ink-200)" }}
              rel="noopener noreferrer"
              target="_blank"
            >
              ATTRIBUTION
            </a>
          </p>
        </div>
      </footer>
    </>
  );
}
