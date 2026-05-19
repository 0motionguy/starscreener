import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL, safeJsonLd } from "@/lib/seo";

const HREF = "/privacy";
const TITLE = `Privacy Policy — ${SITE_NAME}`;
const DESCRIPTION = `Privacy policy for ${SITE_NAME}: what data we collect, how we use it, and how to contact us about it.`;

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

export default function PrivacyPage() {
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
          Privacy · Placeholder
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
          Privacy Policy
        </h1>
        <p style={{ fontSize: "17px", lineHeight: 1.6, color: "var(--v4-ink-300)", marginBottom: "16px" }}>
          This page is a placeholder. The full privacy policy for {SITE_NAME} is being prepared and will be published here.
        </p>
        <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--v4-ink-300)", marginBottom: "16px" }}>
          In short: we collect the minimum data needed to operate the trend radar (request logs, anonymous analytics, and account info if you sign up). We do not sell user data. We use cookies only for session and preference storage.
        </p>
        <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--v4-ink-300)" }}>
          Questions about data handling? Reach us via the <Link href="/contact">contact page</Link>.
        </p>
      </article>
    </main>
  );
}
