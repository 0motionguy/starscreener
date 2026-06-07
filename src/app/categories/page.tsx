// /categories — index of the 15 classification category hubs.
//
// A shallow but genuinely useful directory: each card carries the live repo
// count + a one-line definition, linking to the per-category answer surface.
// Gives crawlers a clean hub→spoke internal-link graph and gives answer
// engines an ItemList of "what categories does TrendingRepo cover".

import Link from "next/link";

import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { getDerivedCategoryStats } from "@/lib/derived-insights";
import { CATEGORIES } from "@/lib/constants";
import { BEST_TOPICS } from "@/lib/best-topics";
import { GLOSSARY } from "@/lib/glossary";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
} from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { Icon } from "@/components/icon/Icon";

export const revalidate = 1800;

const TITLE = `Categories — Trending Open-Source AI & Developer Projects | ${SITE_NAME}`;
const DESCRIPTION =
  "Browse trending open-source projects by category: AI Agents, MCP servers, Local LLM, Developer Tools, Security and more. Ranked by cross-source momentum, updated continuously.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/categories") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/categories"),
    images: [{ url: "/api/og/default", width: 1200, height: 630, alt: `${SITE_NAME} categories` }],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: TITLE,
    description: DESCRIPTION,
    images: ["/api/og/default"],
  },
};

export default async function CategoriesIndexPage() {
  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
  ]);

  const stats = (() => {
    try {
      return getDerivedCategoryStats();
    } catch {
      return [];
    }
  })();
  const countById = new Map(stats.map((s) => [s.categoryId, s.repoCount]));

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Categories", path: "/categories" },
  ]);
  const itemList = buildItemListJsonLd(
    "TrendingRepo categories",
    "/categories",
    CATEGORIES.map((c) => ({
      name: c.name,
      path: `/categories/${c.id}`,
      description: c.description,
    })),
  );

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Categories</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="grid" size={14} /> Categories
        </div>
        <h1>Trending open-source projects by category</h1>
        <p>
          Fifteen curated categories spanning the AI and developer ecosystem — from agent frameworks
          and MCP servers to local LLM runtimes, databases and security tooling. Every category is
          ranked by a cross-source momentum score that blends GitHub star velocity with mentions on
          Hacker News, X, Bluesky, Product Hunt and Dev.to.
        </p>
      </header>

      <div className="grid g-cards">
        {CATEGORIES.map((c) => {
          const count = countById.get(c.id) ?? 0;
          return (
            <Link key={c.id} href={`/categories/${c.id}`} className="card" prefetch={false}>
              <div className="card-head">
                <h2 className="card-title">{c.name}</h2>
                <span className="grow" />
                {count > 0 ? <span className="chip num">{count}</span> : null}
              </div>
              <div className="card-body">
                <p className="muted">{c.description}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Cross-hub link cards — push PageRank from this indexed hub to the
          /best/* and /glossary/* leaves so Google sees a fully-connected
          answer-surface graph instead of orphan leaves. */}
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
        aria-label="Glossary"
        style={{ marginTop: "1rem" }}
      >
        <div className="card-head">
          <h2 className="card-title">
            {"▌"} <b>What does each term mean?</b>
            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.85em" }}>
              · Plain-English definitions for the AI &amp; open-source vocabulary behind these categories
            </span>
          </h2>
        </div>
        <div
          className="card-body"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
        >
          {GLOSSARY.slice(0, 12).map((t) => (
            <Link
              key={t.slug}
              href={`/glossary/${t.slug}`}
              className="chip"
              prefetch={false}
            >
              {`What is ${t.term}?`}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
