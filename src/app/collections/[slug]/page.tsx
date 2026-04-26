// /collections/[slug] — V2 collection detail.
//
// Server component. Resolves the slug to a YAML collection, intersects
// the curated items against the live pipeline repoStore, and renders a
// V2 page: TerminalBar, breadcrumb, V2 stat tiles, TrendingTableV2.
//
// Collection data is Apache 2.0 from pingcap/ossinsight.

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
import { TrendingTableV2 } from "@/components/today-v2/TrendingTableV2";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

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

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>COLLECTION ·{" "}
                {collection.name.toUpperCase()}
              </>
            }
            status={`${collection.items.length} REPOS · ${live} LIVE`}
          />

          <nav
            aria-label="Breadcrumb"
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-400)",
              fontSize: 11,
              letterSpacing: "0.20em",
            }}
          >
            <Link href="/" style={{ color: "var(--v2-ink-300)" }}>
              HOME
            </Link>
            <span aria-hidden>›</span>
            <Link
              href="/collections"
              style={{ color: "var(--v2-ink-300)" }}
            >
              COLLECTIONS
            </Link>
            <span aria-hidden>›</span>
            <span style={{ color: "var(--v2-ink-100)" }}>
              {collection.name.toUpperCase()}
            </span>
          </nav>

          <h1
            className="v2-display mt-6"
            style={{
              fontSize: "clamp(28px, 4vw, 44px)",
              color: "var(--v2-ink-000)",
            }}
          >
            {collection.name}
          </h1>

          <p
            className="v2-mono mt-3"
            style={{ color: "var(--v2-ink-400)" }}
          >
            <span aria-hidden>{"// "}</span>
            <span
              className="tabular-nums"
              style={{ color: "var(--v2-ink-100)" }}
            >
              {collection.items.length}
            </span>{" "}
            REPOS · CURATED ·{" "}
            <span
              className="tabular-nums"
              style={{ color: "var(--v2-ink-100)" }}
            >
              {live}
            </span>{" "}
            WITH LIVE DATA
          </p>

          <p
            className="v2-mono mt-2"
            style={{ color: "var(--v2-ink-500)", fontSize: 11 }}
          >
            <span aria-hidden>{"// "}</span>
            CURATED FROM{" "}
            <a
              href="https://github.com/pingcap/ossinsight"
              className="underline decoration-dotted"
              style={{ color: "var(--v2-ink-300)" }}
              rel="noopener noreferrer"
              target="_blank"
            >
              OSS INSIGHT
            </a>{" "}
            · APACHE 2.0 ·{" "}
            <a
              href="https://github.com/Kermit457/starscreener/blob/main/data/collections/NOTICE.md"
              className="underline decoration-dotted"
              style={{ color: "var(--v2-ink-300)" }}
              rel="noopener noreferrer"
              target="_blank"
            >
              ATTRIBUTION
            </a>
          </p>
        </div>
      </section>

      <TrendingTableV2 repos={repos} sortBy="stars" limit={collection.items.length} />
    </>
  );
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return loadAllCollections().map((c) => ({ slug: c.slug }));
}
