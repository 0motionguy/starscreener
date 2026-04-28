// TrendingRepo — Daily digest archive index (/digest)
//
// Server component. Lists every date that has a digest snapshot. Today
// is always present; historical dates land here once the collector job
// starts writing dated keys (see lib/digest/queries.ts header note for
// the architectural plan).

import Link from "next/link";
import type { Metadata } from "next";

import { listAvailableDigestDates } from "@/lib/digest/queries";
import {
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  safeJsonLd,
} from "@/lib/seo";

// ISR — the digest index changes at most once per scrape cycle. 1h cache
// matches the sub-sitemap revalidate window so /sitemap-digest.xml and
// this index can never disagree by more than ~60 minutes.
export const revalidate = 3600;

const DIGEST_DESCRIPTION =
  "Browse trending GitHub repositories archive — daily snapshots of momentum-scored open-source repos.";

export const metadata: Metadata = {
  title: `Daily Trending Digests — ${SITE_NAME}`,
  description: DIGEST_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/digest") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/digest"),
    title: `Daily Trending Digests — ${SITE_NAME}`,
    description: DIGEST_DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `Daily Trending Digests — ${SITE_NAME}`,
    description: DIGEST_DESCRIPTION,
  },
};

function formatHumanDate(date: string): string {
  // date is "YYYY-MM-DD". Render as "April 28, 2026" without depending on
  // the host locale — the index page is server-rendered and we want a
  // stable, deterministic string for SEO + crawler caching.
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  const [y, m, d] = parts.map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return date;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return date;
  return dt.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function DigestIndexPage() {
  const dates = await listAvailableDigestDates();
  // Most recent first — `listAvailableDigestDates` returns ISO date strings
  // that sort lexicographically.
  const sorted = [...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const onlyToday = sorted.length <= 1;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero */}
      <div className="mb-8">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-text-tertiary mb-3"
        >
          <Link href="/" className="hover:text-text-primary transition-colors">
            Home
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-text-primary">Digest</span>
        </nav>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-text-primary mb-2">
          Daily digest archive — what trended each day
        </h1>
        <p className="text-text-secondary text-sm md:text-base leading-relaxed max-w-2xl">
          Permanent URLs for each day&apos;s trending GitHub repositories,
          ranked by 24-hour star momentum. Each snapshot is an evergreen
          page — bookmark a date to come back to it.
        </p>
      </div>

      {/* When only today is available, the prominent message becomes the
          primary CTA — there is no archive to browse yet, but today's
          snapshot is still one click away. */}
      {onlyToday ? (
        <div className="bg-bg-card border border-border-primary rounded-[var(--radius-card)] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-text-primary font-semibold mb-1">
                Daily digests start today
              </p>
              <p className="text-text-secondary text-sm">
                Check back tomorrow for the first archive — every day from
                now on produces a new permanent URL.
              </p>
            </div>
            {sorted[0] && (
              <Link
                href={`/digest/${sorted[0]}`}
                className="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors"
              >
                View today&apos;s digest →
              </Link>
            )}
          </div>
        </div>
      ) : (
        <ul
          className="border-y divide-y"
          style={{ borderColor: "var(--border-primary, #2B2B2F)" }}
        >
          {sorted.map((date) => (
            <li
              key={date}
              style={{ borderColor: "var(--border-primary, #2B2B2F)" }}
            >
              <Link
                href={`/digest/${date}`}
                className="flex items-center justify-between gap-4 py-3 px-1 hover:bg-bg-card-hover transition-colors"
              >
                <span className="font-mono text-sm text-text-primary tabular-nums">
                  {date}
                </span>
                <span className="text-sm text-text-secondary truncate">
                  {formatHumanDate(date)}
                </span>
                <span className="text-xs text-text-tertiary shrink-0">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* CollectionPage JSON-LD — declares the index as a curated collection
          and enumerates each digest entry as an inline ItemList element so
          search crawlers can attach the per-day pages to this hub. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/digest#collection`,
            name: `Daily Trending Digests — ${SITE_NAME}`,
            description: DIGEST_DESCRIPTION,
            url: absoluteUrl("/digest"),
            isPartOf: {
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
            },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: sorted.length,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              itemListElement: sorted.map((date, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteUrl(`/digest/${date}`),
                name: `Trending GitHub repositories on ${date}`,
              })),
            },
          }),
        }}
      />

      {/* BreadcrumbList JSON-LD — Home > Digest. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: absoluteUrl("/"),
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Digest",
                item: absoluteUrl("/digest"),
              },
            ],
          }),
        }}
      />
    </div>
  );
}
