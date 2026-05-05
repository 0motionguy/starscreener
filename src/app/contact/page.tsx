import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL, safeJsonLd } from "@/lib/seo";

const HREF = "/contact";
const TITLE = `Contact — ${SITE_NAME}`;
const DESCRIPTION = `How to contact the ${SITE_NAME} team — for partnerships, press, support, or repo nominations.`;

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

export default function ContactPage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
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
          Contact · Get in touch
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
          Contact us
        </h1>
        <p style={{ fontSize: "17px", lineHeight: 1.6, color: "var(--v4-ink-300)", marginBottom: "16px" }}>
          The fastest way to reach the {SITE_NAME} team:
        </p>
        <ul style={{ paddingLeft: "20px", lineHeight: 1.7, color: "var(--v4-ink-300)", marginBottom: "16px" }}>
          <li>
            GitHub issues:{" "}
            <Link href="https://github.com/0motionguy/starscreener/issues">
              github.com/0motionguy/starscreener/issues
            </Link>
          </li>
          <li>
            X / Twitter: <Link href="https://x.com/0motionguy">@0motionguy</Link>
          </li>
          <li>
            LinkedIn:{" "}
            <Link href="https://www.linkedin.com/company/trendingrepo">
              linkedin.com/company/trendingrepo
            </Link>
          </li>
          <li>
            Repo nominations: use the <Link href="/submit">submission form</Link>.
          </li>
        </ul>
        <p style={{ fontSize: "16px", lineHeight: 1.6, color: "var(--v4-ink-300)" }}>
          For partnerships and press, message us via LinkedIn and we will route to the right person within one business day.
        </p>
      </article>
    </main>
  );
}
