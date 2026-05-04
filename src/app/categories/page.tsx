// StarScreener - Categories hub.

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
import { MomentumBadge } from "@/components/shared/MomentumBadge";

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
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Trend terminal</b> / categories
          </div>
          <h1>Repo sectors ranked by momentum.</h1>
          <p className="lede">
            Browse every tracked GitHub repo sector with live repo counts,
            average momentum, and direct jumps into each terminal surface.
          </p>
        </div>
        <div className="clock">
          <span className="big">{CATEGORIES.length}</span>
          <span className="live">sectors live</span>
        </div>
      </section>

      <section className="tool-grid categories-grid" aria-label="Categories">
        {CATEGORIES.map((cat) => {
          const Icon = getCategoryIcon(cat.icon);
          const s = stats.get(cat.id);
          const repoCount = s?.repoCount ?? 0;
          const avg = s?.avgMomentum ?? 0;
          return (
            <Link
              key={cat.id}
              href={`/categories/${cat.id}`}
              className="tool category-card"
              style={{ borderTopColor: cat.color }}
            >
              <span className="t-num">
                {formatNumber(s?.repoCount ?? 0)} repos
              </span>
              <span className="category-card-title">
                {Icon && (
                  <Icon
                    size={18}
                    style={{ color: cat.color }}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span>{cat.name}</span>
              </span>
              <span className="t-d">{cat.description}</span>
              <span className="t-foot">
                <MomentumBadge
                  score={s?.avgMomentum ?? 0}
                  size="sm"
                  showLabel
                />
                <span className="ar">-&gt;</span>
              </span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
