// StarScreener — Categories hub (Phase 3)
//
// Server component. Simple stats grid showing every category with live
// repoCount + avgMomentum pulled from the pipeline facade. Each card
// links into its category-detail terminal surface.

import Link from "next/link";
import type { Metadata } from "next";
import { pipeline } from "@/lib/pipeline/pipeline";
import { CATEGORIES } from "@/lib/constants";
import { getCategoryIcon } from "@/lib/category-icons";
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
  // Hydrate persisted state (or fall back to mock seed) before the first read.
  await pipeline.ensureReady();
  const stats = new Map(
    pipeline.getCategoryStats().map((s) => [s.categoryId, s]),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
          Categories
        </h1>
        <p className="text-text-secondary">
          Repo sectors ranked by momentum and activity.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES.map((cat, i) => {
          const Icon = getCategoryIcon(cat.icon);
          const s = stats.get(cat.id);
          return (
            <Link
              key={cat.id}
              href={`/categories/${cat.id}`}
              className="block bg-bg-card border border-border-primary rounded-[var(--radius-card)] p-5 hover:border-brand/40 hover:bg-bg-card-hover transition-all animate-slide-up opacity-0"
              style={{
                animationDelay: `${i * 40}ms`,
                animationFillMode: "both",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                {Icon && (
                  <Icon
                    size={22}
                    style={{ color: cat.color }}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="font-semibold text-lg text-text-primary truncate">
                  {cat.name}
                </span>
              </div>
              <p className="text-sm text-text-secondary line-clamp-2 leading-snug mb-4">
                {cat.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-text-tertiary">
                  {formatNumber(s?.repoCount ?? 0)} repos
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
  );
}
