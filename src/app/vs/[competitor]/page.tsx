// /vs/<competitor> — head-to-head comparison landing page.
//
// One page per slug in `src/lib/vs/competitors.ts`. Pure SEO + signup
// conversion: feature matrix at the top, three "why this matters" panels
// underneath, JSON-LD ComparisonPage at the bottom.
//
// Honesty contract
// ----------------
// Every checkbox traces back to the v3 competitor deep-crawl deltas captured
// on 2026-06-15 (toolbox PR #241,
// scripts/competitor-deep-crawl/out/2026-06-15T07-19-30-206Z/deltas.md).
// If a competitor genuinely covers something partially, the cell renders
// `partial` rather than ✗ — see the row notes for the qualifier.
//
// Cache contract
// --------------
// ISR (force-static). Revalidate weekly — the underlying competitor surface
// changes slowly and the rows are hand-authored. Updates ship via a new
// commit to `src/lib/vs/competitors.ts`.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { absoluteUrl, safeJsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";
import {
  COMPETITORS,
  EVIDENCE_URL,
  getCompetitor,
  type CellStatus,
  type CompetitorProfile,
  type MatrixCell,
} from "@/lib/vs/competitors";

export const revalidate = 604800; // 7 days
export const dynamic = "force-static";

interface PageProps {
  params: Promise<{ competitor: string }>;
}

export async function generateStaticParams(): Promise<
  { competitor: string }[]
