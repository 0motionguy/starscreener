// TrendingRepo — Daily digest archive index (/digest) — V4 chrome.
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

// V4 (CORPUS) primitives.
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { LiveDot } from "@/components/ui/LiveDot";

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
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>DIGEST</b> · TERMINAL · /DIGEST
          </>
        }
        h1="Daily digest archive — what trended each day."
        lede="Permanent URLs for each day's trending GitHub repositories, ranked by 24-hour star momentum. Each snapshot is an evergreen page — bookmark a date to come back to it."
        clock={
          <>
            <span className="big">{sorted.length}</span>
            <span className="muted">DAILY {sorted.length === 1 ? "SNAPSHOT" : "SNAPSHOTS"}</span>
            <LiveDot label="ARCHIVE LIVE" />
          </>
        }
      />

      {onlyToday ? (
        <section
          className="panel"
          style={{
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <p style={{ color: "var(--v4-ink-100)", fontWeight: 600, marginBottom: 4 }}>
              Daily digests start today.
            </p>
            <p style={{ color: "var(--v4-ink-300)", fontSize: 13 }}>
              Check back tomorrow for the first archive — every day from now on
              produces a new permanent URL.
            </p>
          </div>
          {sorted[0] ? (
            <Link
              href={`/digest/${sorted[0]}`}
              style={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                background: "var(--v4-acc)",
                color: "var(--v4-bg-000)",
                fontFamily: "var(--v4-mono)",
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              View today&apos;s digest →
            </Link>
          ) : null}
        </section>
      ) : (
        <>
          <SectionHead
            num="// 01"
            title="Archive index"
            meta={
              <>
                <b>{sorted.length}</b> · most recent first
              </>
            }
          />
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              borderTop: "1px solid var(--v4-line-200)",
              borderBottom: "1px solid var(--v4-line-200)",
              background: "var(--v4-bg-025)",
            }}
          >
            {sorted.map((date) => (
              <li
                key={date}
                style={{ borderTop: "1px solid var(--v4-line-100)" }}
              >
                <Link
                  href={`/digest/${date}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr auto",
                    alignItems: "center",
                    gap: 16,
                    padding: "12px 16px",
                    color: "var(--v4-ink-100)",
                    transition: "background-color var(--v4-duration-fast) var(--v4-ease)",
                  }}
                  className="v4-digest-row"
                >
                  <span
                    style={{
                      fontFamily: "var(--v4-mono)",
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--v4-ink-100)",
                    }}
                  >
                    {date}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--v4-ink-300)",
                    }}
                  >
                    {formatHumanDate(date)}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--v4-mono)",
                      fontSize: 11,
                      color: "var(--v4-ink-400)",
                      letterSpacing: "0.14em",
                    }}
                  >
                    OPEN →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <style>{`
            .v4-digest-row:hover {
              background: var(--v4-bg-100);
            }
          `}</style>
        </>
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
    </main>
  );
}
