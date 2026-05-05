import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const HREF = "/terms";

export const metadata: Metadata = {
  title: `Terms of Use ${SITE_NAME}`,
  description: `Terms of use for ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL.replace(/\/+$/, "")}${HREF}` },
};

export default function TermsPage() {
  return (
    <main className="aiso-container" style={{ padding: "clamp(40px, 6vw, 80px) clamp(20px, 4vw, 32px)", maxWidth: "780px" }}>
      <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "16px" }}>
        Terms of Use
      </h1>
      <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)", marginBottom: "12px" }}>
        Last updated: May 4, 2026.
      </p>
      <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)", marginBottom: "24px" }}>
        By accessing or using TrendingRepo, you agree to these terms.
      </p>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>1. Service Scope</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          TrendingRepo provides trend discovery, analytics, and information overlays for software repositories and related ecosystems. Content is provided
          for informational purposes and may change without notice.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>2. Acceptable Use</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          You must not use the service to abuse APIs, bypass access controls, scrape protected data, interfere with operations, or violate third-party
          platform terms. We may limit, suspend, or block access to protect the platform.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>3. Third-Party Data and Services</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          Our product depends on external providers and public sources. We do not control those services and are not responsible for their availability,
          accuracy, or policy changes.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>4. Disclaimers and Liability Limits</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          The service is provided as-is and as-available, without warranties of any kind. To the maximum extent permitted by law, TrendingRepo and its
          operators are not liable for indirect, incidental, or consequential damages related to your use of the service.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>5. IP Ownership of Submissions</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          You retain ownership of content you submit. By submitting content, you grant TrendingRepo a non-exclusive license to store, process, and display
          it as required to operate and secure the service. You must have the rights to any submitted material.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>6. Account Termination and Access Control</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          We may limit, suspend, or terminate access where needed for legal compliance, abuse prevention, incident response, or platform security.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>7. Governing Law</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          These terms are governed by the laws of the Republic of Indonesia. Disputes are subject to the competent courts of South Sulawesi, Indonesia,
          unless applicable law requires otherwise.
        </p>
      </section>
      <section style={{ marginBottom: "22px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>8. Changes to the Service</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          We may modify, suspend, or discontinue features at any time for security, legal, or operational reasons.
        </p>
      </section>
      <section>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>9. Contact and Updates</h2>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--v4-ink-300)" }}>
          Questions about these terms can be sent via the contact links on the About page. Material updates will be reflected by revising the date above.
        </p>
      </section>
    </main>
  );
}
