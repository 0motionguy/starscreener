// Route-level 404 — matches shell.css visual style. Server component.
// Friendly off-ramp back to the trending hub plus a couple of quick links.

import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not found — TrendingRepo",
  description: "We couldn't find that page. Head back to the live trending feed.",
  // CRITICAL: every not-found render MUST emit noindex explicitly and
  // override the layout's `robots: { index: true, follow: true }`. Without
  // this, the rendered HTML carries TWO conflicting <meta name="robots">
  // tags — the layout's index/follow PLUS Next's auto-injected noindex on
  // not-found renders. Worker outage 2026-05-30/31 → repos transiently
  // returned not-found → Googlebot crawled URLs with that dual-tag state
  // (noindex wins) → ~95% drop in impressions across 4 days. Belt-and-
  // braces against any future recurrence. See tasks/gsc-deep-audit-2026-06-01.md.
  robots: { index: false, follow: false },
  alternates: { canonical: undefined },
};

export default function NotFoundPage() {
  return (
    <div style={{ padding: "60px 22px", maxWidth: 720, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <h1 className="card-title">
            <span style={{ color: "var(--fg-faint)" }}>●</span>{" "}
            <b>404 · this surface doesn&apos;t exist</b>
          </h1>
        </div>
        <div
          className="card-body"
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: 13,
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            The page you tried to load isn&apos;t wired up — could be a stale
            link, a typo, or a repo we haven&apos;t indexed yet. The live data
            spine is fine, just nothing to render here.
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-faint)",
              margin: 0,
              letterSpacing: "0.04em",
            }}
          >
            status · 404 · not_found
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 6,
              flexWrap: "wrap",
            }}
          >
            <Link href="/" className="btn primary">
              ← Back to trending
            </Link>
            <Link href="/breakout" className="btn ghost">
              Breakout watch
            </Link>
            <Link href="/market-signals" className="btn ghost">
              Market signals
            </Link>
            <Link href="/ideas" className="btn ghost">
              Idea board
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
