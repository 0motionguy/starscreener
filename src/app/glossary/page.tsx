// /glossary — index of definitional "What is X?" pages.

import Link from "next/link";

import { GLOSSARY } from "@/lib/glossary";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { Icon } from "@/components/icon/Icon";

const TITLE = `Glossary — AI & Open-Source Terms Explained | ${SITE_NAME}`;
const DESCRIPTION =
  "Plain-English definitions of AI and open-source terms — AI agents, MCP, RAG, vector databases, local LLMs and more — each with the trending projects behind them.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/glossary") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/glossary"),
    images: [{ url: "/api/og/default", width: 1200, height: 630, alt: `${SITE_NAME} glossary` }],
  },
  twitter: { card: "summary_large_image" as const, title: TITLE, description: DESCRIPTION, images: ["/api/og/default"] },
};

export default function GlossaryIndexPage() {
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Glossary", path: "/glossary" },
  ]);
  const itemList = buildItemListJsonLd(
    "TrendingRepo glossary",
    "/glossary",
    GLOSSARY.map((t) => ({ name: t.term, path: `/glossary/${t.slug}`, description: t.short })),
  );

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Glossary</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="book" size={14} /> Glossary
        </div>
        <h1>AI &amp; open-source terms, explained</h1>
        <p>
          Plain-English definitions of the terms behind the trends — each paired with the live
          open-source projects that define the space, ranked by cross-source momentum.
        </p>
      </header>

      <div className="grid g-cards">
        {GLOSSARY.map((t) => (
          <Link key={t.slug} href={`/glossary/${t.slug}`} className="card" prefetch={false}>
            <div className="card-head">
              <h2 className="card-title">{`What is ${t.term}?`}</h2>
            </div>
            <div className="card-body">
              <p className="muted">{t.short}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