> {
  return COMPETITORS.map((c) => ({ competitor: c.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { competitor } = await params;
  const profile = getCompetitor(competitor);
  const canonical = absoluteUrl(`/vs/${competitor}`);
  if (!profile) {
    return {
      title: `Comparison not found — ${SITE_NAME}`,
      description: "This comparison page does not exist.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  return {
    title: profile.metaTitle,
    description: profile.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: profile.metaTitle,
      description: profile.metaDescription,
      url: canonical,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title: profile.metaTitle,
      description: profile.metaDescription,
    },
    robots: { index: true, follow: true },
  };
}

// -----------------------------------------------------------------------------
// Status token
// -----------------------------------------------------------------------------

const STATUS_GLYPH: Record<CellStatus, string> = {
  yes: "✓",
  no: "✗",
  partial: "~",
  unknown: "—",
};

const STATUS_LABEL: Record<CellStatus, string> = {
  yes: "Yes",
  no: "No",
  partial: "Partial",
  unknown: "Unknown",
};

const STATUS_COLOR: Record<CellStatus, string> = {
  yes: "var(--v4-money)",
  no: "var(--v4-ink-400)",
  partial: "var(--v4-amber, #facc15)",
  unknown: "var(--v4-ink-400)",
};

function StatusGlyph({
  status,
}: {
  status: CellStatus;
}) {
  return (
    <span
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 22,
        height: 22,
        borderRadius: 4,
        fontFamily: "var(--v4-mono), monospace",
        fontSize: 14,
        fontWeight: 600,
        color: STATUS_COLOR[status],
        background:
          status === "yes"
            ? "var(--v4-money-soft, rgba(34, 197, 94, 0.12))"
            : status === "partial"
              ? "rgba(250, 204, 21, 0.12)"
              : "transparent",
        border:
          status === "no" || status === "unknown"
            ? "1px solid var(--v4-line-300)"
            : "none",
      }}
    >
      {STATUS_GLYPH[status]}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Cell — vertical stack: glyph + note (note shown only when present)
// -----------------------------------------------------------------------------

function Cell({ cell }: { cell: MatrixCell }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "flex-start",
      }}
    >
      <StatusGlyph status={cell.status} />
      {cell.note ? (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.45,
            color: "var(--v4-ink-300)",
            maxWidth: 340,
          }}
        >
          {cell.note}
        </p>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// JSON-LD — schema.org has no native ComparisonPage type, so use
// WebPage with @type "WebPage" and an itemListElement of Question/Answer
// pairs is the closest pattern; we keep it simple with a typed Article
// referencing the two organizations being compared. Compatible with
// Google's structured data validators.
// -----------------------------------------------------------------------------

function buildJsonLd(profile: CompetitorProfile, canonical: string): string {
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: profile.metaTitle,
    description: profile.metaDescription,
    url: canonical,
    mainEntityOfPage: canonical,
    about: [
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
      },
      {
        "@type": "SoftwareApplication",
        name: profile.displayName,
        url: profile.homepage,
        applicationCategory: "BusinessApplication",
      },
    ],
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    citation: {
      "@type": "CreativeWork",
      name: "TrendingRepo competitor deep-crawl deltas — 2026-06-15",
      url: EVIDENCE_URL,
    },
  };
  return safeJsonLd(ld);
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default async function VsCompetitorPage({ params }: PageProps) {
  const { competitor } = await params;
  const profile = getCompetitor(competitor);
  if (!profile) {
    notFound();
  }

  const canonical = absoluteUrl(`/vs/${profile.slug}`);
  const jsonLd = buildJsonLd(profile, canonical);

  return (
    <main
      className="home-surface"
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px)",
        fontFamily: "var(--v4-mono), monospace",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <PageHead
        crumb={
          <>
            <b>VS</b> · {profile.crumbTag} · /VS/{profile.slug.toUpperCase()}
          </>
        }
        h1={
          <>
            {SITE_NAME} vs {profile.displayName}
          </>
        }
        lede={profile.tldr}
        clock={
          <>
            <span className="big" style={{ fontSize: 14 }}>
              {COMPETITORS.length} comparisons
            </span>
            <span className="t-d">
              <Link
                href="/vs"
                style={{
                  color: "var(--v4-ink-300)",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                }}
              >
                see all
              </Link>
            </span>
          </>
        }
      />

      <section
        aria-labelledby={`matrix-${profile.slug}-heading`}
        style={{ marginTop: 32 }}
      >
        <SectionHead
          num="// 01"
          title={
            <span id={`matrix-${profile.slug}-heading`}>
              Feature matrix · what each product ships
            </span>
          }
          meta={
            <>
              <b>{profile.rows.length}</b> rows · evidence{" "}
              <a
                href={EVIDENCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--v4-ink-300)",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                }}
              >
                PR #241
              </a>
            </>
          }
        />

        {/* Mobile — stacked card per row */}
        <div className="md:hidden" style={{ marginTop: 16 }}>
          {profile.rows.map((row) => (
            <div
              key={row.id}
              style={{
                border: "1px solid var(--v4-line-300)",
                background: "var(--v4-bg-050)",
                padding: "12px 14px",
                marginBottom: 10,
                borderRadius: 4,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  color: "var(--v4-ink-000)",
                }}
              >
                {row.label}
              </h3>
              {row.description ? (
                <p
                  style={{
                    margin: "4px 0 12px",
                    fontSize: 11,
                    color: "var(--v4-ink-400)",
                  }}
                >
                  {row.description}
                </p>
              ) : null}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--v4-ink-400)",
                      marginBottom: 6,
                    }}
                  >
                    {SITE_NAME}
                  </span>
                  <Cell cell={row.trendingrepo} />
                </div>
                <div>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--v4-ink-400)",
                      marginBottom: 6,
                    }}
                  >
                    {profile.displayName}
                  </span>
                  <Cell cell={row.competitor} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop — table */}
        <div className="hidden md:block" style={{ marginTop: 16 }}>
          <div
            style={{
              border: "1px solid var(--v4-line-300)",
              background: "var(--v4-bg-050)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--v4-line-300)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--v4-ink-400)",
                      width: "26%",
                    }}
                  >
                    Capability
                  </th>
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--v4-money)",
                    }}
                  >
                    {SITE_NAME}
                  </th>
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--v4-ink-300)",
                    }}
                  >
                    {profile.displayName}
                  </th>
                </tr>
              </thead>
              <tbody>
                {profile.rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: "1px solid var(--v4-line-300)",
                      background:
                        idx % 2 === 1 ? "rgba(255,255,255,0.015)" : undefined,
                    }}
                  >
                    <th
                      scope="row"
                      style={{
                        textAlign: "left",
                        padding: "14px 16px",
                        verticalAlign: "top",
                        fontWeight: 500,
                        color: "var(--v4-ink-000)",
                      }}
                    >
                      <div>{row.label}</div>
                      {row.description ? (
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: 11,
                            lineHeight: 1.4,
                            color: "var(--v4-ink-400)",
                          }}
                        >
                          {row.description}
                        </p>
                      ) : null}
                    </th>
                    <td
                      style={{ padding: "14px 16px", verticalAlign: "top" }}
                    >
                      <Cell cell={row.trendingrepo} />
                    </td>
                    <td
                      style={{ padding: "14px 16px", verticalAlign: "top" }}
                    >
                      <Cell cell={row.competitor} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--v4-ink-400)",
            lineHeight: 1.5,
          }}
        >
          ✓ shipped · ~ partial / close · ✗ not present · — not confirmed.
          Each row links back to the same competitor crawl evidence (toolbox
          PR #241, deltas captured 2026-06-15).
        </p>
      </section>

      <section
        aria-labelledby={`why-${profile.slug}-heading`}
        style={{ marginTop: 48 }}
      >
        <SectionHead
          num="// 02"
          title={
            <span id={`why-${profile.slug}-heading`}>
              Why the deltas matter
            </span>
          }
          meta={
            <>
              <b>{profile.whyItMatters.length}</b> panels
            </>
          }
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
            marginTop: 16,
          }}
        >
          {profile.whyItMatters.map((panel, idx) => (
            <article
              key={panel.title}
              style={{
                border: "1px solid var(--v4-line-300)",
                background: "var(--v4-bg-050)",
                padding: "16px 18px",
                borderRadius: 4,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--v4-ink-400)",
                }}
              >
                {`// 0${idx + 1}`}
              </p>
              <h3
                style={{
                  margin: "8px 0 10px",
                  fontFamily: "var(--v4-sans)",
                  fontSize: 17,
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                  color: "var(--v4-ink-000)",
                }}
              >
                {panel.title}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--v4-sans)",
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "var(--v4-ink-300)",
                }}
              >
                {panel.body}
              </p>
              {panel.href ? (
                <p style={{ margin: "12px 0 0" }}>
                  <Link
                    href={panel.href}
                    style={{
                      fontSize: 12,
                      color: "var(--v4-money)",
                      textDecoration: "underline",
                      textDecorationStyle: "dotted",
                    }}
                  >
                    {panel.hrefLabel ?? "Read more"} →
                  </Link>
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby={`cta-${profile.slug}-heading`}
        style={{
          marginTop: 48,
          padding: "24px 24px",
          border: "1px solid var(--v4-line-300)",
          background: "var(--v4-bg-050)",
          borderRadius: 4,
        }}
      >
        <h2
          id={`cta-${profile.slug}-heading`}
          style={{
            margin: 0,
            fontFamily: "var(--v4-sans)",
            fontSize: 22,
            letterSpacing: "-0.015em",
            color: "var(--v4-ink-000)",
          }}
        >
          See the 11-source consensus in action.
        </h2>
        <p
          style={{
            margin: "10px 0 18px",
            fontFamily: "var(--v4-sans)",
            fontSize: 14,
            color: "var(--v4-ink-300)",
            maxWidth: 640,
            lineHeight: 1.55,
          }}
        >
          Open the live trending board, sign in for webhook + Slack alerts, or
          read the methodology to inspect how every score is computed.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 36,
              padding: "8px 16px",
              background: "var(--v4-money)",
              color: "var(--v4-bg-000)",
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRadius: 3,
            }}
          >
            Live board →
          </Link>
          <Link
            href="/pricing"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 36,
              padding: "8px 16px",
              border: "1px solid var(--v4-line-300)",
              color: "var(--v4-ink-000)",
              fontWeight: 500,
              fontSize: 13,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRadius: 3,
            }}
          >
            Pricing
          </Link>
          <Link
            href="/methodology"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 36,
              padding: "8px 16px",
              border: "1px solid var(--v4-line-300)",
              color: "var(--v4-ink-300)",
              fontWeight: 500,
              fontSize: 13,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRadius: 3,
            }}
          >
            Methodology
          </Link>
        </div>
      </section>

      <footer
        style={{
          marginTop: 36,
          paddingTop: 16,
          borderTop: "1px solid var(--v4-line-300)",
          fontSize: 11,
          color: "var(--v4-ink-400)",
          lineHeight: 1.6,
        }}
      >
        Evidence:{" "}
        <a
          href={EVIDENCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--v4-ink-300)" }}
        >
          toolbox PR #241 (deltas.md, 2026-06-15)
        </a>{" "}
        · Companion PRs cover L1 / F4 / C-CAT / Tier-C closes. Comparison is
        captured against{" "}
        <a
          href={profile.homepage}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {profile.displayName}
        </a>{" "}
        at the time of the crawl; rows update when the next crawl ships.
      </footer>
    </main>
  );
}
