// /top10/[date] — frozen-snapshot route.
//
// Renders the historical Top 10 from the cron-driven daily snapshot. The
// date param must be `YYYY-MM-DD`; anything else 404s. When the snapshot
// key is missing in Redis (no cron run for that day, or running pre-cron-
// rollout) the route also 404s — the live `/top10` is the only fallback.

import type { Metadata } from "next";
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
  if (!payload) notFound();

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
          <a
            href="/top10"
            style={{ color: "var(--v3-ink-200, #b8c0c8)", textDecoration: "none" }}
          >
            ← BACK TO LIVE
          </a>
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
