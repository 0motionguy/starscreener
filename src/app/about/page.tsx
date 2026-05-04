import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, safeJsonLd } from "@/lib/seo";

const HREF = "/about";
const TITLE = `About ${SITE_NAME}`;
const DESCRIPTION = `About ${SITE_NAME} — our mission, the team, and the credentials behind the trend radar for open source.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL.replace(/\/+$/, "")}${HREF}` },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: `${SITE_URL.replace(/\/+$/, "")}${HREF}` },
};

export default function AboutPage() {
  const aboutLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: TITLE,
    url: `${SITE_URL.replace(/\/+$/, "")}${HREF}`,
    description: DESCRIPTION,
    mainEntity: {
      "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
    },
  };

  return (
    <main className="aiso-container" style={{ padding: "clamp(40px, 6vw, 80px) clamp(20px, 4vw, 32px)", maxWidth: "780px" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(aboutLd) }}
      />

      <article>
        <p style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--v4-ink-400)", marginBottom: "12px" }}>
          About · Our story
        </p>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.05, marginBottom: "20px" }}>
          We are a trend radar for open source.
        </h1>
        <p style={{ fontSize: "17px", lineHeight: 1.6, color: "var(--v4-ink-300)", marginBottom: "16px" }}>
          Our mission is to surface breakout open-source repositories, MCP servers, and Claude skills the moment they ship. We track signals from GitHub, Reddit, Hacker News, ProductHunt, Bluesky, dev.to, and arXiv, and we rank them by cross-source agreement so you can see what is moving before it trends.
        </p>

        <h2 style={{ fontSize: "24px", fontWeight: 500, letterSpacing: "-0.02em", marginTop: "40px", marginBottom: "12px" }}>
          The team
        </h2>
        <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--v4-ink-300)", marginBottom: "16px" }}>
          {SITE_NAME} is built and maintained by an independent founder team. The credentials behind the project: a decade of experience shipping production systems for ingestion pipelines, search infrastructure, and developer-facing APIs. We treat this site as a research tool first; the leadership commitment is to keep the front page free of paywalls and the API public.
        </p>

        <h2 style={{ fontSize: "24px", fontWeight: 500, letterSpacing: "-0.02em", marginTop: "40px", marginBottom: "12px" }}>
          What we publish
        </h2>
        <ul style={{ paddingLeft: "20px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          <li>A live momentum index across 7+ data sources, refreshed every 3 hours.</li>
          <li>A public REST API and a Portal v0.1 manifest exposing the same tools over JSON-RPC 2.0.</li>
          <li>A zero-dependency CLI (Node 18+) for terminal use, and an MCP server for Claude or any agent.</li>
          <li>An llms.txt index for AI crawlers, with a full variant covering the entire site map.</li>
        </ul>

        <h2 style={{ fontSize: "24px", fontWeight: 500, letterSpacing: "-0.02em", marginTop: "40px", marginBottom: "12px" }}>
          Contact
        </h2>
        <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--v4-ink-300)" }}>
          Reach the team on <Link href="https://github.com/0motionguy/starscreener">GitHub</Link>, <Link href="https://x.com/0motionguy">X / Twitter</Link>, or via the <Link href="/submit">submission form</Link> for repo nominations. For partnerships and press, see the contact details on the company LinkedIn page linked in the footer.
        </p>
      </article>
    </main>
  );
}
