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
  liveCountFor,
} from "@/lib/collections";
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
  const collections = loadAllCollections();
  const liveIndex = indexReposByFullName(repoStore.getAll());

  const cards = collections.map((c) => ({
    slug: c.slug,
    name: c.name,
    total: c.items.length,
    live: liveCountFor(c, liveIndex),
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
          Collections
        </h1>
        <p className="text-text-secondary">
          Curated AI repo lists ranked live against current trending data.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link
            key={c.slug}
            href={`/collections/${c.slug}`}
            className="group flex flex-col gap-2 p-4 rounded-lg border border-border-subtle bg-surface-raised hover:border-brand hover:bg-surface-hover transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-text-tertiary group-hover:text-brand transition-colors" />
                <span className="font-display text-base font-semibold text-text-primary">
                  {c.name}
                </span>
              </div>
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
