// /trends — cross-source aggregator index (AGN-712).
//
// Purpose: a single landing page that points at every per-source trending
// terminal. STARSCREENER ships a /trending feed for each signal source
// (HN, Reddit, Bluesky, arXiv, HuggingFace, Dev.to). Before this restore
// `/trends` was a 404; users clicking the menu lost the trail.
//
// This page intentionally does NOT fetch data — it is a pure index. Each
// per-source page already does its own data-store refresh and ISR; we
// just link to them. K2 (simplest aggregator that solves the 404).
//
// Pattern reference: /categories (V4 PageHead + grid of Link cards).

import type { Metadata } from "next";
import Link from "next/link";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { absoluteUrl, safeJsonLd, SITE_NAME } from "@/lib/seo";

// ISR — 30min cadence matches /signals. The page has no live data so the
// revalidation budget is irrelevant from a freshness standpoint, but we
// match the family default so it doesn't unexpectedly stale-cache.
export const revalidate = 1800;

const TRENDS_DESCRIPTION =
  "Real-time trends across every source — Hacker News, Reddit, Bluesky, arXiv, Hugging Face, and Dev.to. One index, six live terminals.";

export const metadata: Metadata = {
  title: `Trends — ${SITE_NAME}`,
  description: TRENDS_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/trends") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/trends"),
    title: `Trends — ${SITE_NAME}`,
    description: TRENDS_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `Trends — ${SITE_NAME}`,
    description: TRENDS_DESCRIPTION,
  },
};

interface SourceCard {
  /** Visible name (used for the card title + accessible label). */
  name: string;
  /** Internal route path. */
  href: string;
  /** Eyebrow tag — caps mono, matches the per-source terminal's brand. */
  tag: string;
  /** One-line lede shown on the card. */
  lede: string;
  /** Brand accent color (matches the per-source terminal page). */
  accent: string;
}

// Six per-source trending terminals shipped today. /devto is the dev.to
// long-form surface (the per-source equivalent of the others). Order
// approximates traffic / signal density so the highest-velocity feeds
// surface top-left on the grid.
const SOURCES: SourceCard[] = [
  {
    name: "Hacker News",
    href: "/hackernews/trending",
    tag: "// HN",
    lede: "Top stories ranked by velocity-weighted trending score. Firebase top-500 plus the 7-day Algolia GitHub-mention sweep.",
    accent: "#ff6600",
  },
  {
    name: "Reddit",
    href: "/reddit/trending",
    tag: "// REDDIT",
    lede: "Top posts across r/MachineLearning, r/LocalLLaMA, r/programming and the long tail of dev / ML / LLM subs — scored, deduped, ranked.",
    accent: "var(--v4-src-reddit)",
  },
  {
    name: "Bluesky",
    href: "/bluesky/trending",
    tag: "// BLUESKY",
    lede: "Top Bluesky posts by engagement velocity from tracked dev / ML / open-source authors.",
    accent: "#1185fe",
  },
  {
    name: "arXiv",
    href: "/arxiv/trending",
    tag: "// ARXIV",
    lede: "Trending papers across cs.AI / cs.CL / cs.LG by recency plus linked-repo momentum. Source-scoped twin of the /papers feed.",
    accent: "#B22234",
  },
  {
    name: "Hugging Face",
    href: "/huggingface/trending",
    tag: "// HF",
    lede: "Trending Hugging Face models by download velocity, likes, and cross-source mention overlap.",
    accent: "#ffd21e",
  },
  {
    name: "Dev.to",
    href: "/devto",
    tag: "// DEV.TO",
    lede: "Top developer-written articles by velocity score, plus the repo leaderboard mentioned across them.",
    accent: "#6699ff",
  },
];

export default function TrendsPage() {
  // AGN-803 (H4) — JSON-LD WebPage schema. Declares /trends as a structured
  // aggregator hub: BreadcrumbList anchors it under Home, and an ItemList
  // mainEntity enumerates the six per-source trending terminals so crawlers
  // can pick them up as related URLs from the index page itself.
  const trendsLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Trends — ${SITE_NAME}`,
    description: TRENDS_DESCRIPTION,
    url: absoluteUrl("/trends"),
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Trends",
          item: absoluteUrl("/trends"),
        },
      ],
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: SOURCES.length,
      itemListElement: SOURCES.map((src, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: src.name,
        url: absoluteUrl(src.href),
      })),
    },
  };

  return (
    <main className="home-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(trendsLd) }}
      />
      <PageHead
        crumb={
          <>
            <b>TRENDS</b> · INDEX · /TRENDS
          </>
        }
        h1="Real-time trends across every source."
        lede="Six live signal terminals — pick a source. Each page does its own ISR refresh against Redis-backed collectors so feeds stay fresh between deploys."
        clock={
          <>
            <span className="big">{SOURCES.length}</span>
            <span className="muted">SOURCES</span>
          </>
        }
      />

      <SectionHead
        num="// 01"
        title="Trending terminals"
        meta={
          <>
            <b>{SOURCES.length}</b> sources · live ISR
          </>
        }
      />

      <section
        id="trends-grid"
        aria-label="Per-source trending pages"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
          padding: "12px 0 32px",
        }}
      >
        {SOURCES.map((src) => (
          <Link
            key={src.href}
            href={src.href}
            aria-label={`${src.name} trending feed`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 14,
              background: "var(--v4-bg-100)",
              border: "1px solid var(--v4-line-200)",
              borderTop: `2px solid ${src.accent}`,
              borderRadius: 4,
              color: "var(--v4-ink-100)",
              textDecoration: "none",
              transition: "background 120ms ease, border-color 120ms ease",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--v4-ink-400)",
              }}
            >
              {src.tag}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--v4-ink-000)",
              }}
            >
              {src.name}
            </span>
            <span
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                color: "var(--v4-ink-300)",
                flex: 1,
              }}
            >
              {src.lede}
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                paddingTop: 6,
                borderTop: "1px solid var(--v4-line-200)",
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--v4-ink-400)",
              }}
            >
              <span>{src.href}</span>
              <span style={{ color: "var(--v4-acc)" }} aria-hidden="true">
                →
              </span>
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
