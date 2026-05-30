// /collections — index of curated OSS Insight collections.
//
// Rebuilt after the v6 cutover 302'd it to the homepage. The data + display
// helpers already existed (src/lib/collections.ts); this restores the
// indexable surface the sitemap + llms.txt already advertise.

import Link from "next/link";

import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { getDerivedRepos } from "@/lib/derived-repos";
import {
  loadAllCollections,
  indexReposByFullName,
  summarizeCollection,
} from "@/lib/collections";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { Icon } from "@/components/icon/Icon";

export const revalidate = 1800;

const TITLE = `Collections — Curated Open-Source Lists | ${SITE_NAME}`;
const DESCRIPTION =
  "Curated collections of open-source projects by theme — each rendered as a live momentum leaderboard. Browse the best repos in AI, infra, web, data and more.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/collections") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/collections"),
    images: [{ url: "/api/og/default", width: 1200, height: 630, alt: `${SITE_NAME} collections` }],
  },
  twitter: { card: "summary_large_image" as const, title: TITLE, description: DESCRIPTION, images: ["/api/og/default"] },
};

export default async function CollectionsIndexPage() {
  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
  ]);

  const collections = loadAllCollections();
  const liveIndex = (() => {
    try {
      return indexReposByFullName(getDerivedRepos());
    } catch {
      return new Map();
    }
  })();

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Collections", path: "/collections" },
  ]);
  const itemList = buildItemListJsonLd(
    "Curated open-source collections",
    "/collections",
    collections.map((c) => ({ name: c.name, path: `/collections/${c.slug}` })),
  );

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Collections</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="layers" size={14} /> Collections
        </div>
        <h1>Curated open-source collections</h1>
        <p>
          Themed collections of open-source projects, each rendered as a live momentum leaderboard —
          ranked by cross-source signal across GitHub, Hacker News, Reddit, X, Bluesky
          and Dev.to, refreshed continuously.
        </p>
      </header>

      <div className="grid g-cards">
        {collections.map((c) => {
          const s = summarizeCollection(c, liveIndex);
          return (
            <Link key={c.slug} href={`/collections/${c.slug}`} className="card" prefetch={false}>
              <div className="card-head">
                <h2 className="card-title">{c.name}</h2>
                <span className="grow" />
                <span className="chip num">{s.total}</span>
              </div>
              <div className="card-body">
                <p className="muted">
                  {s.live} live · {s.breakoutCount} breakout · {s.hotCount} hot
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
