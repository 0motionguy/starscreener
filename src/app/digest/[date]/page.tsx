// TrendingRepo — Daily digest detail (/digest/[date])
//
// Server component. Renders a permanent snapshot of the trending grid for
// the given date. Today's date resolves; any other date 404s for now —
// see lib/digest/queries.ts header note for the historical-archive plan.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getDigestForDate,
  isValidDigestDate,
  listAvailableDigestDates,
  type DigestData,
  type DigestEntry,
} from "@/lib/digest/queries";
import {
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  safeJsonLd,
} from "@/lib/seo";

// ISR — same 1h window as the digest index + sub-sitemap so the three
// surfaces stay coherent for crawlers.
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ date: string }>;
}

export async function generateStaticParams(): Promise<{ date: string }[]> {
  const dates = await listAvailableDigestDates();
  return dates.map((date) => ({ date }));
}

function formatHumanDate(date: string): string {
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

function formatNumber(n: number): string {
  // Local fork of `lib/utils.formatNumber` — rules say we can only edit the
  // five files we own, so re-implementing the trivial K/M formatter inline
  // is cheaper than pulling utils into our scope.
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDelta(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const formatted = formatNumber(Math.abs(n));
  return n > 0 ? `+${formatted}` : `-${formatted}`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { date } = await params;
  const canonical = absoluteUrl(`/digest/${date}`);

  if (!isValidDigestDate(date)) {
    return {
      title: `Digest Not Found — ${SITE_NAME}`,
      description: "This digest date is invalid or unavailable.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const digest = await getDigestForDate(date);
  if (!digest) {
    return {
      title: `Digest Not Found — ${SITE_NAME}`,
      description: "This digest date is unavailable.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const top3 = digest.entries
    .slice(0, 3)
    .map((e) => e.fullName)
    .join(", ");
  const title = `Trending GitHub repositories on ${date}`;
  const description = `${digest.entries.length} repos that trended on ${date}, ranked by momentum score.${
    top3 ? ` ${top3}.` : ""
  }`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

const DIGEST_TOP_N = 30;

function DigestRow({ entry }: { entry: DigestEntry }) {
  const isUp = entry.starsDelta24h > 0;
  const isDown = entry.starsDelta24h < 0;
  const deltaColor = isUp
    ? "text-up"
    : isDown
      ? "text-down"
      : "text-text-tertiary";

  return (
    <tr className="border-t" style={{ borderColor: "var(--border-primary, #2B2B2F)" }}>
      <td className="py-2 px-3 text-xs font-mono text-text-tertiary tabular-nums">
        {entry.rank}
      </td>
      <td className="py-2 px-3">
        <Link
          href={`/repo/${entry.fullName}`}
          className="text-sm font-medium text-text-primary hover:text-brand transition-colors"
        >
          {entry.fullName}
        </Link>
        {entry.description && (
          <div className="text-xs text-text-tertiary line-clamp-1 mt-0.5 max-w-md">
            {entry.description}
          </div>
        )}
      </td>
      <td className="py-2 px-3 text-sm tabular-nums text-text-secondary text-right">
        {formatNumber(entry.stars)}
      </td>
      <td className={`py-2 px-3 text-sm tabular-nums text-right ${deltaColor}`}>
        {formatDelta(entry.starsDelta24h)}
      </td>
      <td className="py-2 px-3 text-xs text-text-secondary">
        {entry.language ?? "—"}
      </td>
      <td className="py-2 px-3 text-xs text-text-tertiary">
        {entry.category ?? "—"}
      </td>
    </tr>
  );
}

export default async function DigestDatePage({ params }: PageProps) {
  const { date } = await params;
  if (!isValidDigestDate(date)) notFound();

  const digest: DigestData | null = await getDigestForDate(date);
  if (!digest) notFound();

  const topEntries = digest.entries.slice(0, DIGEST_TOP_N);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Date hero */}
      <div className="mb-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-text-tertiary mb-3"
        >
          <Link href="/" className="hover:text-text-primary transition-colors">
            Home
          </Link>
          <span aria-hidden="true">›</span>
          <Link
            href="/digest"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            Digest
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-text-primary font-mono">{date}</span>
        </nav>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-text-primary mb-2">
          Trending GitHub repositories on {date}
        </h1>
        <p className="text-text-secondary text-sm md:text-base leading-relaxed">
          {digest.entries.length} repos that trended on{" "}
          {formatHumanDate(date)}, ranked by 24-hour star momentum.
        </p>
      </div>

      {/* Table — top 30 by 24h star delta. Mirrors the trending grid columns
          (rank / name / stars / delta / language / category). */}
      {topEntries.length === 0 ? (
        <div className="bg-bg-card border border-border-primary rounded-[var(--radius-card)] p-6 text-center">
          <p className="text-text-secondary text-sm">
            No repos in this digest. The collector may have produced an
            empty snapshot for {date}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="text-xs uppercase tracking-wider text-text-tertiary"
                style={{ borderBottom: "1px solid var(--border-primary, #2B2B2F)" }}
              >
                <th className="py-2 px-3 font-medium w-12">#</th>
                <th className="py-2 px-3 font-medium">Repo</th>
                <th className="py-2 px-3 font-medium text-right">Stars</th>
                <th className="py-2 px-3 font-medium text-right">24h</th>
                <th className="py-2 px-3 font-medium">Language</th>
                <th className="py-2 px-3 font-medium">Category</th>
              </tr>
            </thead>
            <tbody>
              {topEntries.map((entry) => (
                <DigestRow key={entry.fullName} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CTA back to live trending */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors"
        >
          View today&apos;s trending →
        </Link>
        <Link
          href="/digest"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border-primary text-sm text-text-secondary hover:text-text-primary hover:bg-bg-card-hover transition-colors"
        >
          Browse all digests
        </Link>
      </div>

      {/* Article JSON-LD — declares the digest itself as a date-stamped
          article so search engines can pick it up as a "what trended on
          YYYY-MM-DD" answer card. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Article",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/digest/${date}#article`,
            headline: `Trending GitHub repositories on ${date}`,
            description: `Daily snapshot of ${digest.entries.length} GitHub repositories that trended on ${date}, ranked by momentum score.`,
            url: absoluteUrl(`/digest/${date}`),
            datePublished: `${date}T00:00:00Z`,
            dateModified: `${date}T00:00:00Z`,
            author: {
              "@type": "Organization",
              name: SITE_NAME,
              url: SITE_URL,
            },
            publisher: {
              "@type": "Organization",
              name: SITE_NAME,
              url: SITE_URL,
              logo: {
                "@type": "ImageObject",
                url: absoluteUrl("/icon.svg"),
              },
            },
            mainEntityOfPage: absoluteUrl(`/digest/${date}`),
          }),
        }}
      />

      {/* ItemList JSON-LD — enumerates the top-N repos so structured data
          rich-results can pick them up. Each item points at the canonical
          repo detail page. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/digest/${date}#itemlist`,
            name: `Trending GitHub repositories on ${date}`,
            numberOfItems: topEntries.length,
            itemListOrder: "https://schema.org/ItemListOrderDescending",
            itemListElement: topEntries.map((entry, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: absoluteUrl(`/repo/${entry.fullName}`),
              name: entry.fullName,
            })),
          }),
        }}
      />

      {/* BreadcrumbList JSON-LD — Home > Digest > {date}. */}
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
              {
                "@type": "ListItem",
                position: 3,
                name: date,
                item: absoluteUrl(`/digest/${date}`),
              },
            ],
          }),
        }}
      />
    </div>
  );
}
