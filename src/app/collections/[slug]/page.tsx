// StarScreener — Collection detail
//
// Server component. Resolves the slug to a YAML collection under
// data/collections/, intersects the curated items against the live
// pipeline repoStore, and renders a unified TerminalLayout table.
// Curated items missing from live trending appear as muted stub rows
// (see isCuratedQuietStub in src/lib/collections.ts) — the table stays
// unified; styling degrades.
//
// Collection data is Apache 2.0 from pingcap/ossinsight (see
// data/collections/NOTICE.md).

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pipeline, repoStore } from "@/lib/pipeline/pipeline";
import {
  loadCollection,
  loadAllCollections,
  indexReposByFullName,
  assembleCollectionRepos,
  liveCountFor,
} from "@/lib/collections";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = loadCollection(slug);
  const canonical = absoluteUrl(`/collections/${slug}`);
  if (!collection) {
    return {
      title: `Collection Not Found — ${SITE_NAME}`,
      description: "This collection doesn't exist or was removed.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  const title = `${collection.name} — ${SITE_NAME}`;
  const description = `${collection.items.length} curated repos in ${collection.name}, ranked live against current trending data on ${SITE_NAME}.`;
  return {
    title,
    description,
    keywords: [
      collection.name,
      "AI",
      "GitHub",
      "curated",
      "open source",
      "momentum",
    ],
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CollectionDetailPage({ params }: PageProps) {
  await pipeline.ensureReady();
  const { slug } = await params;
  const collection = loadCollection(slug);
  if (!collection) notFound();

  const liveIndex = indexReposByFullName(repoStore.getAll());
  const repos = assembleCollectionRepos(collection, liveIndex);
  const live = liveCountFor(collection, liveIndex);

  const heading = (
    <div className="px-4 sm:px-6 pt-6 pb-2">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-text-tertiary mb-3"
      >
        <Link href="/" className="hover:text-text-secondary">
          Home
        </Link>
        <span>/</span>
        <Link href="/collections" className="hover:text-text-secondary">
          Collections
        </Link>
        <span>/</span>
        <span className="text-text-secondary">{collection.name}</span>
      </nav>

      <div className="flex flex-col gap-2 mb-2">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary">
          {collection.name}
        </h1>
        <div className="flex items-baseline gap-2 font-mono text-xs">
          <span className="text-text-primary font-semibold tabular-nums">
            {collection.items.length} repos
          </span>
          <span className="text-text-tertiary tabular-nums">
            {live} with live data
          </span>
        </div>
      </div>

      <p className="text-[11px] text-text-tertiary">
        Curated list from{" "}
        <a
          href="https://github.com/pingcap/ossinsight"
          className="underline hover:text-text-secondary"
          rel="noopener noreferrer"
          target="_blank"
        >
          OSS Insight
        </a>{" "}
        (Apache 2.0) —{" "}
        <a
          href="https://github.com/0motionguy/starscreener/blob/main/data/collections/NOTICE.md"
          className="underline hover:text-text-secondary"
          rel="noopener noreferrer"
          target="_blank"
        >
          attribution
        </a>
        .
      </p>
    </div>
  );

  return (
    <TerminalLayout
      repos={repos}
      filterBarVariant="category"
      showFeatured={false}
      heading={heading}
    />
  );
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return loadAllCollections().map((c) => ({ slug: c.slug }));
}
