import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "How TrendingRepo ranks repos — Methodology",
  description:
    "TrendingRepo's scoring is transparent: 24h star deltas, cross-source mentions, momentum decay, and category baselines. Here is the exact recipe.",
  alternates: { canonical: absoluteUrl("/methodology") },
  openGraph: {
    type: "article",
    title: "TrendingRepo Methodology",
    description:
      "How we calculate trend scores. Inputs, weights, decay, and what we deliberately exclude.",
    url: absoluteUrl("/methodology"),
    siteName: SITE_NAME,
  },
  robots: { index: true, follow: true },
};

export default function MethodologyPage() {
  return (
    <main className="home-surface" style={{ paddingTop: 24, paddingBottom: 48, maxWidth: 880, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: "var(--v4-mono)", fontSize: 12, color: "var(--v4-ink-400)" }}>SCORING TRANSPARENCY</p>
        <h1 style={{ fontSize: 32, lineHeight: 1.2, margin: "8px 0 0" }}>How we rank repos</h1>
        <p style={{ marginTop: 12, color: "var(--v4-ink-300)" }}>
          TrendingRepo&apos;s trend score is deterministic and inspectable. Every input, weight, and decay constant lives in this document. No secret sauce.
        </p>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20 }}>Inputs (24h window)</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Star delta</strong>: stars gained in the last 24h, weighted 1.0×</li>
          <li><strong>Cross-source mentions</strong>: count of distinct discussions on Hacker News, Reddit, Bluesky, Lobsters, Dev.to, ProductHunt, Twitter — weighted 0.6× per source</li>
          <li><strong>Engagement composite</strong>: combined score of comments, upvotes, retweets per mention — weighted 0.3×</li>
          <li><strong>Momentum decay</strong>: exponential decay over the window so a star burst 1h ago counts more than one 23h ago</li>
          <li><strong>Category baseline</strong>: each category (devtools, AI, frontend, etc.) has its own median; raw scores are normalized against the category median to prevent &quot;everything in AI is trending&quot; distortion</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20 }}>What we exclude</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Star count alone — old, popular repos would dominate</li>
          <li>Single-source spikes that look bot-like (anomaly detection per source)</li>
          <li>Repos archived or marked disabled</li>
          <li>Forks of currently-trending repos (the original gets the credit)</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20 }}>Update cadence</h2>
        <p style={{ lineHeight: 1.7 }}>
          The trending pipeline runs every 20 minutes (UTC :07, :27, :47). Mention pipelines run on per-source schedules between every 6h (Hackernews) and every 24h (Dev.to / Hugging Face).
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20 }}>Inspect the data</h2>
        <p style={{ lineHeight: 1.7 }}>
          Every repo&apos;s detail page (<Link href="/repo/vercel/next.js">/repo/vercel/next.js</Link> for example) shows the raw signal breakdown — per-source mention counts, star deltas across windows, and the live trend score. The pipeline is open-source at{" "}
          <a href="https://github.com/0motionguy/starscreener" target="_blank" rel="noreferrer">github.com/0motionguy/starscreener</a>.
        </p>
      </section>

      <footer style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid var(--v4-line-300)", fontSize: 14, color: "var(--v4-ink-400)" }}>
        Last updated: 2026-05-05 · Methodology version 1.0 · Questions? Email{" "}
        <a href="mailto:hello@trendingrepo.com">hello@trendingrepo.com</a>
      </footer>
    </main>
  );
}
