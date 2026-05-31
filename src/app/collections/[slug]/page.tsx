// /collections/[slug] — a curated collection rendered as a live leaderboard.

import { notFound } from "next/navigation";
import Link from "next/link";

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import { getDerivedRepos } from "@/lib/derived-repos";
import {
  loadAllCollections,
  loadCollection,
  indexReposByFullName,
  assembleCollectionRepos,
  isCuratedQuietStub,
} from "@/lib/collections";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
} from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { TrendingTable } from "@/components/trending/TrendingTable";
import { Icon } from "@/components/icon/Icon";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return loadAllCollections().map((c) => ({ slug: c.slug }));
}

function clamp(text: string, max = 155): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const collection = loadCollection(slug);
  if (!collection) return { title: `Collection — ${SITE_NAME}` };
  const title = `${collection.name} — Curated Open-Source Collection | ${SITE_NAME}`;
  const description = clamp(
    `${collection.name}: ${collection.items.length} curated open-source projects, ranked by cross-source momentum on TrendingRepo. Updated continuously.`,
  );
  const canonical = absoluteUrl(`/collections/${slug}`);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}

export default async function CollectionPage({ params }: PageProps) {
  const { slug } = await params;
  const collection = loadCollection(slug);
  if (!collection) notFound();

  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
    refreshAllMentionStores().catch(() => undefined),
  ]);

  const liveIndex = (() => {
    try {
      return indexReposByFullName(getDerivedRepos());
    } catch {
      return new Map();
    }
  })();
  const repos = assembleCollectionRepos(collection, liveIndex);
  const liveRepos = repos.filter((r) => !isCuratedQuietStub(r));
  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Collections", path: "/collections" },
    { name: collection.name, path: `/collections/${slug}` },
  ]);
  const itemList = buildItemListJsonLd(
    collection.name,
    `/collections/${slug}`,
    liveRepos.slice(0, 25).map((r) => ({
      name: r.fullName,
      path: `/repo/${r.owner}/${r.name}`,
      description: r.description || undefined,
    })),
  );

  const intro = `The ${collection.name} collection tracks ${collection.items.length} curated open-source ${collection.items.length === 1 ? "project" : "projects"}, ${liveRepos.length} of them live on TrendingRepo right now — ranked by a cross-source momentum score blending GitHub star velocity with mentions on Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to.`;

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      {liveRepos.length > 0 ? <JsonLd data={itemList} /> : null}

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/collections">Collections</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{collection.name}</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="layers" size={14} /> Collection
        </div>
        <h1>{collection.name}</h1>
        <p>{intro}</p>
      </header>

      <TrendingTable
        repos={repos}
        fetchedAt={fetchedAt}
        window="24h"
        limit={100}
        category="repos"
        sort="momentum"
      />
    </div>
  );
}
