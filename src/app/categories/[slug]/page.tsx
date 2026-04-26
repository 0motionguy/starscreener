// /categories/[slug] — V2 category detail.
//
// Server component. Resolves the category from the slug, loads the full
// set of repos in that category via the pipeline facade, and renders a
// V2 page: TerminalBar, breadcrumb, .v2-display title, news rollup,
// and TrendingTableV2.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CATEGORIES } from "@/lib/constants";
import { getCategoryIcon } from "@/lib/category-icons";
import { getDerivedRepos } from "@/lib/derived-repos";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { TrendingTableV2 } from "@/components/today-v2/TrendingTableV2";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { CategoryNewsRollup } from "@/components/categories/CategoryNewsRollup";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.id === slug);
  const canonical = absoluteUrl(`/categories/${slug}`);
  if (!category) {
    return {
      title: `Category Not Found — ${SITE_NAME}`,
      description: "This category doesn't exist or was removed.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  const title = `${category.name} — ${SITE_NAME}`;
  const description = `${category.description}. Live momentum ranks for every ${category.shortName} repo on ${SITE_NAME}.`;
  return {
    title,
    description,
    keywords: [
      category.name,
      category.shortName,
      "GitHub category",
      "open source",
      "repo momentum",
    ],
    alternates: { canonical },
    openGraph: {
      type: "website",
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

export default async function CategoryDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.id === slug);
  if (!category) notFound();

  const repos = getDerivedRepos().filter((repo) => repo.categoryId === slug);
  const Icon = getCategoryIcon(category.icon);

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>CATEGORY ·{" "}
                {category.shortName.toUpperCase()}
              </>
            }
            status={`${repos.length} REPO${repos.length === 1 ? "" : "S"}`}
          />

          <nav
            aria-label="Breadcrumb"
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-400)",
              fontSize: 11,
              letterSpacing: "0.20em",
            }}
          >
            <Link href="/" style={{ color: "var(--v2-ink-300)" }}>
              HOME
            </Link>
            <span aria-hidden>›</span>
            <Link
              href="/categories"
              style={{ color: "var(--v2-ink-300)" }}
            >
              CATEGORIES
            </Link>
            <span aria-hidden>›</span>
            <span style={{ color: "var(--v2-ink-100)" }}>
              {category.name.toUpperCase()}
            </span>
          </nav>

          <div className="mt-6 flex items-center gap-3">
            {Icon ? (
              <Icon
                size={32}
                style={{ color: category.color }}
                aria-hidden="true"
              />
            ) : null}
            <h1
              className="v2-display"
              style={{
                fontSize: "clamp(28px, 4vw, 44px)",
                color: "var(--v2-ink-000)",
              }}
            >
              {category.name}
            </h1>
          </div>
          <p
            className="mt-3 text-[14px] leading-relaxed max-w-[80ch]"
            style={{ color: "var(--v2-ink-200)" }}
          >
            {category.description}
          </p>
        </div>
      </section>

      {/* News rollup */}
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-6">
          <p
            className="v2-mono mb-3"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            NEWS · ROLLUP · {category.shortName.toUpperCase()}
          </p>
          <CategoryNewsRollup
            repos={repos}
            categorySlug={slug}
            categoryLabel={category.name}
          />
        </div>
      </section>

      <TrendingTableV2 repos={repos} sortBy="delta24h" limit={50} />
    </>
  );
}
