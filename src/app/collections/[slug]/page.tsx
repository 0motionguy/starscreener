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
  summarizeCollection,
  isCuratedQuietStub,
  formatFreshness,
} from "@/lib/collections";
import {
  getCollectionRankingsFetchedAt,
  refreshCollectionRankingsFromStore,
} from "@/lib/collection-rankings";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { formatNumber } from "@/lib/utils";
import type { Repo } from "@/lib/types";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";

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

const CURATOR_NAME = "OSS Insight";
const CURATOR_URL = "https://github.com/pingcap/ossinsight";

export default async function CollectionDetailPage({ params }: PageProps) {
  await pipeline.ensureReady();
  await refreshCollectionRankingsFromStore();
  const { slug } = await params;
  const collection = loadCollection(slug);
  if (!collection) notFound();

  const liveIndex = indexReposByFullName(repoStore.getAll());
  const repos = assembleCollectionRepos(collection, liveIndex);
  const live = liveCountFor(collection, liveIndex);
  const summary = summarizeCollection(collection, liveIndex);
  const rankingsFreshness = formatFreshness(getCollectionRankingsFetchedAt());

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

// --- Composition helpers --------------------------------------------------

interface CollectionIdentityProps {
  name: string;
  curator: string;
  curatorHref: string;
  topics: string[];
  total: number;
  live: number;
  slug: string;
}

function CollectionIdentity({
  name,
  curator,
  curatorHref,
  topics,
  total,
  live,
  slug,
}: CollectionIdentityProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        marginTop: 8,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: 4,
          background: "var(--v4-bg-100)",
          border: "1px solid var(--v4-line-200)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 22,
          color: "var(--v4-ink-200)",
          flexShrink: 0,
          textTransform: "uppercase",
        }}
      >
        {slug.slice(0, 2)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          className="v4-page-head__h1"
          style={{ marginTop: 0, marginBottom: 4 }}
        >
          {name}
        </h1>
        <p
          className="v4-page-head__lede"
          style={{ marginTop: 0, marginBottom: 10 }}
        >
          Curated by{" "}
          <a
            href={curatorHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--v4-acc)" }}
          >
            {curator}
          </a>
          , ranked live against the current TrendingRepo terminal index.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-ink-300)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {topics.map((topic) => (
            <span
              key={topic}
              style={{
                padding: "1px 6px",
                border: "1px solid var(--v4-line-200)",
                borderRadius: 2,
                color: "var(--v4-ink-300)",
              }}
            >
              {topic}
            </span>
          ))}
          <span>
            REPOS{" "}
            <b style={{ color: "var(--v4-ink-100)" }}>{formatNumber(total)}</b>
          </span>
          <span style={{ color: "var(--v4-money)" }}>
            ● {formatNumber(live)} LIVE
          </span>
        </div>
      </div>
    </div>
  );
}

function collectTopTopics(repos: Repo[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const repo of repos) {
    for (const topic of repo.topics ?? []) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([topic]) => topic);
}

interface ActivityRow {
  fullName: string;
  delta: number;
  status: string;
}

function buildActivityFeed(repos: Repo[], limit: number): ActivityRow[] {
  return repos
    .filter((r) => !r.starsDelta7dMissing && r.starsDelta7d !== 0)
    .map((r) => ({
      fullName: r.fullName,
      delta: r.starsDelta7d,
      status: r.movementStatus,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

interface RelatedCollection {
  slug: string;
  name: string;
  total: number;
  overlap: number;
}

function buildRelatedCollections(
  current: ReturnType<typeof loadCollection>,
  limit: number,
): RelatedCollection[] {
  if (!current) return [];
  const all = loadAllCollections();
  const currentItems = new Set(current.items.map((i) => i.toLowerCase()));
  const scored: RelatedCollection[] = [];
  for (const other of all) {
    if (other.slug === current.slug) continue;
    let overlap = 0;
    for (const item of other.items) {
      if (currentItems.has(item.toLowerCase())) overlap += 1;
    }
    scored.push({
      slug: other.slug,
      name: other.name,
      total: other.items.length,
      overlap,
    });
  }
  // Prefer overlap, then larger sibling collections, then alphabetical.
  scored.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      b.total - a.total ||
      a.name.localeCompare(b.name),
  );
  return scored.slice(0, limit);
}
