import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const HREF = "/privacy";

export const metadata: Metadata = {
  title: `Privacy Policy ${SITE_NAME}`,
  description: `Privacy policy for ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL.replace(/\/+$/, "")}${HREF}` },
  robots: { index: true, follow: true },
  openGraph: {
    title: `Privacy Policy ${SITE_NAME}`,
    description: `Privacy policy for ${SITE_NAME}.`,
    url: `${SITE_URL.replace(/\/+$/, "")}${HREF}`,
    type: "article",
  },
  twitter: {
    card: "summary",
    title: `Privacy Policy ${SITE_NAME}`,
    description: `Privacy policy for ${SITE_NAME}.`,
  },
};

export default function PrivacyPage() {
  return (
    <main className="aiso-container" style={{ padding: "clamp(40px, 6vw, 80px) clamp(20px, 4vw, 32px)", maxWidth: "780px" }}>
      <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "16px" }}>
        Privacy Policy
      </h1>
      <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)", marginBottom: "12px" }}>
        Last updated: May 4, 2026.
      </p>
      <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)", marginBottom: "24px" }}>
        This policy explains what data TrendingRepo collects, how we use it, how long we keep it, and what controls you have when you use the website and related services.
      </p>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>1. Scope</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          This policy covers data processed on trendingrepo.com, including public pages, API routes, submission flows, and authenticated admin operations.
          It does not cover third-party sites linked from our pages.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>2. Data We Collect</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          We process limited operational and security data to run the service: request metadata (for example IP-derived context, user-agent, path, and
          timing), error and reliability logs, anti-abuse and rate-limit telemetry, and product preferences stored in browser/local state (for example
          watchlist and theme).
        </p>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)", marginTop: "10px" }}>
          If you use restricted admin or operational routes, we process session/authentication identifiers and access-control logs required to verify and
          protect administrative access.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>3. How We Use Data</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          We use data to operate platform features, enforce security controls, detect and investigate abuse, troubleshoot incidents, maintain reliability,
          and measure product quality. We do not sell personal data.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>4. Cookies and Local Storage</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          We use cookies and browser storage for session continuity, security controls, and preference persistence. If analytics tooling is enabled, it is
          used for aggregate telemetry and operational diagnostics.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>5. Data Sharing</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          We share data only with processors and infrastructure providers required to operate the service (for example hosting, observability, payment, and
          security tooling), and when required by law. Access is limited to what is necessary for service delivery and platform safety.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>6. Retention and Security</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          We retain data only as long as necessary for operational, legal, and security purposes. Security and incident logs may be retained longer when
          needed for fraud prevention, abuse analysis, incident response, or audit obligations. Access to sensitive operational data is restricted with
          role-based controls.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>7. Your Rights and Choices</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          Depending on your jurisdiction, you may have rights to access, correct, delete, or restrict processing of personal data. You may also request
          account/session-related support and privacy clarifications.
        </p>
      </section>
      <section>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>8. Contact</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          Privacy requests can be submitted through our contact channels on the About page (GitHub, X/Twitter, AGNT Newsroom, or the submission form).
          We may update this policy from time to time and will revise the date above when material changes are made.
        </p>
      </section>
    </main>
  );
}
