// StarScreener - Collection detail.

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

export const revalidate = 600;

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
      title: `Collection Not Found - ${SITE_NAME}`,
      description: "This collection does not exist or was removed.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  const title = `${collection.name} - ${SITE_NAME}`;
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
    <section className="page-head">
      <div>
        <div className="crumb">
          <Link href="/collections">Trend terminal / collections</Link>
          <span> / </span>
          <b>{collection.name}</b>
        </div>
        <h1>{collection.name}</h1>
        <p className="lede">
          Curated list from OSS Insight, ranked live against the current
          TrendingRepo terminal index.
        </p>
      </div>
      <div className="clock">
        <span className="big">{collection.items.length}</span>
        <span className="live">{live} with live data</span>
      </div>
    </section>
  );

  return (
    <TerminalLayout
      repos={repos}
      className="home-surface terminal-page collection-detail-page"
      filterBarVariant="category"
      showFeatured={false}
      heading={heading}
    />
  );
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return loadAllCollections().map((c) => ({ slug: c.slug }));
}
