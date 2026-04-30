// StarScreener - Collections index.

import Link from "next/link";
import type { Metadata } from "next";
import { Layers } from "lucide-react";
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
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const revalidate = 600;

const DESCRIPTION =
  "Curated AI repo collections: agents, RAG, inference, vector DBs, MCP, and more, ranked live against current trending data.";

export const metadata: Metadata = {
  title: `Collections - ${SITE_NAME}`,
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
    title: `Collections - ${SITE_NAME}`,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `Collections - ${SITE_NAME}`,
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
    <main className="home-surface collections-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Trend terminal</b> / collections
          </div>
          <h1>Curated AI repo lists ranked live.</h1>
          <p className="lede">
            Agents, RAG, inference, vector databases, MCP, and more. Each
            collection opens into a live terminal view.
          </p>
        </div>
        <div className="clock">
          <span className="big">{cards.length}</span>
          <span className="live">collections live</span>
        </div>
      </section>

      {freshness && (
        <section className="panel collection-freshness">
          <div className="panel-head">
            <span className="key">{"// COLLECTION RANKINGS"}</span>
            <span className="right">
              <span className="live">Updated {freshness}</span>
            </span>
          </div>
        </section>
      )}

      {cards.length === 0 ? (
        <section className="compare-empty-state" role="status">
          <div className="compare-empty-icon">
            <Layers size={22} strokeWidth={1.75} />
          </div>
          <p>Collections are curated via data/collections/*.yml.</p>
        </section>
      ) : (
        <section className="tool-grid collections-grid" aria-label="Collections">
          {cards.map((c) => (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              title={`${c.name} - ${c.total} curated - ${c.live} with live data`}
              className="tool collection-card"
            >
              <span className="t-num">{c.total} curated repos</span>
              <span className="category-card-title">
                <Layers size={18} aria-hidden="true" />
                <span>{c.name}</span>
              </span>
              <span className="t-d">
                {c.live} repos with live data
                {c.moving > 0 ? ` / ${c.moving} moving now` : ""}
              </span>
              <span className="t-foot">
                {c.moving > 0 ? `${c.moving} moving` : "stable"}
                <span className="ar">-&gt;</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      <footer className="collection-foot">
        Curated lists from{" "}
        <a
          href="https://github.com/pingcap/ossinsight"
          rel="noopener noreferrer"
          target="_blank"
        >
          OSS Insight
        </a>{" "}
        (Apache 2.0).
      </footer>
    </main>
  );
}
