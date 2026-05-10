// /top10/[date] — frozen-snapshot route.
//
// Renders the historical Top 10 from the cron-driven daily snapshot. The
// date param must be `YYYY-MM-DD`; anything else 404s. When the snapshot
// key is missing in Redis (no cron run for that day, or running pre-cron-
// rollout) the route renders an inline empty-state instead of 404 — the
// 404 path was bubbling to the parent error.tsx in dev (digest-rendered
// "ERROR · TOP10/[DATE]") because notFound() doesn't reliably route to
// not-found.tsx from an async server component segment in Next 15.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SITE_NAME, absoluteUrl } from "@/lib/seo";
import {
  isValidDate,
  readTop10Snapshot,
} from "@/lib/top10/snapshots";
import { CATEGORY_META } from "@/lib/top10/types";
import { Top10Page } from "@/components/top10/Top10Page";

// Frozen content — 1h ISR is plenty (the underlying Redis key only ever gets
// rewritten by tomorrow's cron run if the user's clock disagrees with UTC).
export const revalidate = 3600;

interface Params {
  date: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!isValidDate(date)) return { title: `Top 10 — ${SITE_NAME}` };
  const title = `Top 10 — ${date} (snapshot) — ${SITE_NAME}`;
  const ogImage = absoluteUrl(
    `/api/og/top10?cat=repos&window=7d&aspect=h`,
  );
  return {
    title,
    description: `Frozen Top 10 ranking from ${date}. Real corpus, real numbers, captured at midnight UTC.`,
    alternates: { canonical: absoluteUrl(`/top10/${date}`) },
    openGraph: {
      type: "website",
      url: absoluteUrl(`/top10/${date}`),
      title,
      siteName: SITE_NAME,
      images: [{ url: ogImage, width: 1200, height: 675 }],
    },
    twitter: { card: "summary_large_image", title, images: [ogImage] },
    robots: { index: false, follow: true },
  };
}

export default async function FrozenTop10Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { date } = await params;
  if (!isValidDate(date)) notFound();

  const payload = await readTop10Snapshot(date);
  if (!payload) {
    return (
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "64px 24px",
          textAlign: "center",
          fontFamily: "var(--font-mono, ui-monospace)",
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: "var(--v3-ink-300, #84909b)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {"// SNAPSHOT MISSING"}
        </p>
        <h1
          style={{
            fontFamily: "var(--font-geist), Inter, sans-serif",
            fontSize: "clamp(22px, 3vw, 28px)",
            fontWeight: 510,
            letterSpacing: "-0.02em",
            color: "var(--v3-ink-100, #eef0f2)",
            margin: "12px 0 16px",
          }}
        >
          No top-10 snapshot for {date}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--v3-ink-300, #84909b)",
            lineHeight: 1.55,
            margin: "0 0 20px",
          }}
        >
          The daily cron either hadn&apos;t run yet on that date, or the
          snapshot wasn&apos;t persisted. Try the live ranking instead — it
          updates every minute.
        </p>
        <Link
          href="/top10"
          style={{
            display: "inline-block",
            padding: "8px 14px",
            border: "1px solid var(--v3-line-200, #29323b)",
            borderRadius: 4,
            color: "var(--v3-ink-100, #eef0f2)",
            textDecoration: "none",
            fontSize: 12,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          → live /top10
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Snapshot banner — small mono strip ABOVE the live page chrome so
          the user never confuses a frozen snapshot with the live ranking.
          Stays terse so it doesn't fight the existing TOOL · 05 crumb. */}
      <div
        className="v2-mono"
        style={{
          padding: "6px 16px",
          borderBottom: "1px solid var(--v3-line-200, #29323b)",
          background: "var(--v3-bg-050, #101418)",
          color: "var(--v3-ink-300, #84909b)",
          fontSize: 10,
          letterSpacing: "0.20em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ color: "var(--v2-acc, #f56e0f)", fontWeight: 700 }}>
          {"// SNAPSHOT"}
        </span>
        <span style={{ color: "var(--v3-ink-100, #eef0f2)" }}>{date}</span>
        <span style={{ marginLeft: "auto" }}>
          <Link
            href="/top10"
            style={{ color: "var(--v3-ink-200, #b8c0c8)", textDecoration: "none" }}
          >
            ← BACK TO LIVE
          </Link>
        </span>
      </div>
      {/* repoSlice empty so the client wrapper falls back to the SSR-baked
          bundle (no client-side window/metric recompute on a frozen view). */}
      <Top10Page
        payload={payload}
        categoryMeta={CATEGORY_META}
        repoSlice={[]}
      />
    </>
  );
}
