// /best — index of the curated "best of" listicles.

import Link from "next/link";

import { BEST_TOPICS } from "@/lib/best-topics";
import { CATEGORIES } from "@/lib/constants";
import { GLOSSARY } from "@/lib/glossary";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
} from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { Icon } from "@/components/icon/Icon";

export const revalidate = 1800;

const TITLE = `Best Open-Source AI & Developer Projects | ${SITE_NAME}`;
const DESCRIPTION =
  "Curated, regularly-updated rankings of the best open-source projects: AI agents, coding assistants, MCP servers, local LLM tools, vector databases and more — ranked by cross-source momentum.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/best") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/best"),
    images: [{ url: "/api/og/default", width: 1200, height: 630, alt: `${SITE_NAME} best-of rankings` }],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: TITLE,
    description: DESCRIPTION,
    images: ["/api/og/default"],
  },
};

export default function BestIndexPage() {
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Best", path: "/best" },
  ]);
  const itemList = buildItemListJsonLd(
    "Best-of rankings",
    "/best",
    BEST_TOPICS.map((t) => ({ name: t.title, path: `/best/${t.slug}`, description: t.blurb })),
  );

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Best</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="trophy" size={14} /> Best of
        </div>
        <h1>Best open-source AI &amp; developer projects</h1>
        <p>
          Curated top-N rankings across the AI and developer ecosystem — editorial picks backed by
          live data. Each list ranks open-source projects by a cross-source momentum score blending
          GitHub star velocity with mentions on Hacker News, X, Bluesky, Product Hunt and
          Dev.to, refreshed continuously.
        </p>
      </header>

      <div className="grid g-cards">
        {BEST_TOPICS.map((t) => (
          <Link key={t.slug} href={`/best/${t.slug}`} className="card" prefetch={false}>
            <div className="card-head">
              <h2 className="card-title">{t.title}</h2>
            </div>
            <div className="card-body">
              <p className="muted">{t.blurb}.</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Cross-hub link cards — push PageRank from this indexed hub to the
          /categories/* and /glossary/* leaves that GSC's deep audit on
          2026-06-01 flagged as link-graph orphans. */}
      <nav
        className="card"
        aria-label="Browse by category"
        style={{ marginTop: "1.5rem" }}
      >
        <div className="card-head">
          <h2 className="card-title">
            {"▌"} <b>Browse by category instead</b>
            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.85em" }}>
              · Full leaderboards for every classification bucket
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

      <nav
        className="card"
        aria-label="Glossary"
        style={{ marginTop: "1rem" }}
      >
        <div className="card-head">
          <h2 className="card-title">
            {"▌"} <b>Read the definitions</b>
            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.85em" }}>
              · Plain-English definitions paired with the trending projects behind them
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
