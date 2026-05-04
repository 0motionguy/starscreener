// StarScreener - Category detail.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CATEGORIES } from "@/lib/constants";
import { getCategoryIcon } from "@/lib/category-icons";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getDerivedCategoryStats } from "@/lib/derived-insights";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { formatNumber } from "@/lib/utils";
import type { Repo } from "@/lib/types";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";
import { CategoryNewsRollup } from "@/components/categories/CategoryNewsRollup";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ window?: string | string[] }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.id === slug);
  const canonical = absoluteUrl(`/categories/${slug}`);
  if (!category) {
    return {
      title: `Category Not Found - ${SITE_NAME}`,
      description: "This category does not exist or was removed.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  const title = `${category.name} - ${SITE_NAME}`;
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

export default async function CategoryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.id === slug);
  if (!category) notFound();

  const repos = getDerivedRepos().filter((r) => r.categoryId === slug);
  const Icon = getCategoryIcon(category.icon);

  const heading = (
    <>
      <section className="page-head category-detail-head">
        <div>
          <div className="crumb">
            <Link href="/categories">Trend terminal / categories</Link>
            <span> / </span>
            <b>{category.name}</b>
          </div>
          <h1>
            {Icon && (
              <Icon
                size={28}
                style={{ color: category.color }}
                aria-hidden="true"
              />
            )}
            <span>{category.name}</span>
          </h1>
          <p className="lede">{category.description}</p>
        </div>
        <div className="clock">
          <span className="big">{repos.length}</span>
          <span className="live">repos tracked</span>
        </div>
      </section>

      <CategoryNewsRollup
        repos={repos}
        categorySlug={slug}
        categoryLabel={category.name}
      />
    </>
  );

  return (
    <TerminalLayout
      repos={repos}
      className="home-surface terminal-page category-detail-page"
      filterBarVariant="category"
      featuredCount={4}
      heading={heading}
    />
  );
}
