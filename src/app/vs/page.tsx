// /vs — comparison index.
//
// Lists every competitor we ship a head-to-head page for. Static — built
// from `src/lib/vs/competitors.ts` at build time.
//
// Cache contract
// --------------
// ISR (force-static), revalidate weekly. Same cadence as the per-competitor
// pages; both refresh together when `COMPETITORS` changes.

import type { Metadata } from "next";
import Link from "next/link";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { absoluteUrl, safeJsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";
import { COMPETITORS, EVIDENCE_URL } from "@/lib/vs/competitors";

export const revalidate = 604800; // 7 days
export const dynamic = "force-static";

const TITLE = `${SITE_NAME} comparison index — ${SITE_NAME} vs every major OSS-radar product`;
const DESCRIPTION =
  "Head-to-head comparisons: TrendingRepo's 11-source consensus, webhook + Slack integrations, and monetization signals lined up against OSSInsight and TrendShift. Evidence-backed feature matrix per competitor.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/vs") },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/vs"),
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

function buildJsonLd(): string {
  const canonical = absoluteUrl("/vs");
  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: TITLE,
    description: DESCRIPTION,
    url: canonical,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    hasPart: COMPETITORS.map((c) => ({
      "@type": "Article",
      headline: c.metaTitle,
      description: c.metaDescription,
      url: absoluteUrl(`/vs/${c.slug}`),
    })),
    citation: {
      "@type": "CreativeWork",
      name: "TrendingRepo competitor deep-crawl deltas — 2026-06-15",
      url: EVIDENCE_URL,
    },
  };
  return safeJsonLd(ld);
}

export default function VsIndexPage() {
  const jsonLd = buildJsonLd();

  return (
    <main
      className="home-surface"
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px)",
        fontFamily: "var(--v4-mono), monospace",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <PageHead
        crumb={
          <>
            <b>VS</b> · TERMINAL · /VS
          </>
        }
        h1={
          <>
            {SITE_NAME} vs everyone else
          </>
        }
        lede="One feature matrix per competitor. Every checkbox is sourced from the v3 competitor deep-crawl deltas captured 2026-06-15 — no marketing claims, just what each product visibly ships."
        clock={
          <>
            <span className="big" style={{ fontSize: 14 }}>
              {COMPETITORS.length} comparisons
            </span>
            <span className="t-d">tracked</span>
          </>
        }
      />

      <section
        aria-labelledby="vs-index-heading"
        style={{ marginTop: 32 }}
      >
        <SectionHead
          num="// 01"
          title={
            <span id="vs-index-heading">Head-to-head pages</span>
          }
          meta={
            <>
              evidence{" "}
              <a
                href={EVIDENCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--v4-ink-300)",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                }}
              >
                PR #241
              </a>
            </>
          }
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginTop: 16,
          }}
        >
          {COMPETITORS.map((c, idx) => (
            <Link
              key={c.slug}
              href={`/vs/${c.slug}`}
              style={{
                display: "block",
                border: "1px solid var(--v4-line-300)",
                background: "var(--v4-bg-050)",
                padding: "18px 20px",
                borderRadius: 4,
                textDecoration: "none",
                color: "inherit",
                transition: "border-color 120ms ease",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--v4-ink-400)",
                }}
              >
                {`// 0${idx + 1} · ${c.crumbTag}`}
              </p>
              <h2
                style={{
                  margin: "8px 0 10px",
                  fontFamily: "var(--v4-sans)",
                  fontSize: 22,
                  letterSpacing: "-0.015em",
                  color: "var(--v4-ink-000)",
                  lineHeight: 1.2,
                }}
              >
                {SITE_NAME} vs {c.displayName}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--v4-sans)",
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "var(--v4-ink-300)",
                }}
              >
                {c.tldr}
              </p>
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: 12,
                  color: "var(--v4-money)",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                }}
              >
                Open comparison →
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="vs-method-heading"
        style={{ marginTop: 48 }}
      >
        <SectionHead
          num="// 02"
          title={<span id="vs-method-heading">How these pages stay honest</span>}
        />
        <div
          style={{
            marginTop: 16,
            border: "1px solid var(--v4-line-300)",
            background: "var(--v4-bg-050)",
            padding: "18px 20px",
            borderRadius: 4,
            fontFamily: "var(--v4-sans)",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--v4-ink-300)",
            maxWidth: 760,
          }}
        >
          <p style={{ margin: 0 }}>
            Each comparison page renders ten rows in the same order across
            every competitor. Each row is a single capability with a
            crawl-confirmed status: shipped, partial / close, not present, or
            not confirmed. Cells render ✓ for shipped, ~ for partial, ✗ for
            not present, and — for unknown. The competitor evidence comes
            from the same crawl run referenced under{" "}
            <a
              href={EVIDENCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--v4-ink-300)",
                textDecoration: "underline",
                textDecorationStyle: "dotted",
              }}
            >
              toolbox PR #241
            </a>{" "}
            (deltas.md, captured 2026-06-15). When a new crawl ships, the
            matrix updates with it — no marketing rewrites in between.
          </p>
        </div>
      </section>

      <footer
        style={{
          marginTop: 36,
          paddingTop: 16,
          borderTop: "1px solid var(--v4-line-300)",
          fontSize: 11,
          color: "var(--v4-ink-400)",
          lineHeight: 1.6,
        }}
      >
        Methodology details:{" "}
        <Link href="/methodology" style={{ color: "var(--v4-ink-300)" }}>
          /methodology
        </Link>{" "}
        · Companion PRs cover the L1 / F4 / C-CAT / Tier-C closes flagged by
        the same deep-crawl run.
      </footer>
    </main>
  );
}
