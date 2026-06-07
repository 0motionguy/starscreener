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
import { BEST_TOPICS } from "@/lib/best-topics";
import { CATEGORIES } from "@/lib/constants";
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
          ranked by cross-source signal across GitHub, Hacker News, X, Bluesky, Product Hunt
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

      {/* Cross-hub link cards — push PageRank from this indexed hub to the
          /best/* and /categories/* leaves that GSC's deep audit flagged as
          link-graph orphans. */}
      <nav
        className="card"
        aria-label="Curated best-of rankings"
        style={{ marginTop: "1.5rem" }}
      >
        <div className="card-head">
          <h2 className="card-title">
            {"▌"} <b>Or pick a curated best-of list</b>
            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.85em" }}>
              · Editorial top-N rankings for the highest-intent queries
            </span>
          </h2>
        </div>
        <div
          className="card-body"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
        >
          {BEST_TOPICS.map((t) => (
            <Link
              key={t.slug}
              href={`/best/${t.slug}`}
              className="chip"
              prefetch={false}
            >
              {t.title.replace(/^Best /, "Best ")}
            </Link>
          ))}
        </div>
      </nav>

      <nav
        className="card"
        aria-label="Browse by category"
        style={{ marginTop: "1rem" }}
      >
        <div className="card-head">
          <h2 className="card-title">
            {"▌"} <b>Browse the full category leaderboards</b>
            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.85em" }}>
              · Every classification bucket, ranked by live momentum
            </span>
          </h2>
        </div>
        <div
          className="card-body"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
        >
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/categories/${c.id}`}
              className="chip"
              prefetch={false}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
