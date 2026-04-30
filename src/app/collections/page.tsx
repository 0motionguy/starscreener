// StarScreener — Collections index
//
// Server component. Lists every collection shipped in data/collections/.
// Each card shows: name, total curated items, count currently in the
// live trending store. Links into /collections/[slug].
//
// Collections are Apache 2.0 data imported from pingcap/ossinsight; see
// data/collections/NOTICE.md for attribution and the resync procedure.

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
  // Refresh collection-rankings cache from the data-store before reading sync getters.
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

  if (cards.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-2">
            Collections
          </h1>
        </div>
        <div
          role="status"
          className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-primary bg-bg-card px-6 py-16 text-center"
        >
          <div className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-bg-tertiary text-text-tertiary">
            <Layers size={20} strokeWidth={1.75} />
          </div>
          <h3 className="font-display text-lg text-text-primary">
            No collections available
          </h3>
          <p className="mt-1 max-w-sm text-sm text-text-tertiary">
            Collections are curated via data/collections/*.yml. Run the sync
            script to populate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-2">
          Collections
        </h1>
        <p className="text-text-secondary">
          Curated AI repo lists ranked live against current trending data.
        </p>
        {freshness && (
          <p
            className="mt-2 font-mono text-[11px] uppercase tracking-wider text-text-tertiary"
            title={`Rankings last refreshed at ${collectionRankingsFetchedAt}`}
          >
            <span
              className="inline-block size-1.5 rounded-full bg-functional align-middle mr-1.5"
              aria-hidden="true"
            />
            Updated {freshness} · {cards.length} collections
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link
            key={c.slug}
            href={`/collections/${c.slug}`}
            title={`${c.name} — ${c.total} curated · ${c.live} with live data${c.moving > 0 ? ` · ${c.moving} moving` : ""}`}
            className="group flex flex-col gap-2 p-4 rounded-lg border border-border-subtle bg-surface-raised hover:border-brand hover:bg-surface-hover transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-text-tertiary group-hover:text-brand transition-colors" />
                <span className="font-display text-base font-semibold text-text-primary">
                  {c.name}
                </span>
              </div>
              {c.moving > 0 && (
                <span
                  className="shrink-0 rounded-full border border-accent-amber/40 bg-accent-amber/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-amber"
                  title={`${c.moving} member${c.moving === 1 ? "" : "s"} currently hot or breakout`}
                >
                  {c.moving} moving
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 font-mono text-xs">
              <span className="text-text-primary font-semibold tabular-nums">
                {c.total} repos
              </span>
              <span className="text-text-tertiary tabular-nums">
                {c.live} with live data
              </span>
            </div>
          </Link>
        ))}
      </div>

      <footer className="mt-12 pt-6 border-t border-border-subtle text-xs text-text-tertiary">
        Curated lists from{" "}
        <a
          href="https://github.com/pingcap/ossinsight"
          className="underline hover:text-text-secondary"
          rel="noopener noreferrer"
          target="_blank"
        >
          OSS Insight
        </a>{" "}
        (Apache 2.0).{" "}
        <a
          href="https://github.com/Kermit457/starscreener/blob/main/data/collections/NOTICE.md"
          className="underline hover:text-text-secondary"
          rel="noopener noreferrer"
          target="_blank"
        >
          Attribution &amp; resync details
        </a>
        .
      </footer>
    </div>
  );
}
