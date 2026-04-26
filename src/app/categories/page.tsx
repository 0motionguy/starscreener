// StarScreener — Categories hub (Phase 3)
//
// Server component. Simple stats grid showing every category with live
// repoCount + avgMomentum pulled from the pipeline facade. Each card
// links into its category-detail terminal surface.

import Link from "next/link";
import type { Metadata } from "next";

// ISR — data/*.json only changes on GHA scrape. 30-min edge cache skips
// the per-request getDerivedCategoryStats() recompute.
export const revalidate = 1800;
import { CATEGORIES } from "@/lib/constants";
import { getCategoryIcon } from "@/lib/category-icons";
import { getDerivedCategoryStats } from "@/lib/derived-insights";
import { MomentumBadge } from "@/components/shared/MomentumBadge";
import { formatNumber } from "@/lib/utils";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

const CATEGORIES_DESCRIPTION =
  "Browse every tracked GitHub repo sector — AI & ML, web frameworks, devtools, infra, databases, security, mobile, data, crypto, and Rust — each ranked by live momentum.";

export const metadata: Metadata = {
  title: `Categories — ${SITE_NAME}`,
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
    title: `Categories — ${SITE_NAME}`,
    description: CATEGORIES_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `Categories — ${SITE_NAME}`,
    description: CATEGORIES_DESCRIPTION,
  },
};

export default async function CategoriesPage() {
  const stats = new Map(
    getDerivedCategoryStats().map((s) => [s.categoryId, s]),
  );

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <h1
            className="v2-mono mb-3 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            CATEGORIES · REPO SECTORS · LIVE
            <span
              aria-hidden
              className="inline-block ml-1"
              style={{
                width: 6,
                height: 6,
                background: "var(--v2-acc)",
                borderRadius: 1,
                boxShadow: "0 0 6px var(--v2-acc-glow)",
              }}
            />
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[80ch]"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Browse every tracked GitHub repo sector — ranked by live
            momentum and activity.
          </p>
        </div>
      </section>

      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-6">
          <p className="v2-mono mb-3" style={{ color: "var(--v2-ink-300)" }}>
            <span aria-hidden>{"// "}</span>
            {CATEGORIES.length} CATEGORIES TRACKED
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATEGORIES.map((cat) => {
              const Icon = getCategoryIcon(cat.icon);
              const s = stats.get(cat.id);
              return (
                <Link
                  key={cat.id}
                  href={`/categories/${cat.id}`}
                  className="v2-card v2-card-hover overflow-hidden block group p-5"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {Icon && (
                      <Icon
                        size={20}
                        style={{ color: cat.color }}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      style={{
                        fontFamily:
                          "var(--font-geist), Inter, sans-serif",
                        fontWeight: 510,
                        fontSize: 16,
                        letterSpacing: "-0.012em",
                        color: "var(--v2-ink-000)",
                      }}
                      className="truncate"
                    >
                      {cat.name}
                    </span>
                  </div>
                  <p
                    className="line-clamp-2 leading-snug mb-4 text-[12px]"
                    style={{ color: "var(--v2-ink-300)" }}
                  >
                    {cat.description}
                  </p>
                  <div
                    className="flex items-center justify-between pt-3 v2-mono"
                    style={{ borderTop: "1px dashed var(--v2-line-200)" }}
                  >
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--v2-ink-300)" }}
                    >
                      {formatNumber(s?.repoCount ?? 0)} REPOS
                    </span>
                    <MomentumBadge
                      score={s?.avgMomentum ?? 0}
                      size="sm"
                      showLabel
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
