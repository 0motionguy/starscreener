import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL, safeJsonLd } from "@/lib/seo";

const HREF = "/terms";
const TITLE = `Terms of Service — ${SITE_NAME}`;
const DESCRIPTION = `Terms of service for ${SITE_NAME}: acceptable use, disclaimers, and the rules that govern using the site and API.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL.replace(/\/+$/, "")}${HREF}` },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL.replace(/\/+$/, "")}${HREF}`,
  },
};

export default function TermsPage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: TITLE,
    url: `${SITE_URL.replace(/\/+$/, "")}${HREF}`,
    description: DESCRIPTION,
  };

  return (
    <main
      className="aiso-container"
      style={{ padding: "clamp(40px, 6vw, 80px) clamp(20px, 4vw, 32px)", maxWidth: "780px" }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
      />

      <article>
        <p
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "11px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--v4-ink-400)",
            marginBottom: "12px",
          }}
        >
          Terms · Placeholder
        </p>
        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 500,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            marginBottom: "20px",
          }}
        >
          Terms of Service
        </h1>
        <p style={{ fontSize: "17px", lineHeight: 1.6, color: "var(--v4-ink-300)", marginBottom: "16px" }}>
          This page is a placeholder. The full terms of service for {SITE_NAME} are being prepared and will be published here.
        </p>
        <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--v4-ink-300)", marginBottom: "16px" }}>
          By using {SITE_NAME} you agree to use the site and API in good faith, respect rate limits, and not misrepresent the data shown. The site is provided as-is, with no warranty regarding the accuracy or availability of any signal it surfaces.
        </p>
        <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--v4-ink-300)" }}>
          Questions about acceptable use? Reach us via the <Link href="/contact">contact page</Link>.
        </p>
      </article>
    </main>
  );
}
