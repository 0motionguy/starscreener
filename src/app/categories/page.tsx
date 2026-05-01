// /categories — V4 list page.
//
// Migrated off the legacy `home-surface` chrome to V4 PageHead + VerdictRibbon
// + KpiBand + SectionHead. The grid keeps the per-category `<Link>` cards but
// styled with V4 tokens (--v4-*) instead of the V2/V3 `tool-grid` shells.
//
// Mockup reference: home.html § "// 02 Trending now" feel — caps mono headers
// with an accent verdict ribbon up top. Detail pages live at /categories/[slug].

import Link from "next/link";
import type { Metadata } from "next";

import { CATEGORIES } from "@/lib/constants";
import { getCategoryIcon } from "@/lib/category-icons";
import { getDerivedCategoryStats } from "@/lib/derived-insights";
import { formatNumber } from "@/lib/utils";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";

export const revalidate = 1800;

const CATEGORIES_DESCRIPTION =
  "Browse every tracked GitHub repo sector: AI and ML, web frameworks, devtools, infra, databases, security, mobile, data, crypto, and Rust.";

export const metadata: Metadata = {
  title: `Categories - ${SITE_NAME}`,
  description: CATEGORIES_DESCRIPTION,
  keywords: [
    "GitHub categories",
    "open source categories",
    "repo sectors",
    "momentum by category",
  ],
  alternates: { canonical: absoluteUrl("/categories") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/categories"),
    title: `Categories - ${SITE_NAME}`,
    description: CATEGORIES_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `Categories - ${SITE_NAME}`,
    description: CATEGORIES_DESCRIPTION,
  },
};

export default async function CategoriesPage() {
  const statsList = getDerivedCategoryStats();
  const stats = new Map(statsList.map((s) => [s.categoryId, s]));

  // KPI aggregates across the populated cohort.
  const totalRepos = statsList.reduce((sum, s) => sum + s.repoCount, 0);
  const totalStars = statsList.reduce((sum, s) => sum + s.totalStars, 0);
  const populated = statsList.filter((s) => s.repoCount > 0).length;
  const liveCategories = statsList.filter((s) => s.repoCount > 0);
  const avgMomentum =
    liveCategories.length > 0
      ? Number(
          (
            liveCategories.reduce((sum, s) => sum + s.avgMomentum, 0) /
            liveCategories.length
          ).toFixed(2),
        )
      : 0;

  // Hottest sector = highest avg momentum among populated categories.
  const hottest = [...liveCategories]
    .sort((a, b) => b.avgMomentum - a.avgMomentum)[0];
  const hottestCategory = hottest
    ? CATEGORIES.find((c) => c.id === hottest.categoryId)
    : undefined;

  return (
    <main className="home-surface categories-page">
      <PageHead
        crumb={
          <>
            <b>CATEGORIES</b> · TERMINAL · /CATEGORIES
          </>
        }
        h1="Repo sectors ranked by momentum."
        lede="Browse every tracked GitHub repo sector with live repo counts, average momentum, and direct jumps into each terminal surface."
        clock={
          <>
            <span className="big">{CATEGORIES.length}</span>
            <span className="muted">SECTORS</span>
            <LiveDot label="LIVE" />
          </>
        }
      />

      <VerdictRibbon
        tone="acc"
        stamp={{
          eyebrow: "// SECTOR INDEX",
          headline: `${populated} / ${CATEGORIES.length} populated`,
          sub: `${formatNumber(totalRepos)} repos tracked`,
        }}
        text={
          hottestCategory ? (
            <>
              Hottest sector right now is{" "}
              <span style={{ color: "var(--v4-acc)" }}>
                {hottestCategory.name}
              </span>{" "}
              with average momentum{" "}
              <b style={{ color: "var(--v4-ink-100)" }}>
                {hottest!.avgMomentum.toFixed(1)}
              </b>{" "}
              across <b>{formatNumber(hottest!.repoCount)}</b> repos.
            </>
          ) : (
            <>
              {CATEGORIES.length} sectors live. Pool is warming — repo counts
              repopulate after the next collector cycle.
            </>
          )
        }
        actionHref="#categories-grid"
        actionLabel="JUMP TO GRID →"
      />

      <KpiBand
        cells={[
          {
            label: "SECTORS · LIVE",
            value: `${populated} / ${CATEGORIES.length}`,
            sub: populated === CATEGORIES.length ? "all populated" : "with repo data",
            tone: populated === CATEGORIES.length ? "money" : "default",
            pip: "var(--v4-acc)",
          },
          {
            label: "REPOS · TRACKED",
            value: formatNumber(totalRepos),
            sub: "across all sectors",
            pip: "var(--v4-ink-300)",
          },
          {
            label: "COMBINED STARS",
            value: formatNumber(totalStars),
            sub: "lifetime totals",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "AVG MOMENTUM",
            value: avgMomentum.toFixed(1),
            sub: liveCategories.length > 0 ? "live cohort" : "no data",
            tone: "acc",
            pip: "var(--v4-amber)",
          },
        ]}
      />

      <SectionHead
        num="// 01"
        title="Sectors · ranked by momentum"
        meta={
          <>
            <b>{CATEGORIES.length}</b> total · <b>{populated}</b> populated
          </>
        }
      />

      <section
        id="categories-grid"
        className="v4-categories-grid"
        aria-label="Categories"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
          padding: "12px 0",
        }}
      >
        {CATEGORIES.map((cat) => {
          const Icon = getCategoryIcon(cat.icon);
          const s = stats.get(cat.id);
          const repoCount = s?.repoCount ?? 0;
          const avg = s?.avgMomentum ?? 0;
          return (
            <Link
              key={cat.id}
              href={`/categories/${cat.id}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 14,
                background: "var(--v4-bg-100)",
                border: "1px solid var(--v4-line-200)",
                borderTop: `2px solid ${cat.color}`,
                borderRadius: 4,
                color: "var(--v4-ink-100)",
                textDecoration: "none",
                transition: "background 120ms ease, border-color 120ms ease",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--v4-ink-400)",
                }}
              >
                {formatNumber(repoCount)} REPOS
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--v4-ink-000)",
                }}
              >
                {Icon && (
                  <Icon
                    size={18}
                    style={{ color: cat.color, flexShrink: 0 }}
                    aria-hidden="true"
                  />
                )}
                <span>{cat.name}</span>
              </span>
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: "var(--v4-ink-300)",
                  flex: 1,
                }}
              >
                {cat.description}
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  paddingTop: 6,
                  borderTop: "1px solid var(--v4-line-200)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--v4-ink-400)",
                }}
              >
                <span>
                  AVG MOM{" "}
                  <b style={{ color: "var(--v4-ink-100)" }}>
                    {avg.toFixed(1)}
                  </b>
                </span>
                <span style={{ color: "var(--v4-acc)" }} aria-hidden="true">
                  →
                </span>
              </span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
